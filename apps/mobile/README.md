# Otter Calendar Mobile

The Expo (React Native) app for iOS and Android. It connects to any environment, shows the Notes
example and the agent, and shares its connection and feature state with the web app through
`packages/client-runtime`.

It uses native modules, so Expo Go does not work; use a development build. Run commands from
`apps/mobile`.

## Variants

`APP_VARIANT` selects one of three variants, installable side by side. Names and IDs come from
[`brand.ts`](../../packages/shared/src/brand.ts):

| Variant       | App name               | Bundle ID / package              | Scheme                  |
| ------------- | ---------------------- | -------------------------------- | ----------------------- |
| `development` | Otter Calendar Dev     | `dev.otterware.calendar.dev`     | `ottercalendar-dev`     |
| `preview`     | Otter Calendar Preview | `dev.otterware.calendar.preview` | `ottercalendar-preview` |
| `production`  | Otter Calendar         | `dev.otterware.calendar`         | `ottercalendar`         |

T3 Connect sign-in is optional and off in a fresh clone. Public configuration belongs in the
repository-root `.env` or `.env.local`, not an `apps/mobile/.env`; see
[`.env.example`](../../.env.example).

## Development

Boot a simulator or emulator, make sure its dev client matches this checkout, then start Metro:

```bash
node ../../scripts/mobile-native-client.ts ensure ios <simulator-udid>
# or: node ../../scripts/mobile-native-client.ts ensure android <emulator-serial>
vp run dev:client
```

The helper compares the local Expo fingerprint and the installed binary with its last successful
build, and builds and installs the client when it is missing or stale. `check` instead of `ensure`
only reports: exit 0 means compatible, 2 means a build is needed, 1 means an error. Run it on the
simulator host; no EAS login is needed.

Metro keeps its transform cache between starts. If the cache produces stale output, clear it once
with `vp run dev:client:reset`, and do so after installing or changing the Uniwind dependency patch.
Component edits use Fast Refresh; read [mobile development lifecycle](../../docs/internals/mobile-development.md)
before changing runtime ownership or refresh behavior.

| Task                                              | Command                                              |
| ------------------------------------------------- | ---------------------------------------------------- |
| Build and run the iOS / Android dev client        | `vp run ios:dev` / `vp run android:dev`              |
| Build and run the preview app                     | `vp run ios:preview` / `vp run android:preview`      |
| Build a self-contained iOS Release app (no Metro) | `vp run ios:release`                                 |
| Inspect the resolved Expo config                  | `vp run config:dev`, `config:preview`, `config:prod` |
| Regenerate theme files                            | `vp run generate`                                    |
| Tests and typecheck                               | `vp run test`, `vp run typecheck`                    |
| Native lint (SwiftLint, ktlint, detekt)           | `node ../../scripts/mobile-native-static-check.ts`   |

Native lint tools that are missing locally are reported and skipped; CI installs them from the
`Brewfile`.

After changing a native dependency patch, rerun CocoaPods before rebuilding an existing iOS
project. pnpm gives each patch hash a new package path, and Pods can otherwise keep compiling the
old directory. Patches that add native header props need a new binary.

If your Xcode account only has a Personal Team, build with a bundle identifier you control. These
builds leave out native Sign in with Apple:

```bash
T3CODE_IOS_PERSONAL_TEAM=1 \
T3CODE_IOS_PERSONAL_TEAM_BUNDLE_ID=com.example.ottercalendar.dev \
vp run ios:dev
```

## EAS builds

Preview and production builds use Expo fingerprinting, so OTA updates reach only binaries with
matching native dependencies, config plugins, and patches. The development variant uses
`appVersion` so Metro does not recompute the fingerprint for each launch; `MOBILE_VERSION_POLICY`
overrides either default. If you ship a custom Release build with the development identity and
publish OTA updates to it, set `MOBILE_VERSION_POLICY=fingerprint` for both.

Set these as EAS environment variables for the preview and production environments:

- `EAS_PROJECT_ID` and `EAS_OWNER` (OTA updates are off without a project ID);
- `T3CODE_CLERK_PUBLISHABLE_KEY`, `T3CODE_CLERK_JWT_TEMPLATE`, and `T3CODE_RELAY_URL` for T3 Connect;
- optionally `T3CODE_MOBILE_OTLP_TRACES_URL`, `_DATASET`, and `_TOKEN` for relay tracing.

| Build                                | iOS                          | Android                          |
| ------------------------------------ | ---------------------------- | -------------------------------- |
| Cloud dev client                     | `vp run eas:ios:dev`         | `vp run eas:android:dev`         |
| Dev client with the preview identity | `vp run eas:ios:preview:dev` | `vp run eas:android:preview:dev` |
| Persistent preview build             | `vp run eas:ios:preview`     | `vp run eas:android:preview`     |
| Production build                     | `vp run eas:ios:prod`        | `vp run eas:android:prod`        |

Production builds, store submissions, and OTA updates normally run in CI; see
[mobile releases](../../docs/operations/release.md#mobile).
