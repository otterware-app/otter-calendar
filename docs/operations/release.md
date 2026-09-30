# Release

> For maintainers. Using the app? See [docs/user](../user/).

Releases ship the **macOS arm64** desktop app and the macOS arm64 CLI archive as a GitHub Release.
Installed desktop apps update from those releases, and so do servers installed with `install.sh`,
the background service, and SSH-launched servers. Linux builds exist only for local testing
([development](./development.md#desktop-artifacts)).

## Channels and triggers

`.github/workflows/release.yml` has three channels:

| Channel   | How it starts                                                                                                                                | Version                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `nightly` | Scheduled every 30 minutes; releases when `main` has new commits and the last nightly is 6 h old. Or dispatch `channel=nightly` from `main`. | `X.Y.Z-nightly.<date>.<run>`, where `X.Y.Z` is the next patch after the desktop package version |
| `stable`  | Dispatch `channel=stable` from `main`, or push a `vX.Y.Z` tag.                                                                               | The version the latest nightly previewed, the `version` input, or the tag                       |
| `preview` | Dispatch `channel=preview` from any branch. It is the default input, so an omitted choice never ships stable.                                | `X.Y.Z-preview.<date>.<run>`                                                                    |

A dispatched stable release rebuilds the commit of the latest published nightly, so stable only
ships what nightly users have already run. Check that the `Resolve release commit` notice names
the nightly you verified. A tag push builds the tagged commit.

Preview is the maintainers' test train for exercising the full pipeline on an unmerged branch. Its
release carries a warning instead of notes, no updater manifests, and no hosted web deploy, so no
installed app is ever offered it. People reach it only by asking: `T3CODE_CHANNEL=preview` for
`install.sh` or `otter-calendar update --channel preview`, both of which ask for confirmation.

There is no dry run. Every channel publishes a real release, and pushing any non-nightly tag
(`v0.0.0-test.1` included) runs a stable release. Use CI for checks without publishing.

```sh
gh workflow run release.yml -f channel=nightly
gh workflow run release.yml -f channel=stable     # optionally -f version=1.2.3
```

## What a release does

1. Resolves the commit and version, then runs lint, typecheck, and the test suites.
2. Reads the T3 Connect public configuration from the `production` environment (see below) and
   builds the server, web client, and Electron main once.
3. `release-desktop.yml` packages, signs, and notarizes the DMG and update zip on a macOS runner,
   and builds and smoke-tests the CLI archive (`t3-<version>-darwin-arm64.tar.gz`).
4. Optionally publishes the CLI to npm.
5. Publishes the GitHub Release with the DMG, zip, CLI archive, `SHA256SUMS`, and, except for
   preview, the updater manifests (`latest-mac.yml` or `nightly-mac.yml`) and blockmaps.
6. Optionally deploys the hosted web app.
7. For stable, commits the version bump to `main` as the release GitHub App.

The release job publishes the CLI archive and the desktop app together, and the hosted web app
moves only after that. Keep that order: a client asks connected servers to update to its own
version, and the server downloads that version's archive from the release.

## Configuration

Repository variables and secrets, grouped by what they enable. Anything optional is skipped when
it is unset.

**Signing and notarization** (optional; without them the app is unsigned):

| Name                         | Kind     | Value                                                                    |
| ---------------------------- | -------- | ------------------------------------------------------------------------ |
| `CSC_LINK`                   | secret   | Base64 `.p12` export of the Developer ID Application certificate and key |
| `CSC_KEY_PASSWORD`           | secret   | The `.p12` password                                                      |
| `APPLE_API_KEY`              | secret   | Contents of the App Store Connect API key (`.p8`)                        |
| `APPLE_API_KEY_ID`           | secret   | The key ID                                                               |
| `APPLE_API_ISSUER`           | secret   | The issuer ID                                                            |
| `MACOS_PROVISIONING_PROFILE` | secret   | Base64 provisioning profile for the app ID, with Associated Domains      |
| `APPLE_TEAM_ID`              | variable | The 10-character team ID                                                 |
| `CLERK_PASSKEY_RP_DOMAINS`   | variable | Optional passkey RP-domain override                                      |

When the five certificate and API key secrets are set, `APPLE_TEAM_ID` and
`MACOS_PROVISIONING_PROFILE` are required too. The app ID is `BRAND.appId`; see
[Connect setup](./connect-setup.md#desktop-passkeys) for the profile and passkey steps.

**T3 Connect** (optional; without it clients build with cloud features off). Set in the
`production` GitHub environment: `CLERK_PUBLISHABLE_KEY`, `CLERK_JWT_TEMPLATE`,
`CLERK_CLI_OAUTH_CLIENT_ID`, and `RELAY_API_ZONE_NAME` (or `RELAY_DOMAIN`). Setting only some of
them fails the release. With `CLOUDFLARE_ACCOUNT_ID` and the `CLOUDFLARE_API_TOKEN` secret, the
release also reads the deployed relay's client tracing token from the relay stack's state.

**npm** (optional): set the variable `NPM_PUBLISH=true`. The job publishes `BRAND.slug` and
`<npmScope>/<slug>-darwin-arm64` under the channel's dist-tag (`latest`, `nightly`, `preview`), and
also tags nightlies `latest`. It authenticates with npm trusted publishing (register
`.github/workflows/release.yml` as the trusted publisher for both packages) or an `NPM_TOKEN`
secret. A dry run of every package runs first, so a missing scope or publisher fails before
anything is live. The web client's **Copy update command** for hand-started servers suggests
`npx <slug>@<version>`, which only works when npm publishing is on.

**Hosted web app** (optional): secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`;
variables `VERCEL_TEAM_SLUG`, `T3CODE_WEB_ROUTER_URL` (defaults to `BRAND.hostedAppUrl`),
`T3CODE_WEB_LATEST_DOMAIN`, and `T3CODE_WEB_NIGHTLY_DOMAIN` (default `latest.` and `nightly.` below
the hosted app's host). Stable deploys alias the latest domain and the router URL; nightly aliases
the nightly domain.

**Stable version bump** (required for stable): secrets `RELEASE_APP_ID` and
`RELEASE_APP_PRIVATE_KEY` for a GitHub App allowed to push to `main`. The mobile workflow uses the
same app for its manual version override.

## Stable checklist

1. Verify the latest nightly: install it, check the desktop update from the previous nightly, and
   connect it to a server on the previous version to confirm the server update reconnects.
2. Dispatch `channel=stable`. Leave `version` empty unless it should differ from the nightly's.
3. Confirm the resolved nightly commit, then watch the checks, the macOS build, and the release
   job's asset list.
4. Smoke test the downloaded DMG and `install.sh`.

If the build is unsigned when it should be signed, check that every signing secret and
`APPLE_TEAM_ID` is non-empty and that the provisioning profile belongs to
`<APPLE_TEAM_ID>.<BRAND.appId>`.

## Desktop updates

The updater lives in `apps/desktop/src/updates/DesktopUpdates.ts`; builds point it at
`BRAND.githubRepository` unless `T3CODE_DESKTOP_UPDATE_REPOSITORY` overrides it. Stable installs
follow `latest-mac.yml`, nightly installs `nightly-mac.yml`. Checks run in the background; the user
starts the download and the restart.

To test the update flow locally, build with `--mock-updates` and serve the output with
`vp run start:mock-update-server`.

## Relay

`.github/workflows/deploy-relay.yml` deploys the relay's `prod` stage on every push to `main`, in
the `production` environment. Dispatch it with `force` after changing a variable the Worker reads at
deploy time, such as `RELAY_TUNNEL_CLEANUP_MODE`. Its variables and secrets are listed in the
[relay README](../../infra/relay/README.md#deployment).

## Mobile

Every mobile workflow does nothing until the `EXPO_TOKEN` secret is set.

- `mobile-eas-production.yml` runs on pushes to `main` that touch the mobile app or its shared
  packages. When `version` in `apps/mobile/app.config.ts` has no store build yet, it builds and
  submits (TestFlight and the Play internal track). Otherwise it publishes an OTA update to every
  platform with a production build whose native fingerprint matches. Dispatch it with
  `mode=build` or `mode=update` to force either. Releasing to the App Store stays a manual step.
- `mobile-eas-preview.yml` builds a preview for pull requests labelled
  `🚀 Mobile Continuous Deployment`.
- `mobile-fingerprint-check.yml` labels pull requests that change the native fingerprint
  `📱 Native Change`, so they can be merged together right before a store build.

EAS reads `EAS_PROJECT_ID`, `EAS_OWNER`, and the public `T3CODE_*` values from its environment
variables; see the [mobile README](../../apps/mobile/README.md#eas-builds).
