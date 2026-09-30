# Development

## First checkout

Install Node 24 and `vp` as described in the [root README](../../README.md#develop), then from the
repository root:

```sh
vp i
vp run dev
```

Open the pairing URL the dev runner prints. The bare origin does not authenticate a new browser.

## Dev processes

| Command              | Starts                                                          |
| -------------------- | --------------------------------------------------------------- |
| `vp run dev`         | Server and web client (single origin: Vite proxies the backend) |
| `vp run dev:desktop` | The Electron app with its bundled server                        |
| `vp run dev:server`  | Only the server                                                 |
| `vp run dev:web`     | Only the web client                                             |

The mobile app has its own workflow; see the [mobile README](../../apps/mobile/README.md).

Flags go directly after the task name, for example `vp run dev --home-dir /tmp/scaffold-dev`. Add
`--browser` to open a browser automatically.

### State and ports

Linked worktrees default to their own `.t3/userdata`, even when `T3CODE_HOME` is set. The main
checkout defaults to `~/.otter-calendar/dev`. An explicit `--home-dir` wins in both cases. Never run
a development server against the installed app's `~/.otter-calendar/userdata`; see
[test data](../../AGENTS.md#test-data) to copy a consistent snapshot of it instead.

Read the ports from the `[dev-runner]` line. The main checkout uses 5733 (web) and 13773 (server);
worktrees derive stable ports from their path, and occupied ports shift them.
`T3CODE_PORT_OFFSET` or `T3CODE_DEV_INSTANCE` selects a different offset.

### Sharing and remote debugging

`vp run dev --share` publishes the web port over the machine's tailnet and prints a pairing URL
for that origin. Give the tester the complete URL, including its token. The dev runner removes its
mapping on exit.

Leave `VITE_HTTP_URL` and `VITE_WS_URL` unset. Vite proxies the backend through the browser's
origin, so the same build works over localhost and remote connections.

Shared runs enable bundled dev to avoid a network round trip per import level;
`T3CODE_BUNDLED_DEV=0` opts out when debugging bundler differences. Two reload traps matter when
changing this setup:

- The web entry must dynamically import the app so React refresh initializes before application
  chunks. Static imports can work on first load and fail after a route split.
- Bundled dev rebuilds Tailwind through watched files. Its ordinary Vite hot-update hook expects a
  server/module graph that Rolldown does not provide.

The workarounds live in the [web entry](../../apps/web/src/bootstrap.ts) and the
[Tailwind plugin](../../apps/web/vite/tailwind.ts).

#### Reusable dev credential

Use this only on a hostname where you trust every service. Browsers send cookies to all ports on a
hostname, so any service you visit there can receive the reusable admin credential.

To use one browser profile across web dev worktrees on the same hostname, generate one value once:

```sh
openssl rand -hex 32
```

and put it in the main checkout's gitignored `.env`:

```dotenv
T3CODE_DEV_AUTH_TOKEN=<the value generated above>
```

The `t3.json` setup script links that file into each worktree, and the dev runner reads it at
startup (`.env.local` and process variables override `.env`). For a worktree without the link,
export the same value instead. Do not generate a new value at startup.

Start `vp run dev --share` after configuring it and open its startup pairing URL once per browser
profile; later web dev servers on that hostname accept the shared cookie, which expires after 30
days. The token and startup URLs are reusable admin secrets: never put them in a commit, pull
request, or public output. Each server still keeps its own database, signing key, and revocation
state, and desktop and non-dev servers ignore the value. See
[environment authentication](../internals/environment-auth.md#reusable-dev-credential).

## Checks

Run checks for what you changed:

```sh
vp test run <files>
vp lint <files>
vp run --filter <package> typecheck
```

Use `vp run lint:mobile` for native mobile changes. CI owns the full suite; see
[ci.yml](../../.github/workflows/ci.yml).

### Unused code

`vp run knip:check` checks unused files and dependencies across the repository, then unused runtime
exports in the apps and internal packages it lists. CI enforces it. Exported types and Effect schemas
may exist without consumers, and canonical Effect service constructors stay exported with a
`@public` annotation. Unused exports in `apps/web/src/components/ui/*.tsx` are ignored so component
sets stay complete. `vp run knip --workspace apps/web` audits one workspace, and
`vp run knip:production --workspace apps/web` finds code kept alive only by tests. Runtime-discovered
entry points and dependency exceptions belong in [knip.jsonc](../../knip.jsonc).

## Desktop artifacts

Local builds are unsigned and write to `release/`:

```sh
vp run dist:desktop:dmg:arm64   # on an Apple silicon Mac
vp run dist:desktop:linux       # x64 AppImage, for testing on Linux
```

Releases ship only the macOS build. The Linux build needs ImageMagick for the icons
(`sudo apt-get install imagemagick`). `--keep-stage` keeps the packaging files for inspection; run
`vp run dist:desktop:artifact --help` for the other options.

To exercise the update flow, build with `--mock-updates` and serve the output with
`vp run start:mock-update-server`. Add `--signed` after configuring the credentials in the
[release runbook](./release.md#configuration); macOS passkeys need a signed, provisioned app (see
[Connect setup](./connect-setup.md#desktop-passkeys)).
