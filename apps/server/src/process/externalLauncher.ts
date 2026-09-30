/**
 * ExternalLauncher - opens URLs in the host's default browser.
 *
 * Used by startup (`--open`) and the CLI sign-in flow.
 *
 * @module ExternalLauncher
 */
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

// ==============================
// Definitions
// ==============================

export class ExternalLauncherError extends Schema.TaggedError<ExternalLauncherError>()(
  "ExternalLauncherError",
  {
    target: Schema.String,
    command: Schema.String,
    args: Schema.Array(Schema.String),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to launch browser target '${this.target}' with '${[this.command, ...this.args].join(" ")}'`;
  }
}

interface ProcessLaunch {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly options: ChildProcess.CommandOptions;
}

const POWERSHELL_ARGUMENTS_PREFIX = [
  "-NoProfile",
  "-NonInteractive",
  "-ExecutionPolicy",
  "Bypass",
  "-EncodedCommand",
] as const;

const DETACHED_IGNORE_STDIO_OPTIONS = {
  detached: true,
  stdin: "ignore",
  stdout: "ignore",
  stderr: "ignore",
} as const satisfies ChildProcess.CommandOptions;

const compactEnv = (input: Record<string, Option.Option<string>>): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(input).flatMap(([key, value]) =>
      Option.match(value, {
        onNone: () => [],
        onSome: (resolved) => [[key, resolved]],
      }),
    ),
  );

const BrowserLaunchEnvConfig = Config.all({
  SYSTEMROOT: Config.String("SYSTEMROOT").pipe(Config.option),
  windir: Config.String("windir").pipe(Config.option),
  WSL_DISTRO_NAME: Config.String("WSL_DISTRO_NAME").pipe(Config.option),
  WSL_INTEROP: Config.String("WSL_INTEROP").pipe(Config.option),
  SSH_CONNECTION: Config.String("SSH_CONNECTION").pipe(Config.option),
  SSH_TTY: Config.String("SSH_TTY").pipe(Config.option),
  container: Config.String("container").pipe(Config.option),
}).pipe(Config.map(compactEnv));

const readBrowserLaunchEnv = BrowserLaunchEnvConfig.pipe(Effect.orElseSucceed(() => ({})));

/**
 * ExternalLauncher - Service tag for browser launch operations.
 */
export class ExternalLauncher extends Context.Service<
  ExternalLauncher,
  {
    /** Launch a URL target in the default browser. */
    readonly launchBrowser: (target: string) => Effect.Effect<void, ExternalLauncherError>;
  }
>()("t3/process/externalLauncher") {}

// ==============================
// Implementations
// ==============================

function encodeUtf16LeBase64(input: string): string {
  const bytes = new Uint8Array(input.length * 2);
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    bytes[index * 2] = code & 0xff;
    bytes[index * 2 + 1] = code >>> 8;
  }
  return Encoding.encodeBase64(bytes);
}

function escapePowerShellStringLiteral(input: string): string {
  return `'${input.replaceAll("'", "''")}'`;
}

function resolvePowerShellPath(env: NodeJS.ProcessEnv = {}): string {
  return `${env.SYSTEMROOT || env.windir || String.raw`C:\Windows`}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
}

function resolveWslPowerShellPath(): string {
  return "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
}

function shouldUseWindowsHostFromWsl(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = {},
): boolean {
  return (
    platform === "linux" &&
    (env.WSL_DISTRO_NAME !== undefined || env.WSL_INTEROP !== undefined) &&
    env.SSH_CONNECTION === undefined &&
    env.SSH_TTY === undefined &&
    env.container === undefined
  );
}

function resolveWindowsBrowserLaunch(target: string, command: string): ProcessLaunch {
  const encodedCommand = encodeUtf16LeBase64(
    `$ProgressPreference = 'SilentlyContinue'; Start ${escapePowerShellStringLiteral(target)}`,
  );
  return {
    command,
    args: [...POWERSHELL_ARGUMENTS_PREFIX, encodedCommand],
    options: {
      detached: true,
      shell: false,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    },
  };
}

function buildBrowserLaunch(
  target: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = {},
): ProcessLaunch {
  if (platform === "darwin") {
    return {
      command: "open",
      args: [target],
      options: DETACHED_IGNORE_STDIO_OPTIONS,
    };
  }

  if (platform === "win32") {
    return resolveWindowsBrowserLaunch(target, resolvePowerShellPath(env));
  }

  if (shouldUseWindowsHostFromWsl(platform, env)) {
    return resolveWindowsBrowserLaunch(target, resolveWslPowerShellPath());
  }

  return {
    command: "xdg-open",
    args: [target],
    options: DETACHED_IGNORE_STDIO_OPTIONS,
  };
}

const launchBrowser = Effect.fn("externalLauncher.launchBrowser")(function* (
  target: string,
): Effect.fn.Return<void, ExternalLauncherError, ChildProcessSpawner.ChildProcessSpawner> {
  const launch = buildBrowserLaunch(
    target,
    yield* HostProcessPlatform,
    yield* readBrowserLaunchEnv,
  );
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  yield* spawner.spawn(ChildProcess.make(launch.command, launch.args, launch.options)).pipe(
    Effect.flatMap((handle) => handle.unref),
    Effect.asVoid,
    Effect.scoped,
    Effect.mapError(
      (cause) =>
        new ExternalLauncherError({
          target,
          command: launch.command,
          args: launch.args,
          cause,
        }),
    ),
  );
});

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return ExternalLauncher.of({
    launchBrowser: (target) =>
      launchBrowser(target).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      ),
  });
});

export const layer = Layer.effect(ExternalLauncher, make);
