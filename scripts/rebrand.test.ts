import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { rebrand, readCurrentBrand, type BrandValues } from "./rebrand.ts";

const BRAND_SOURCE = `/** The app's identity. Data lives in \`~/.otter-scaffold\`. */
export const BRAND = {
  displayName: "Otter Scaffold",
  slug: "otter-scaffold",
  appId: "dev.otterware.scaffold",
  urlScheme: "otterscaffold",
  homeDirName: ".otter-scaffold",
  /** Platform packages: \`@otterware/otter-scaffold-darwin-arm64\`. */
  npmScope: "@otterware",
  githubRepository: "otterware-app/otter-scaffold",
  hostedAppUrl: "https://scaffold.otterware.dev",
  connectName: "Otter Connect",
} as const;
`;

const FIXTURE_FILES: Record<string, string> = {
  "packages/shared/src/brand.ts": BRAND_SOURCE,
  "apps/desktop/package.json": `{\n  "name": "@t3tools/desktop",\n  "productName": "Otter Scaffold"\n}\n`,
  "apps/web/index.html": `<title>Otter Scaffold</title>\n<meta name="apple-mobile-web-app-title" content="Otter Scaffold" />\n`,
  ".github/workflows/release.yml": [
    "env:",
    "  RELAY_STATE: OtterScaffoldRelay/prod/output",
    "  ARTIFACT: Otter-Scaffold-mac-arm64.dmg",
    "  REPO: otterware-app/otter-scaffold",
    "  BUNDLE_ID: dev.otterware.scaffold.dev",
    "  HOSTED: https://scaffold.otterware.dev/connect",
    "  SCHEME: otterscaffold-dev://app/",
    "  UNRELATED: otterscaffolding otter-scaffolds relay.otterware.dev",
    "",
  ].join("\n"),
  "scripts/install.sh": `REPO="otterware-app/otter-scaffold"\nHOME_DIR="$HOME/.otter-scaffold"\nCOMMAND="otter-scaffold"\n`,
  "apps/mobile/README.md":
    "# Otter Scaffold mobile\n\nThe dev build is `dev.otterware.scaffold.dev`.\n",
  "docs/user/remote-access.md":
    "Sign in to Otter Connect in Otter Scaffold, or run `otter-scaffold connect`.\n",
  "README.md": [
    "# Otter Scaffold",
    "",
    "git clone https://github.com/otterware-app/otter-scaffold.git",
    "",
  ].join("\n"),
  "SCAFFOLD.md": [
    "# Otter Scaffold",
    "| `displayName` | Otter Scaffold |",
    "| `homeDirName` | `.otter-scaffold` |",
    "Clone https://github.com/otterware-app/otter-scaffold.git to start.",
    "",
  ].join("\n"),
  // Not a rebrand target: code reads BRAND instead.
  "apps/web/src/title.ts": `export const title = "Otter Scaffold";\n`,
};

const CALENDAR: BrandValues = {
  displayName: "Otter Calendar",
  slug: "otter-calendar",
  appId: "dev.otterware.calendar",
  urlScheme: "ottercalendar",
  homeDirName: ".otter-calendar",
  npmScope: "@otterware",
  githubRepository: "otterware-app/otter-calendar",
  hostedAppUrl: "https://calendar.otterware.dev",
  connectName: "Calendar Connect",
};

const makeFixture = Effect.fn("makeFixture")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const rootDir = yield* fs.makeTempDirectoryScoped({ prefix: "rebrand-test-" });
  for (const [relativePath, contents] of Object.entries(FIXTURE_FILES)) {
    const filePath = path.join(rootDir, relativePath);
    yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
    yield* fs.writeFileString(filePath, contents);
  }
  const read = (relativePath: string) => fs.readFileString(path.join(rootDir, relativePath));
  return { rootDir, read };
});

