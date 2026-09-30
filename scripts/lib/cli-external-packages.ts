/**
 * The single source of truth for packages the server CLI bundle must NOT inline.
 *
 * Two consumers derive from this list, and they must never disagree:
 *
 * - apps/server/vite.config.ts decides what stays external to the bundle.
 * - scripts/build-desktop-artifact.ts and scripts/build-cli-archive.ts select
 *   the runtime dependency roots they install beside the bundle.
 *
 * A runtime package that is external but absent from that install fails as
 * soon as Node resolves it from the emitted bundle. Keeping every consumer on
 * one list prevents packaging from drifting away from the bundle boundary.
 *
 * Entries are matched as prefixes (`id.startsWith(prefix)`), so they also cover
 * a package's platform-specific siblings: `node-gyp-build` covers
 * `node-gyp-build-optional-packages`, `@clerk/electron-passkeys` covers its
 * per-platform binding packages.
 *
 * External because Node actually loads them from disk at runtime: native addons
 * (.node), the JS wrappers that dlopen them by real path, and the ordinary JS
 * packages those wrappers require. An external package is loaded from the real
 * filesystem, so its own `require` also resolves from the real filesystem; a
 * dependency that was bundled away exists only inside the emitted bundle and is
 * unreachable there. This closure is enforced by a test, not by inspection.
 */
export const CLI_RUNTIME_EXTERNAL_PREFIXES = [
  "@clerk/electron-passkeys",
  "node-gyp-build",
  "node-addon-api",
  // ws's optional accelerators. Nothing in this repo declares them, so they are
  // not in the staged production install and the packaged app does not ship
  // them either way -- ws wraps the require in try/catch and falls back to its
  // JS paths. They are listed because they were being inlined from the dev
  // store: both carry binding.gyp and prebuilds and load through
  // node-gyp-build, and a native loader inlined into a bundle chunk searches
  // for prebuilds that cannot be beside it. Listing them keeps that from
  // becoming real if either is ever declared as a dependency.
  "bufferutil",
  "utf-8-validate",
] as const;

export function isRuntimeExternalCliDependency(id: string): boolean {
  return CLI_RUNTIME_EXTERNAL_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/**
 * True when `id` must stay out of the bundle.
 *
 * This has to be wired to the bundler's `neverBundle`, not just to
 * `alwaysBundle`. `alwaysBundle` only forces packages IN — returning false from
 * it means "no opinion", and the default then applies: a declared dependency
 * stays external, but a transitive one gets bundled. That is how a native
 * loader such as node-gyp-build ended up inlined while the declared native
 * package that required it stayed external.
 */
export function isExternalCliDependency(id: string): boolean {
  return isRuntimeExternalCliDependency(id);
}

/** True when the CLI bundle should inline `id` rather than leave it external. */
export function shouldBundleCliDependency(id: string): boolean {
  if (id.startsWith("node:")) return false;
  return !isExternalCliDependency(id);
}

/** Select direct dependency roots whose runtime closure is installed beside the bundle. */
export function selectCliRuntimeExternalDependencies(
  dependencies: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(dependencies).filter(([name]) => isRuntimeExternalCliDependency(name)),
  );
}

/**
 * Scan an emitted bundle chunk for runtime-external packages that were inlined.
 *
 * Configuring the bundler is not the same as checking what it produced. The
 * `alwaysBundle` predicate only forces packages IN; returning false from it
 * means "no opinion", so a transitive dependency still gets bundled by default.
 * A native loader and its helper (node-gyp-build-optional-packages and
 * detect-libc, when msgpackr-extract was still a dependency) were inlined that
 * way while every list-based test passed, which is why this reads the artifact
 * instead.
 *
 * `regionCount` is reported so the caller can tell "nothing was inlined" apart
 * from "the marker format changed and this scan no longer sees anything".
 *
 * `inlinedPackages` is every package seen in a region, which lets the caller
 * check the opposite direction too. Verifying only that externals are absent
 * would still pass if the bundler reverted to leaving everything external: the
 * scan would see source-file regions, report nothing inlined, and the packaged
 * server would then fail with ERR_MODULE_NOT_FOUND because those packages are
 * not in the staged runtime closure either.
 */
export function findInlinedExternalPackages(source: string): {
  readonly regionCount: number;
  readonly inlined: ReadonlyArray<string>;
  readonly inlinedPackages: ReadonlyArray<string>;
} {
  // Rolldown marks each inlined module with a `//#region <path>` comment.
  const regionPattern = /\/\/#region\s+(\S+)/g;
  const packagePattern = /node_modules\/((?:@[^/\s]+\/)?[^/\s]+)\//g;

  let regionCount = 0;
  const inlined = new Set<string>();
  const inlinedPackages = new Set<string>();
  for (const region of source.matchAll(regionPattern)) {
    regionCount += 1;
    const regionPath = region[1] ?? "";
    for (const candidate of regionPath.matchAll(packagePattern)) {
      const name = candidate[1];
      if (name === undefined || name === ".pnpm") continue;
      inlinedPackages.add(name);
      if (isExternalCliDependency(name)) inlined.add(name);
    }
  }

  return {
    regionCount,
    inlined: [...inlined].sort(),
    inlinedPackages: [...inlinedPackages].sort(),
  };
}
