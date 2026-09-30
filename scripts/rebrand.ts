#!/usr/bin/env node
/**
 * Renames the app. Reads the current identity from `packages/shared/src/brand.ts` and replaces
 * each of its values, wherever it appears as a whole token, in brand.ts and in the files that
 * cannot import it (package metadata, HTML, mobile config, workflows, install script, the docs,
 * the identity table in SCAFFOLD.md):
 *
 *   node scripts/rebrand.ts --name "Otter Calendar" --slug otter-calendar \
 *     --app-id dev.otterware.calendar --scheme ottercalendar \
 *     --repo otterware-app/otter-calendar --hosted-url https://calendar.otterware.dev \
 *     [--npm-scope @otterware] [--home-dir .otter-calendar] [--connect-name "Otter Connect"] \
 *     [--dry-run]
 *
 * Code that imports `BRAND` follows automatically. Run it on a clean tree and review the diff.
 */

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";

const Slug = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/));
const Name = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9 .'-]*$/));

export const BrandValues = Schema.Struct({
  displayName: Name,
  slug: Slug,
  appId: Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/)),
  urlScheme: Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9]*$/)),
  homeDirName: Schema.String.check(Schema.isPattern(/^\.[a-z0-9][a-z0-9._-]*$/)),
  npmScope: Schema.String.check(Schema.isPattern(/^@[a-z0-9][a-z0-9._-]*$/)),
  githubRepository: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)),
  hostedAppUrl: Schema.String.check(Schema.isPattern(/^https?:\/\/[a-z0-9.-]+(?::\d+)?$/)),
  connectName: Name,
});
export type BrandValues = typeof BrandValues.Type;

const decodeBrandValues = Schema.decodeUnknownEffect(BrandValues);

export class RebrandError extends Schema.TaggedError<RebrandError>()("RebrandError", {
  operation: Schema.Literals(["read-brand", "decode-brand", "read", "write", "verify"]),
  path: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Rebrand failed to ${this.operation} '${this.path}'.`;
  }
}

export const BRAND_MODULE_PATH = "packages/shared/src/brand.ts";

/**
 * Files carrying literal brand values, relative to the repository root. `*` matches within one
 * path segment. `lines` restricts rewriting to matching lines, for documents that also describe
 * the scaffold itself (its own repository, its history).
 */
export const REBRAND_TARGETS: ReadonlyArray<{ readonly pattern: string; readonly lines?: RegExp }> =
  [
    { pattern: BRAND_MODULE_PATH },
    { pattern: "apps/*/package.json" },
    { pattern: "apps/*/app.json" },
    { pattern: "apps/*/eas.json" },
    { pattern: "apps/*/index.html" },
    { pattern: "apps/*/public/*.webmanifest" },
    { pattern: "apps/desktop/resources/dmg/*.svg" },
    { pattern: ".github/workflows/*.yml" },
    { pattern: ".github/ISSUE_TEMPLATE/*.yml" },
    { pattern: "infra/relay/.env.example" },
    { pattern: "scripts/install.sh" },
    { pattern: "t3.json" },
    { pattern: "apps/mobile/README.md" },
    { pattern: "docs/README.md" },
    { pattern: "docs/user/*.md" },
    { pattern: "docs/operations/*.md" },
    { pattern: "docs/internals/*.md" },
    { pattern: "README.md", lines: /^# / },
    { pattern: "SCAFFOLD.md", lines: /^\| `\w+` / },
  ];

const readBrandField = (source: string, key: keyof BrandValues) =>
  new RegExp(`^\\s*${key}:\\s*"([^"]*)",?\\s*$`, "m").exec(source)?.[1];

/** The identity currently declared in brand.ts. */
export const readCurrentBrand = Effect.fn("readCurrentBrand")(function* (rootDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const brandPath = path.join(rootDir, BRAND_MODULE_PATH);
  const source = yield* fs
    .readFileString(brandPath)
    .pipe(
      Effect.mapError(
        (cause) => new RebrandError({ operation: "read-brand", path: brandPath, cause }),
      ),
    );
  const fields = Object.fromEntries(
    Object.keys(BrandValues.fields).map((key) => [
      key,
      readBrandField(source, key as keyof BrandValues),
    ]),
  );
  return yield* decodeBrandValues(fields).pipe(
    Effect.mapError(
      (cause) => new RebrandError({ operation: "decode-brand", path: brandPath, cause }),
    ),
  );
});

const escapeRegExp = (value: string) => value.replaceAll(/[.*+?^${}()|[\]\\/]/g, "\\$&");

// A token only matches whole: not inside a longer identifier, host name or path segment.
const NOT_TOKEN_BEFORE = "(?<![A-Za-z0-9])";
const NOT_TOKEN_AFTER = "(?![A-Za-z0-9])";

