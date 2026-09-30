#!/usr/bin/env node
/**
 * Packages the server single-executable into a self-contained per-platform
 * archive: the `t3` binary, the web client, and a production install of the
 * native packages the bundle keeps external. The archive is the unit every
 * runtime installer downloads, so nothing in it may require Node, npm, or a
 * compiler on the machine that unpacks it.
 *
 * Layout inside the archive (a single top-level directory named after the
 * archive stem):
 *
 *   t3              the single-executable
 *   client/         web app served by the server
 *   node_modules/   runtime externals, when the server declares any
 */
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { HostProcessArchitecture, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { fromYaml } from "@t3tools/shared/schemaYaml";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import rootPackageJson from "../package.json" with { type: "json" };
import serverPackageJson from "../apps/server/package.json" with { type: "json" };

import {
  createStagePatchedDependencies,
  createStageWorkspaceConfig,
  STAGE_INSTALL_ARGS,
} from "./build-desktop-artifact.ts";
import { selectCliRuntimeExternalDependencies } from "./lib/cli-external-packages.ts";
import { resolveCatalogDependencies } from "./lib/resolve-catalog.ts";

const BuildPlatform = Schema.Literals(["mac", "linux"]);
const BuildArch = Schema.Literals(["arm64", "x64"]);
type BuildPlatform = typeof BuildPlatform.Type;
type BuildArch = typeof BuildArch.Type;

const WorkspaceConfig = Schema.Struct({
  catalog: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  overrides: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  patchedDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  allowBuilds: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
});
const decodeWorkspaceConfig = Schema.decodeEffect(fromYaml(WorkspaceConfig));
const encodeJsonString = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
const StageWorkspaceConfig = Schema.Struct({
  supportedArchitectures: Schema.Struct({
    os: Schema.Array(Schema.String),
    cpu: Schema.Array(Schema.String),
    libc: Schema.optional(Schema.Array(Schema.String)),
  }),
  allowBuilds: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
  patchedDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  overrides: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  nodeLinker: Schema.optional(Schema.Literals(["hoisted"])),
});
const encodeStageWorkspaceConfig = Schema.encodeEffect(fromYaml(StageWorkspaceConfig));

const RepoRoot = Effect.service(Path.Path).pipe(
  Effect.flatMap((path) => path.fromFileUrl(new URL("..", import.meta.url))),
);

export class CliArchiveCommandFailedError extends Schema.TaggedError<CliArchiveCommandFailedError>()(
  "CliArchiveCommandFailedError",
  { command: Schema.String, exitCode: Schema.Int },
) {
  override get message(): string {
    return `${this.command} exited with code ${this.exitCode}.`;
  }
}

export class CliArchiveInputMissingError extends Schema.TaggedError<CliArchiveInputMissingError>()(
  "CliArchiveInputMissingError",
  { inputPath: Schema.String, hint: Schema.String },
) {
  override get message(): string {
    return `Missing ${this.inputPath}. ${this.hint}`;
  }
}

/** Platform/arch pair as it appears in archive names and `process.platform`/`process.arch`. */
export function cliArchivePlatformKey(platform: BuildPlatform, arch: BuildArch): string {
  return `${platform === "mac" ? "darwin" : "linux"}-${arch}`;
}

export function cliArchiveStem(version: string, platform: BuildPlatform, arch: BuildArch): string {
  return `t3-${version}-${cliArchivePlatformKey(platform, arch)}`;
}

export function cliArchiveFileName(version: string, platform: BuildPlatform, arch: BuildArch) {
  // gzip rather than xz: GNU tar needs an external xz binary for -J, which
  // minimal hosts lack, while every tar (and Node's zlib) handles gzip alone.
  return `${cliArchiveStem(version, platform, arch)}.tar.gz`;
}

const runCommand = Effect.fn("runCommand")(function* (
  command: ChildProcess.Command,
  label: string,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  // Output is inherited so the build log shows what each tool did; a failing
  // signing or packaging step is otherwise a bare exit code.
  const child = yield* spawner.spawn(
    ChildProcess.isStandardCommand(command)
      ? ChildProcess.make(command.command, command.args, {
          ...command.options,
          stdout: "inherit",
          stderr: "inherit",
        })
      : command,
  );
  const exitCode = Number(yield* child.exitCode);
  if (exitCode !== 0) {
    return yield* new CliArchiveCommandFailedError({ command: label, exitCode });
  }
});

const requireInput = Effect.fn("requireInput")(function* (inputPath: string, hint: string) {
  const fs = yield* FileSystem.FileSystem;
  if (!(yield* fs.exists(inputPath))) {
    return yield* new CliArchiveInputMissingError({ inputPath, hint });
  }
});

/**
 * Installs the runtime-external packages into `stageDir/node_modules` with a
 * hoisted, symlink-free layout. The tree is archived and unpacked on machines
 * without pnpm, so the store layout cannot be relied on to survive the trip.
 * A server without runtime externals ships no `node_modules` at all.
 */
const stageRuntimeExternals = Effect.fn("stageRuntimeExternals")(function* (input: {
  readonly repoRoot: string;
  readonly stageDir: string;
  readonly platform: BuildPlatform;
  readonly arch: BuildArch;
  readonly version: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspace = yield* decodeWorkspaceConfig(
    yield* fs.readFileString(path.join(input.repoRoot, "pnpm-workspace.yaml")),
  );
  const catalog = workspace.catalog ?? {};
  const serverDependencies = resolveCatalogDependencies(
    serverPackageJson.dependencies,
    catalog,
    "apps/server",
  );
  const dependencies = selectCliRuntimeExternalDependencies(serverDependencies);
  if (Object.keys(dependencies).length === 0) return;
  const patchedDependencies = createStagePatchedDependencies(
    workspace.patchedDependencies ?? {},
    dependencies,
  );

  yield* fs.writeFileString(
    path.join(input.stageDir, "package.json"),
    `${yield* encodeJsonString({
      name: "t3-runtime",
      version: input.version,
      private: true,
      packageManager: rootPackageJson.packageManager,
      dependencies,
    })}\n`,
  );
  yield* fs.writeFileString(
    path.join(input.stageDir, "pnpm-workspace.yaml"),
    yield* encodeStageWorkspaceConfig({
      ...createStageWorkspaceConfig({
        platform: input.platform,
        arch: input.arch,
        ...(workspace.allowBuilds ? { allowBuilds: workspace.allowBuilds } : {}),
        patchedDependencies,
        overrides: resolveCatalogDependencies(workspace.overrides ?? {}, catalog, "apps/server"),
      }),
      nodeLinker: "hoisted",
    }),
  );
  if (Object.keys(patchedDependencies).length > 0) {
    yield* fs.copy(path.join(input.repoRoot, "patches"), path.join(input.stageDir, "patches"));
  }

  const install = yield* resolveSpawnCommand("vp", [...STAGE_INSTALL_ARGS]);
  yield* runCommand(
    ChildProcess.make(install.command, install.args, {
      cwd: input.stageDir,
      shell: install.shell,
      stdout: "inherit",
      stderr: "inherit",
    }),
    "vp install --prod (cli archive runtime externals)",
  );

  // pnpm's bookkeeping and the manifest only matter to pnpm; the runtime
  // resolves packages by directory.
  for (const entry of [
    "package.json",
    "pnpm-workspace.yaml",
    "pnpm-lock.yaml",
    "patches",
    "node_modules/.pnpm",
    "node_modules/.modules.yaml",
    "node_modules/.pnpm-workspace-state-v1.json",
    "node_modules/.bin",
  ]) {
    yield* fs.remove(path.join(input.stageDir, entry), { recursive: true, force: true });
  }
  // A hoisted install still leaves nested `node_modules/.bin` shim directories
  // inside packages that declare bins. They are symlinks
  // nothing runs, and the npm registry refuses a tarball that contains any
  // symlink, so strip every `.bin` directory below node_modules.
  yield* removeNestedBinDirectories(fs, path, path.join(input.stageDir, "node_modules"));
});

const removeNestedBinDirectories = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
): Effect.Effect<void, PlatformError.PlatformError> =>
  Effect.gen(function* () {
    const entries = yield* fs.readDirectory(root).pipe(Effect.orElseSucceed(() => []));
    for (const entry of entries) {
      const child = path.join(root, entry);
      if (entry === ".bin") {
        yield* fs.remove(child, { recursive: true, force: true });
        continue;
      }
      const info = yield* fs.stat(child).pipe(Effect.option);
      if (Option.isSome(info) && info.value.type === "Directory") {
        yield* removeNestedBinDirectories(fs, path, child);
      }
    }
  });

/** Copies the web client without its sourcemaps, which nothing serves. */
const stageWebClient = Effect.fn("stageWebClient")(function* (source: string, target: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.copy(source, target);
  const maps = (yield* fs.readDirectory(target, { recursive: true })).filter((entry) =>
    entry.endsWith(".map"),
  );
  for (const entry of maps) {
    yield* fs.remove(path.join(target, entry), { force: true });
  }
});

const MacSigningConfig = Config.all({
  identity: Config.String("T3CODE_CLI_MAC_SIGN_IDENTITY").pipe(Config.option),
  appleApiKey: Config.String("APPLE_API_KEY").pipe(Config.option),
  appleApiKeyId: Config.String("APPLE_API_KEY_ID").pipe(Config.option),
  appleApiIssuer: Config.String("APPLE_API_ISSUER").pipe(Config.option),
});

/**
 * Apple Silicon refuses to run unsigned Mach-O binaries at all, so the
 * executable is always signed: ad hoc when no identity is configured, or with
 * the Developer ID plus notarization when it is. The hardened runtime that
 * notarization requires only loads signed libraries, so every native addon in
 * the archive is signed with the same identity.
 */
const signMacArchiveContents = Effect.fn("signMacArchiveContents")(function* (input: {
  readonly repoRoot: string;
  readonly contentDir: string;
  readonly executablePath: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const signing = yield* MacSigningConfig;
  const identity = Option.getOrUndefined(signing.identity)?.trim() || "-";

  const entitlements = path.join(input.repoRoot, "apps/server/resources/cli-entitlements.plist");
  const libraries = (yield* fs.readDirectory(input.contentDir, { recursive: true }))
    .filter((entry) => entry.endsWith(".node") || entry.endsWith(".dylib"))
    .map((entry) => path.join(input.contentDir, entry));

  for (const target of [...libraries, input.executablePath]) {
    yield* runCommand(
      ChildProcess.make("codesign", [
        "--force",
        "--sign",
        identity,
        ...(identity === "-" ? [] : ["--options", "runtime", "--timestamp"]),
        ...(target === input.executablePath ? ["--entitlements", entitlements] : []),
        target,
      ]),
      `codesign ${path.relative(input.contentDir, target)}`,
    );
  }
  if (identity === "-") {
    yield* Effect.log("[cli-archive] Signed ad hoc (no T3CODE_CLI_MAC_SIGN_IDENTITY).");
    return;
  }

  const apiKey = Option.getOrUndefined(signing.appleApiKey);
  const apiKeyId = Option.getOrUndefined(signing.appleApiKeyId);
  const apiIssuer = Option.getOrUndefined(signing.appleApiIssuer);
  if (!apiKey || !apiKeyId || !apiIssuer) {
    yield* Effect.logWarning(
      "[cli-archive] Developer ID signed but not notarized (missing APPLE_API_KEY*).",
    );
    return;
  }
  // notarytool only accepts archives, and a bare executable cannot be stapled,
  // so notarize a zip of the binary and rely on the online ticket lookup.
  const notarizeZip = path.join(path.dirname(input.executablePath), ".notarize-t3.zip");
  yield* runCommand(
    ChildProcess.make("ditto", ["-c", "-k", "--keepParent", input.executablePath, notarizeZip]),
    "ditto (notarization zip)",
  );
  yield* runCommand(
    ChildProcess.make("xcrun", [
      "notarytool",
      "submit",
      notarizeZip,
      "--key",
      apiKey,
      "--key-id",
      apiKeyId,
      "--issuer",
      apiIssuer,
      "--wait",
    ]),
    "notarytool submit",
  ).pipe(Effect.ensuring(fs.remove(notarizeZip, { force: true }).pipe(Effect.ignore)));
  yield* Effect.log("[cli-archive] Notarized t3.");
});

const buildCliArchive = Effect.fn("buildCliArchive")(function* (input: {
  readonly platform: BuildPlatform;
  readonly arch: BuildArch;
  readonly version: string;
  readonly outputDir: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repoRoot = yield* RepoRoot;
  const serverDir = path.join(repoRoot, "apps/server");
  const executableName = "t3";
  // tsdown suffixes cross-built executables with their target (t3-darwin-arm64);
  // a host build is plain t3. Prefer the exact target when both exist.
  const targetKey = cliArchivePlatformKey(input.platform, input.arch);
  const targetExecutable = path.join(serverDir, "dist-exe", `t3-${targetKey}`);
  // The unsuffixed host build is only a valid stand-in when it was built for
  // this platform and architecture; otherwise a missing target must fail.
  const hostKey = `${yield* HostProcessPlatform}-${yield* HostProcessArchitecture}`;
  const builtExecutable = (yield* fs.exists(targetExecutable))
    ? targetExecutable
    : targetKey === hostKey
      ? path.join(serverDir, "dist-exe", executableName)
      : targetExecutable;
  const webClient = path.join(serverDir, "dist/client");

  yield* requireInput(
    builtExecutable,
    `Run \`node apps/server/scripts/cli.ts build-exe --target ${targetKey}\` first.`,
  );
  yield* requireInput(path.join(webClient, "index.html"), "Run `vp run --filter t3 build` first.");

  const stem = cliArchiveStem(input.version, input.platform, input.arch);
  const stageRoot = yield* fs.makeTempDirectoryScoped({ prefix: "t3-cli-archive-" });
  const contentDir = path.join(stageRoot, stem);
  yield* fs.makeDirectory(contentDir, { recursive: true });

  yield* Effect.log(`[cli-archive] Staging ${stem}...`);
  yield* fs.copyFile(builtExecutable, path.join(contentDir, executableName));
  yield* stageWebClient(webClient, path.join(contentDir, "client"));
  yield* stageRuntimeExternals({
    repoRoot,
    stageDir: contentDir,
    platform: input.platform,
    arch: input.arch,
    version: input.version,
  });

  const executablePath = path.join(contentDir, executableName);
  if (input.platform === "mac") {
    yield* signMacArchiveContents({ repoRoot, contentDir, executablePath });
  }
  yield* fs.chmod(executablePath, 0o755);

  yield* fs.makeDirectory(input.outputDir, { recursive: true });
  const archivePath = path.join(
    input.outputDir,
    cliArchiveFileName(input.version, input.platform, input.arch),
  );
  yield* fs.remove(archivePath, { force: true });
  // On Linux, pnpm hard-links identical files out of its store and node-gyp
  // hard-links build outputs, and GNU tar records those as link entries.
  // The npm registry rejects a tarball containing any, and the npm platform
  // packages are re-packed from this archive's contents, so store every
  // file as a file. macOS's bsdtar has no such flag; pnpm clones there.
  yield* runCommand(
    ChildProcess.make("tar", [
      ...(input.platform === "linux" ? ["--hard-dereference"] : []),
      "-czf",
      archivePath,
      "-C",
      stageRoot,
      stem,
    ]),
    "tar (gzip)",
  );
  const stat = yield* fs.stat(archivePath);
  yield* Effect.log(`[cli-archive] Wrote ${archivePath} (${String(stat.size)} bytes).`);
  return archivePath;
});

const command = Command.make(
  "build-cli-archive",
  {
    platform: Flag.Literals("platform", BuildPlatform.literals),
    arch: Flag.Literals("arch", BuildArch.literals),
    version: Flag.String("version").pipe(
      Flag.withDescription("Release version for the archive name."),
    ),
    outputDir: Flag.String("output-dir").pipe(Flag.withDefault("release-cli")),
  },
  (input) => buildCliArchive(input).pipe(Effect.scoped),
).pipe(Command.withDescription("Package the t3 single-executable into a per-platform archive."));

if (import.meta.main) {
  Command.run(command, { version: "0.0.0" }).pipe(
    Effect.provide(Layer.mergeAll(Logger.layer([Logger.consolePretty()]), NodeServices.layer)),
    NodeRuntime.runMain,
  );
}