it.layer(NodeServices.layer)("rebrand", (it) => {
  it.effect("rewrites brand.ts and the literal brand values in target files", () =>
    Effect.gen(function* () {
      const { rootDir, read } = yield* makeFixture();

      const { changes } = yield* rebrand(CALENDAR, { rootDir, dryRun: false });

      assert.deepEqual(yield* readCurrentBrand(rootDir), CALENDAR);
      const brandSource = yield* read("packages/shared/src/brand.ts");
      assert.include(brandSource, "Data lives in `~/.otter-calendar`");
      assert.include(brandSource, "`@otterware/otter-calendar-darwin-arm64`");
      assert.include(yield* read("apps/desktop/package.json"), `"productName": "Otter Calendar"`);
      assert.equal(
        yield* read("apps/web/index.html"),
        `<title>Otter Calendar</title>\n<meta name="apple-mobile-web-app-title" content="Otter Calendar" />\n`,
      );
      assert.equal(
        yield* read(".github/workflows/release.yml"),
        [
          "env:",
          "  RELAY_STATE: OtterCalendarRelay/prod/output",
          "  ARTIFACT: Otter-Calendar-mac-arm64.dmg",
          "  REPO: otterware-app/otter-calendar",
          "  BUNDLE_ID: dev.otterware.calendar.dev",
          "  HOSTED: https://calendar.otterware.dev/connect",
          "  SCHEME: ottercalendar-dev://app/",
          "  UNRELATED: otterscaffolding otter-scaffolds relay.otterware.dev",
          "",
        ].join("\n"),
      );
      assert.equal(
        yield* read("scripts/install.sh"),
        `REPO="otterware-app/otter-calendar"\nHOME_DIR="$HOME/.otter-calendar"\nCOMMAND="otter-calendar"\n`,
      );
      assert.equal(
        yield* read("apps/mobile/README.md"),
        "# Otter Calendar mobile\n\nThe dev build is `dev.otterware.calendar.dev`.\n",
      );
      assert.equal(
        yield* read("docs/user/remote-access.md"),
        "Sign in to Calendar Connect in Otter Calendar, or run `otter-calendar connect`.\n",
      );
      // Documents only change on their identity lines; the scaffold's own clone URL stays.
      assert.equal(
        yield* read("README.md"),
        "# Otter Calendar\n\ngit clone https://github.com/otterware-app/otter-scaffold.git\n",
      );
      assert.equal(
        yield* read("SCAFFOLD.md"),
        [
          "# Otter Scaffold",
          "| `displayName` | Otter Calendar |",
          "| `homeDirName` | `.otter-calendar` |",
          "Clone https://github.com/otterware-app/otter-scaffold.git to start.",
          "",
        ].join("\n"),
      );
      assert.equal(
        yield* read("apps/web/src/title.ts"),
        `export const title = "Otter Scaffold";\n`,
      );
      assert.deepEqual(
        changes.map((change) => change.path),
        [
          "packages/shared/src/brand.ts",
          "apps/desktop/package.json",
          "apps/web/index.html",
          ".github/workflows/release.yml",
          "scripts/install.sh",
          "apps/mobile/README.md",
          "docs/user/remote-access.md",
          "README.md",
          "SCAFFOLD.md",
        ],
      );

      const again = yield* rebrand(CALENDAR, { rootDir, dryRun: false });
      assert.deepEqual(again.changes, []);
    }).pipe(Effect.scoped),
  );

  it.effect("reports changes without writing on a dry run", () =>
    Effect.gen(function* () {
      const { rootDir, read } = yield* makeFixture();

      const { changes } = yield* rebrand(CALENDAR, { rootDir, dryRun: true });

      assert.deepEqual(changes.find((change) => change.path === "scripts/install.sh")?.lines, [
        {
          before: `REPO="otterware-app/otter-scaffold"`,
          after: `REPO="otterware-app/otter-calendar"`,
        },
        { before: `HOME_DIR="$HOME/.otter-scaffold"`, after: `HOME_DIR="$HOME/.otter-calendar"` },
        { before: `COMMAND="otter-scaffold"`, after: `COMMAND="otter-calendar"` },
      ]);
      for (const [relativePath, contents] of Object.entries(FIXTURE_FILES)) {
        assert.equal(yield* read(relativePath), contents);
      }
    }).pipe(Effect.scoped),
  );

  it.effect("rejects a brand.ts that does not declare every field", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { rootDir } = yield* makeFixture();
      yield* fs.writeFileString(
        path.join(rootDir, "packages/shared/src/brand.ts"),
        BRAND_SOURCE.replace(/^\s*slug:.*\n/m, ""),
      );

      const error = yield* rebrand(CALENDAR, { rootDir, dryRun: false }).pipe(Effect.flip);

      assert.equal(error._tag, "RebrandError");
      assert.equal(error.operation, "decode-brand");
    }).pipe(Effect.scoped),
  );
});
