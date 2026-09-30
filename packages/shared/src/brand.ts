/**
 * The app's identity, in one place. Every surface (server, CLI, desktop, web, mobile, relay,
 * build scripts) reads its names and IDs from here, so a new app built from the scaffold changes
 * this file (and runs `node scripts/rebrand.ts`, which also rewrites the few files that cannot
 * import it) instead of hunting for strings.
 *
 * Internal package names (`@t3tools/*`) and environment variables (`T3CODE_*`) are deliberately
 * not branded: they are implementation details shared with upstream T3 Code.
 */
export const BRAND = {
  /** Product name shown to users. */
  displayName: "Otter Scaffold",
  /** Lowercase, hyphenated name: CLI command, npm package, service unit, file names. */
  slug: "otter-scaffold",
  /** Reverse-DNS application ID: macOS bundle, Android package, Windows AppUserModelId. */
  appId: "dev.otterware.scaffold",
  /** Custom URL scheme for desktop deep links and mobile links. Dev builds append `-dev`. */
  urlScheme: "otterscaffold",
  /** Data home under the user's home directory (`~/.otter-scaffold`). */
  homeDirName: ".otter-scaffold",
  /** npm scope for per-platform CLI packages (`@otterware/otter-scaffold-darwin-arm64`). */
  npmScope: "@otterware",
  /** GitHub repository that publishes releases and serves desktop updates. */
  githubRepository: "otterware-app/otter-scaffold",
  /**
   * The hosted web app. The CLI's sign-in flow starts on its `/connect` page, and pairing links
   * point at it. Override per deployment with `T3CODE_HOSTED_APP_URL`.
   */
  hostedAppUrl: "https://scaffold.otterware.dev",
  /** Name of account-based remote access (T3 Connect) in the UI. */
  connectName: "Otter Connect",
} as const;

export type Brand = typeof BRAND;
