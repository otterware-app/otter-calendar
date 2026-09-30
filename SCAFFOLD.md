# Otter Scaffold

Otter Scaffold is the starting point for new Otterware apps. It is
[Otter Code](https://github.com/acme-acme-acme/otter-code) (our fork of
[T3 Code](https://github.com/pingdotgg/t3code)) with the coding-agent product taken out and the
platform left in:

- an **environment server** (`apps/server`): Effect, typed WebSocket RPC, SQLite, auth and
  pairing, T3 Connect, settings, background service, self-update, CLI;
- **clients**: web (`apps/web`), desktop (`apps/desktop`, Electron, bundles the server) and
  mobile (`apps/mobile`, Expo), sharing state logic in `packages/client-runtime`;
- the **relay** (`infra/relay`): accounts (Clerk), environment linking, managed tunnels;
- the **agent layer**: Claude and Codex through T3's provider adapters, a small
  `AgentService` for conversations, and the app's own tools served to agents over MCP;
- **release pipelines**: macOS arm64 desktop builds with updates from GitHub Releases, the
  relay deploy, mobile builds on EAS.

A tiny **Notes** feature runs through every layer as the example to copy and then delete.
`AGENTS.md` covers conventions; this file covers what is specific to the scaffold: identity,
starting a new app, setup, releases, and keeping up with upstream.

## Identity

Everything that names the app comes from [`packages/shared/src/brand.ts`](packages/shared/src/brand.ts):

| Field              | Scaffold value                   | Used for                                                     |
| ------------------ | -------------------------------- | ------------------------------------------------------------ |
| `displayName`      | Otter Calendar                   | window titles, menus, web title, mobile app name             |
| `slug`             | `otter-calendar`                 | CLI/npm package, service unit, relay stack, MCP server key   |
| `appId`            | `dev.otterware.calendar`         | macOS bundle ID, Android package, launchd label (`.service`) |
| `urlScheme`        | `ottercalendar`                  | desktop protocol and mobile links (`-dev` for development)   |
| `homeDirName`      | `.otter-calendar`                | data home (`~/.otter-calendar`)                              |
| `npmScope`         | `@otterware`                     | per-platform CLI packages                                    |
| `githubRepository` | `otterware-app/otter-calendar`   | GitHub Releases, desktop updates, `install.sh`               |
| `hostedAppUrl`     | `https://calendar.otterware.dev` | hosted web app, `/connect` sign-in page, pairing links       |
| `connectName`      | Otter Connect                    | name of account-based remote access (T3 Connect) in the UI   |

Internal names stay T3's on purpose: `@t3tools/*` packages, `T3CODE_*` variables, the `t3`
binary inside the repo. They never reach users, and keeping them makes upstream changes easy to
port.

## Starting a new app

1. Create the repository from the scaffold and keep the scaffold as a remote:

   ```sh
   git clone https://github.com/otterware-app/otter-scaffold.git otter-<name>
   cd otter-<name>
   git remote rename origin scaffold
   gh repo create otterware-app/otter-<name> --public --source . --remote origin
   ```

2. Rebrand. This rewrites `brand.ts` and the files that cannot import it (package metadata,
   `index.html`, mobile config, workflows, `install.sh`, `t3.json`, the docs, this file's
   table):

   ```sh
   node scripts/rebrand.ts --name "Otter Calendar" --slug otter-calendar \
     --app-id dev.otterware.calendar --scheme ottercalendar \
     --repo otterware-app/otter-calendar --hosted-url https://calendar.otterware.dev
   ```

   Add `--connect-name` to rename Otter Connect and `--dry-run` to see the changes first.
   Replace the icons in `assets/` and run `node scripts/export-brand-icons.ts`.

3. `vp i` (or `pnpm install`), then `vp run dev`.

4. Replace the Notes example with your domain. Notes shows every layer a feature touches:
   - contract: [`packages/contracts/src/notes.ts`](packages/contracts/src/notes.ts) and its
     methods in [`rpc.ts`](packages/contracts/src/rpc.ts);
   - server: [`apps/server/src/notes/`](apps/server/src/notes) (service + SQLite migration),
     RPC handlers in `ws.ts`, scopes in `auth/RpcAuthorization.ts`;
   - agent tools: [`apps/server/src/mcp/toolkits/notes/`](apps/server/src/mcp/toolkits/notes);
   - shared client state: `packages/client-runtime/src/state/notes.ts`;
   - web: the `/notes` route and its components; mobile: the Notes screens.

5. Do the external setup below when you want accounts, remote access and releases. The app
   runs locally without any of it.

## External setup

None of this is needed for local development. Each step lists where its values go.

- **Clerk (accounts)**: an application with a JWT template (audience = the relay's
  `CLERK_JWT_AUDIENCE`), a public CLI OAuth application with PKCE (redirect
  `http://127.0.0.1:34338/callback`, device grant enabled for SSH hosts), the desktop redirects
  `<scheme>://app/` and `<scheme>-dev://app/`, and the mobile callbacks. Public values go into the
  root `.env` for local builds (`T3CODE_CLERK_*`, see `.env.example`), into repository variables
  for CI, and into EAS environment variables for mobile. Details:
  [docs/operations/connect-setup.md](docs/operations/connect-setup.md).
- **Relay**: a Cloudflare account and zones, a PlanetScale Postgres organization, and an Axiom
  organization for relay tracing. `.github/workflows/deploy-relay.yml` deploys it on pushes to
  `main` once `CLOUDFLARE_ACCOUNT_ID` is set; the variables and secrets it needs are listed in
  [infra/relay/README.md](infra/relay/README.md). Never run `alchemy destroy` against `prod`.
- **Desktop releases**: Apple Developer ID certificate, notarization API key and provisioning
  profile as repository secrets (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`,
  `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `MACOS_PROVISIONING_PROFILE`) and the `APPLE_TEAM_ID`
  variable. Without them the workflow still builds unsigned apps for testing. Stable releases
  also need a GitHub App that can push the version bump (`RELEASE_APP_ID`,
  `RELEASE_APP_PRIVATE_KEY`).
- **Mobile**: an EAS project (`EAS_PROJECT_ID`, `EAS_OWNER` as EAS/CI environment variables) and
  an `EXPO_TOKEN` secret for the workflows; App Store Connect app for iOS submissions.
- **npm** (optional `npx <slug>`): set the repository variable `NPM_PUBLISH=true` and an
  `NPM_TOKEN` secret with access to the npm scope.
- **Hosted web app** (optional): a Vercel project; set `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
  `VERCEL_PROJECT_ID`.

## Releases

- `release.yml` builds, signs, notarizes and publishes the **macOS arm64** desktop app and the
  macOS arm64 CLI archive as a GitHub Release, with updater manifests, so installed apps offer
  updates. Linux and Windows are not built in CI, so SSH hosts and `install.sh` need Apple silicon
  until a Linux job is added back. A scheduled check publishes a nightly when `main` has new
  commits (at most every 6 hours); start one by hand with
  `gh workflow run release.yml -f channel=nightly` (or `stable`), or push a `vX.Y.Z` tag.
- `deploy-relay.yml` deploys the relay on pushes to `main`.
- Mobile: `mobile-eas-production.yml` builds and submits, or ships an OTA update when the native
  fingerprint is unchanged; it does nothing until `EXPO_TOKEN` is set.
- Local desktop builds: `vp run dist:desktop:dmg:arm64` on a Mac, `vp run dist:desktop:linux`
  (AppImage) on Linux for testing.

Full runbook: [docs/operations/release.md](docs/operations/release.md).

## Keeping up with upstream

The scaffold was cut from Otter Code at commit `4954bed23` (`chore(otter): adapt upstream files
(generated)`, synced with T3 Code on 2026-09-29). It is not a fork anymore: large parts were
deleted and the agent layer was replaced, so upstream commits don't merge. Port fixes by hand,
area by area. The platform areas (`apps/server/src/{auth,cloud,environment,persistence}`,
`apps/server/src/provider`, `packages/client-runtime/src/{connection,relay,authorization,rpc}`,
`apps/desktop`, `infra/relay`) track upstream closely and are the places worth watching.

Apps built from the scaffold merge scaffold changes from the `scaffold` remote:
`git fetch scaffold && git merge scaffold/main`. Keep app changes out of the platform areas where
you can, so those merges stay easy.