/** `Otter Scaffold` -> `OtterScaffold`, the prefix of generated names like the relay stack. */
const compactName = (displayName: string) => displayName.replaceAll(/[^A-Za-z0-9]/g, "");
/** `Otter Scaffold` -> `Otter-Scaffold`, as in release artifact file names. */
const hyphenatedName = (displayName: string) => displayName.replaceAll(" ", "-");
const hostOf = (url: string) => new URL(url).host;

/**
 * Old -> new token pairs, longest first. Every value of brand.ts, plus the forms derived from
 * them that appear in files: the hosted app's host and the hyphenated and compact display name.
 */
export const brandReplacements = (current: BrandValues, next: BrandValues) => {
  const pairs: Array<{ readonly from: string; readonly to: string; readonly prefixOnly: boolean }> =
    [
      ...Object.keys(BrandValues.fields).map((key) => ({
        from: current[key as keyof BrandValues],
        to: next[key as keyof BrandValues],
        prefixOnly: false,
      })),
      { from: hostOf(current.hostedAppUrl), to: hostOf(next.hostedAppUrl), prefixOnly: false },
      {
        from: hyphenatedName(current.displayName),
        to: hyphenatedName(next.displayName),
        prefixOnly: false,
      },
      {
        from: compactName(current.displayName),
        to: compactName(next.displayName),
        prefixOnly: true,
      },
    ];
  return pairs
    .filter((pair) => pair.from !== pair.to)
    .toSorted((left, right) => right.from.length - left.from.length);
};

/** Replaces every token in one pass, so a new value is never rewritten again. */
export const replaceBrandTokens = (
  text: string,
  replacements: ReturnType<typeof brandReplacements>,
): { readonly text: string; readonly count: number } => {
  if (replacements.length === 0) return { text, count: 0 };
  const pattern = new RegExp(
    replacements
      .map(
        ({ from, prefixOnly }) =>
          `(${NOT_TOKEN_BEFORE}${escapeRegExp(from)}${prefixOnly ? "" : NOT_TOKEN_AFTER})`,
      )
      .join("|"),
    "g",
  );
  let count = 0;
  const replaced = text.replaceAll(pattern, (...groups: Array<string | undefined>) => {
    const index = groups
      .slice(1, replacements.length + 1)
      .findIndex((group) => group !== undefined);
    count += 1;
    return replacements[index]!.to;
  });
  return { text: replaced, count };
};

const listMatchingFiles = Effect.fn("listMatchingFiles")(function* (
  rootDir: string,
  pattern: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  let candidates = [rootDir];
  for (const segment of pattern.split("/")) {
    const next: Array<string> = [];
    for (const directory of candidates) {
      if (!segment.includes("*")) {
        next.push(path.join(directory, segment));
        continue;
      }
      const matcher = new RegExp(`^${segment.split("*").map(escapeRegExp).join("[^/]*")}$`);
      const entries = yield* fs.readDirectory(directory).pipe(Effect.orElseSucceed(() => []));
      for (const entry of entries.toSorted()) {
        if (matcher.test(entry)) next.push(path.join(directory, entry));
      }
    }
    candidates = next;
  }
  const files: Array<string> = [];
  for (const candidate of candidates) {
    const info = yield* fs.stat(candidate).pipe(Effect.option);
    if (Option.isSome(info) && info.value.type === "File") files.push(candidate);
  }
  return files;
});

const rewriteText = (
  text: string,
  replacements: ReturnType<typeof brandReplacements>,
  lines: RegExp | undefined,
) => {
  if (lines === undefined) return replaceBrandTokens(text, replacements);
  let count = 0;
  const rewritten = text
    .split("\n")
    .map((line) => {
      if (!lines.test(line)) return line;
      const result = replaceBrandTokens(line, replacements);
      count += result.count;
      return result.text;
    })
    .join("\n");
  return { text: rewritten, count };
};

export interface RebrandFileChange {
  readonly path: string;
  readonly replacements: number;
  readonly lines: ReadonlyArray<{ readonly before: string; readonly after: string }>;
}

/** Rewrites every target from the current brand to `next`; returns what changed. */
export const rebrand = Effect.fn("rebrand")(function* (
  next: BrandValues,
  options: { readonly rootDir: string; readonly dryRun: boolean },
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const current = yield* readCurrentBrand(options.rootDir);
  const replacements = brandReplacements(current, next);
  const changes: Array<RebrandFileChange> = [];

  for (const target of REBRAND_TARGETS) {
    for (const filePath of yield* listMatchingFiles(options.rootDir, target.pattern)) {
      const before = yield* fs
        .readFileString(filePath)
        .pipe(
          Effect.mapError(
            (cause) => new RebrandError({ operation: "read", path: filePath, cause }),
          ),
        );
      const after = rewriteText(before, replacements, target.lines);
      if (after.count === 0) continue;
      const beforeLines = before.split("\n");
      const afterLines = after.text.split("\n");
      changes.push({
        path: path.relative(options.rootDir, filePath),
        replacements: after.count,
        lines: beforeLines.flatMap((line, index) =>
          line === afterLines[index] ? [] : [{ before: line, after: afterLines[index] ?? "" }],
        ),
      });
      if (!options.dryRun) {
        yield* fs
          .writeFileString(filePath, after.text)
          .pipe(
            Effect.mapError(
              (cause) => new RebrandError({ operation: "write", path: filePath, cause }),
            ),
          );
      }
    }
  }

  if (!options.dryRun) {
    const written = yield* readCurrentBrand(options.rootDir);
    if (!Schema.toEquivalence(BrandValues)(written, next)) {
      return yield* new RebrandError({
        operation: "verify",
        path: path.join(options.rootDir, BRAND_MODULE_PATH),
        cause: new Error("brand.ts does not hold the requested values after rewriting."),
      });
    }
  }

  return { current, changes };
});

const printChanges = (
  changes: ReadonlyArray<RebrandFileChange>,
  dryRun: boolean,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (changes.length === 0) {
      yield* Console.log("Nothing to change: the files already carry these values.");
      return;
    }
    for (const change of changes) {
      yield* Console.log(`${change.path} (${change.replacements})`);
      for (const line of change.lines) {
        yield* Console.log(`  - ${line.before.trim()}`);
        yield* Console.log(`  + ${line.after.trim()}`);
      }
    }
    const total = changes.reduce((sum, change) => sum + change.replacements, 0);
    yield* Console.log(
      `${dryRun ? "Would replace" : "Replaced"} ${total} value(s) in ${changes.length} file(s).`,
    );
  });

export const rebrandCommand = Command.make(
  "rebrand",
  {
    name: Flag.String("name").pipe(Flag.withDescription('Display name, e.g. "Otter Calendar".')),
    slug: Flag.String("slug").pipe(Flag.withDescription("Lowercase hyphenated name.")),
    appId: Flag.String("app-id").pipe(Flag.withDescription("Reverse-DNS application ID.")),
    scheme: Flag.String("scheme").pipe(Flag.withDescription("Custom URL scheme.")),
    repo: Flag.String("repo").pipe(Flag.withDescription("GitHub repository, owner/name.")),
    hostedUrl: Flag.String("hosted-url").pipe(Flag.withDescription("Hosted web app origin.")),
    npmScope: Flag.String("npm-scope").pipe(
      Flag.withDescription("npm scope for the platform CLI packages (default: unchanged)."),
      Flag.optional,
    ),
    homeDir: Flag.String("home-dir").pipe(
      Flag.withDescription("Data home directory name (default: .<slug>)."),
      Flag.optional,
    ),
    connectName: Flag.String("connect-name").pipe(
      Flag.withDescription(
        'Name of account-based remote access, e.g. "Otter Connect" (default: unchanged).',
      ),
      Flag.optional,
    ),
    root: Flag.String("root").pipe(
      Flag.withDescription("Repository root (default: this script's repository)."),
      Flag.optional,
    ),
    dryRun: Flag.Boolean("dry-run").pipe(
      Flag.withDescription("Print the changes without writing them."),
      Flag.withDefault(false),
    ),
  },
  (flags) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const rootDir = Option.getOrElse(flags.root, () => path.resolve(import.meta.dirname, ".."));
      const current = yield* readCurrentBrand(rootDir);
      const next = yield* decodeBrandValues({
        displayName: flags.name.trim(),
        slug: flags.slug,
        appId: flags.appId,
        urlScheme: flags.scheme,
        homeDirName: Option.getOrElse(flags.homeDir, () => `.${flags.slug}`),
        npmScope: Option.getOrElse(flags.npmScope, () => current.npmScope),
        githubRepository: flags.repo,
        hostedAppUrl: flags.hostedUrl.replace(/\/+$/, ""),
        connectName: Option.getOrElse(flags.connectName, () => current.connectName).trim(),
      });
      const { changes } = yield* rebrand(next, { rootDir, dryRun: flags.dryRun });
      yield* printChanges(changes, flags.dryRun);
    }),
).pipe(
  Command.withDescription("Rename the app across brand.ts and the files that cannot import it."),
);

if (import.meta.main) {
  Command.run(rebrandCommand, { version: "0.0.0" }).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
