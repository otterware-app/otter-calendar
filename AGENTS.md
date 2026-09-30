# Otter Scaffold

> **This is Otter Scaffold**, the starting point for Otterware apps, cut from Otter Code (our
> fork of T3 Code). Read [SCAFFOLD.md](SCAFFOLD.md) first: it covers the app's identity, how to
> start a new app, external setup, releases, and keeping up with upstream.

A Node WebSocket server (the environment) owns the app's data and runs its agents, and serves
web, desktop, and mobile clients. The agent layer drives the user's own Claude Code and Codex
subscriptions and gives them the app's tools over MCP. Apps built from the scaffold replace the
Notes example with their own domain.

## What we never compromise on

These come from T3 Code and apply to every app built on the scaffold.

### 1. Open at the core

The code is open, and so is how we think about it. We work in the open and should stay that way.

### 2. Performance without compromise

Lots of apps have gotten bogged down with bad tech decisions and "slop". Ours must not. Performance regressions usually come from sending too much data over websockets, CSS animations causing GPU spikes, lists being hard to render, and more. Make sure all changes are considerate of performance impact.

### 3. Remote ready

The websocket layer enables remote use: users connect directly over their local network, over Tailscale, over SSH from the desktop app, or through T3 Connect (the relay and tunnels in `infra/relay`). New features must work in all of them.

### 4. Multi-surface

There are 3 app surfaces: **web**, **desktop**, and **mobile**.

**Web** is two surfaces: the hosted web app (`BRAND.hostedAppUrl`) and the web app served locally by the server (`t3` in dev, the published CLI in releases). Both need to be supported by all new features where reasonable.

**Desktop** is a full Electron app that bundles the server. It can also be the host server, allowing remote connections from the hosted web app or the mobile app.

**Mobile** is an Expo (React Native) app for iOS and Android that connects to any environment of the app.

## A note from Theo (T3 Code)

I like ambitious ideas, simple systems, and software that feels obvious. Do not preserve complexity just because it already exists. Do not introduce machinery because it looks architecturally impressive. Understand the real constraint, then fight for the smallest model that makes the correct behavior unsurprising.

Channel both "measure twice, cut once" and "yagni". Fight scope creep. Try to honor the dev's intent in both a minimal and realistic fashion.

The rest of this document is meant to help you navigate the codebase and make changes effectively. Think of these instructions less as "hard rules", more as "good defaults". The developer's preferences should be able to override anything here.

Of note: most contributions come from agents running inside Otter Code, often controlled remotely, on a machine that also runs that Otter Code server and other dev servers. Be careful about accessing data, killing processes, and memory-hungry commands that may damage the instance the contributor is using.

## A small glossary

We need to be on the same page with terminology. When communicating, use this language:

- **you** means the agent reading this file and changing the app.
- **we, us, and maintainers** mean the people building the app. These are who you are talking to now.
- **user** means the person using the app.
- **agent** means the in-app assistant a user talks to (Claude or Codex, driven by the app). Depending on context, that may also include you.
- **provider** means the agent runtime the app talks to: Claude (Agent SDK) or Codex (app-server).
- **app tools** means the app's own operations exposed to the agent over MCP.
- **client** means the web, desktop, or mobile UI.
- **environment** means one running server and the machine, credentials, and state it owns.
- **thread** means one agent conversation, persisted by the environment.
- **turn** means one user-to-agent cycle within a thread.
- **home** means the base data directory (`~/.otter-scaffold`, see `BRAND.homeDirName`). Runtime state lives below its `userdata` directory.

## The four ways to hurt yourself

1. **Killing by pattern.** Never `pkill -f`, `pgrep | kill`, or `kill` a PID you found by matching a name, path, or worktree string. Your own agent process has this worktree's path in its argv, and this machine runs several other dev servers at once. Kill only a PID you captured at spawn, or the owner of your port from `ss -H -ltnp` after confirming `/proc/<pid>/cwd` is your worktree.
2. **Writing to a live install.** The app's installed home (`~/.otter-scaffold/userdata` or the rebranded name) is the developer's real data, and `~/.otter-code` is the Otter Code install that may be hosting you. Reading and copying from the app's home is fine (see Test data). Never start a server against either, never open them read-write, never clean them up.
3. **Baking in origins.** Never set `VITE_HTTP_URL` or `VITE_WS_URL` for dev. Dev is single-origin and Vite proxies `/api`, `/ws`, `/oauth`, and `/.well-known`. Setting them bakes localhost into the bundle and silently breaks every remote browser.
4. **Running out of memory.** Typechecks, builds and test runs of the larger packages take gigabytes; several at once can take down the machine, including the Otter Code server hosting you. Run one at a time, and on shared machines inside a memory cap (e.g. `systemd-run --user --scope -p MemoryMax=6G -p MemorySwapMax=0 <cmd>`).

## Hit every surface

The most common defect in this repo is a change that works on the path you tested and is missing everywhere else. Before calling frontend work done, walk this list and say which entries applied:

- **Entry points.** A behavior reachable from the main view is usually also reachable from Settings, the command palette, a keybinding, and the agent's tools. Fixing one is not fixing the feature.
- **Clients.** Web, desktop (wraps web, adds Electron shell/IPC), and mobile (React Native, separate navigation). Shared logic lives in `packages/client-runtime`
- **Providers.** Claude and Codex each have an adapter. Provider-shaped features need a decision per adapter, even if the decision is "not supported here".
- **Agent.** A user action on app data usually deserves an app tool too, calling the same service the RPC handler calls, so the agent can do what the user can.
- **Contracts.** Anything crossing the wire is typed in `packages/contracts`. Change the schema and the server, web, mobile, and desktop all follow.
- **Reverse states.** If you added a way in, add the way out and the way to see it. Snooze needs unsnooze. Close needs reopen. A one-way door is a bug.
- **Connection modes.** Local, remote/relay, and tunnel behave differently. Multi-device and multi-environment cases are real.
- **Docs.** Check whether the change makes existing guidance inaccurate. Apply the [documentation rules](#documentation) before adding anything.

## Dev servers

- `vp i` installs. Worktrees get this from the t3.json setup script; if module resolution looks broken, it probably did not run.
- `vp run dev` starts server and web. In a worktree, state defaults to that worktree's gitignored `.t3`, which deliberately outranks an ambient `T3CODE_HOME` so you cannot land on shared state by accident. An explicit `--home-dir` still wins.
- Ports derive from the worktree path and are stable across restarts, but read the real ones from the `[dev-runner]` line since occupied ports shift.
- Sharing over the tailnet is three steps: run `vp run dev --share` in the background, wait for the `pairingUrl:` line in its output, then give that full URL to an unpaired browser. Do not wire up `tailscale serve` by hand, open the URL yourself, or consume the user's pairing link. A browser with the reusable dev cookie can use the bare origin. If a normal one-time token was consumed, mint a fresh one with `node apps/server/src/bin.ts pair`. It carries standard scopes, while the startup URL carries admin scopes needed for Connections settings.
- To reuse web dev auth across worktrees, configure one fixed `T3CODE_DEV_AUTH_TOKEN` in the main checkout's gitignored `.env`. The `t3.json` setup links that file into worktrees. Never commit or publish the token or a startup URL. See [Reusable dev credential](docs/operations/development.md#reusable-dev-credential).
- Stop what you started, by the PID you tracked. See rule 1.

## Test data

An empty database is a bad test. Seed your worktree's `.t3` with a copy of real data instead of pointing at live state:

- Copy from the app's installed home, e.g. `~/.otter-scaffold/userdata` (the developer's real data, the most realistic test set), or its `dev` directory. Worktree state lives at `<worktree>/.t3/userdata`.
- Snapshot the database with `VACUUM INTO`, which is safe even while a server has the source open and yields one consistent file:

  ```bash
  mkdir -p .t3/userdata
  rm -f .t3/userdata/state.sqlite*  # VACUUM INTO refuses to overwrite
  node -e "new (require('node:sqlite').DatabaseSync)(process.env.HOME + '/.otter-scaffold/userdata/state.sqlite', { readOnly: true }).exec(\"VACUUM INTO '.t3/userdata/state.sqlite'\")"
  ```

  A plain `cp` is only safe when no server has the source open, and must bring the `-wal` and `-shm` siblings along. A live file copy is a corrupt copy.

- Bring `secrets` and `settings.json` only if the flow under test needs them.
- Copy in, never symlink. Data flows one way: into your sandbox, never back out.

## Verifying

- Smallest proof that the change works. `vp test run <files>` for the tests you touched, targeted lint and typecheck for the scope you changed.
- Test meaningful logic or observable behavior. Do not render components to static markup to assert props or attributes, or add tests that merely assert callback wiring or mirror the implementation.
- **Do not run repo-wide checks.** No `vp check`, no `vp run -r test`, no `vp run -r typecheck` unless I ask. CI owns the full suite.
- Backend behavior changes ship with focused tests for that behavior.
- Wait on events and Deferreds, never on sleeps or polling. A test that needs a timeout to pass is wrong.
- Upon request, user-visible frontend changes should get one integrated pass in a real client: `test-t3-app` for web, `test-t3-mobile` for mobile. The primary agent does this once after integrating. Subagents do not launch their own dev servers. Ask permission before doing computer use or spinning up browsers.

For authorized mobile verification, a missing or outdated native client is a build step, not a blocker. Run `node scripts/mobile-native-client.ts ensure <ios|android> <device-id>` on the simulator host before starting Metro. It checks the local Expo fingerprint and builds/installs when needed. See `test-t3-mobile` for the full workflow.

## Pull requests

- Never make a PR unless the developer explicitly asks you to do so.
- Conventional commit titles, plain language: `fix(web): new threads no longer spike CPU`.
- Body: the problem in a sentence or two, then how you fixed it. End with the model and harness that did the work.
- UI changes need before/after images. Motion or timing needs a short video.
- Upload PR evidence to GitHub. Never commit PR-only screenshots or assets such as `.github/pr-assets/`.
- One concern per PR. If the description says "also", split it.
- When babysitting: poll checks and comments newer than the last push, verify each bot finding against the source, fix real ones, dismiss false positives with a written reason. Stay quiet when nothing is new. Stop when the bots are green on the latest commit.

## Documentation

Most code changes do not need an internal documentation change. Agents can read the code.

- `docs/internals/` is for architectural decisions and their reasons, constraints that span components, and implementation traps that are hard to discover from the source. Before adding a paragraph, ask what a maintainer would get wrong without it. If reading the relevant code answers the question, leave it out.
- Do not document every feature, enumerate fields or methods, narrate control flow, maintain file catalogs, or append PR summaries. Types, tests, and code already record the implementation. The glossary defines shared vocabulary; it is not a feature index.
- Keep a local implementation explanation in a nearby code comment. Use an internal doc when the reasoning crosses boundaries or needs context the code cannot carry well. Link to the relevant source instead of copying it.
- When a documented decision or constraint changes, rewrite or remove the affected text. Do not append another account of the new behavior. A new internal page needs a distinct, durable reason to exist.
- `docs/user/` helps users accomplish tasks. Give each major feature a concise section explaining what it does, how to start, and anything unintuitive. A settings path is useful; descriptions of visible buttons, icons, layouts, animations, or every UI state are not. Before adding text, ask what task or decision it helps the user with.
- Keep user docs in the shipped product's voice, without implementation details or contributor tooling. Update the relevant feature section when how to use it changes. A UI tweak does not need a documentation entry, and a new control does not need its own page.
- `docs/operations/` holds maintainer setup, release, and debugging procedures. Keep instructions for operating an installed server in the user guides.

## Plans and work artifacts

- Do not commit implementation plans, research notes, or agent scratch files. Keep temporary working material outside the worktree. `.plans/` is gitignored only as a safety net for legacy tooling.
- Track active maintainer work in the GitHub issue or project item that owns it. External proposals follow `CONTRIBUTING.md` and belong in Ideas discussions.
- A merged PR is the implementation record. Close or update its tracking item when the work lands; do not preserve a second checklist in the repository.

## How it works

Clients send typed WebSocket requests (`packages/contracts/src/rpc.ts`) and subscribe to streams that start with a snapshot and continue with changes. Each feature is a server service that owns its data in SQLite; RPC handlers and the agent's MCP tools both call that service, so a click and an agent action take the same path. Provider CLIs run as subprocesses; per-provider _adapters_ translate their native protocols into normalized turn items and runtime requests; the `AgentService` persists conversations and streams them to clients. See `docs/internals/agent.md`.

Full glossary with file links: `docs/internals/glossary.md`

## Where code lives

- `apps/server` - WebSocket RPC, auth and pairing, T3 Connect, settings, providers (`src/provider`, adapters in `src/provider/adapters`), the agent (`src/agent`), app tools over MCP (`src/mcp`), features (`src/notes` is the example). Effect-heavy: read `.repos/effect-smol/LLMS.md` before writing Effect code.
- `apps/web` - React/Vite UI. `apps/desktop` wraps it, `apps/mobile` is React Native (Expo).
- `infra/relay` - the T3 Connect relay (Cloudflare Worker).
- `packages/contracts` - Effect/Schema contracts plus small derived helpers. No heavy runtime logic.
- `packages/shared` - shared runtime utils, subpath exports, no barrel.
- `packages/client-runtime` - client code shared by web and mobile.
- `.repos/` - vendored read-only references. Prefer their patterns over invented ones. Never edit or import from them. Sync with `vpr sync:repos` when bumping the matching dependency.

## Taste

- Complexity belongs at the adapter boundary. Services own their data, UI stays dumb.
- `apps/web/src/components/ui` exports own their look. Pick a `variant` or `size`; do not restyle one with `className`. If none fits and the look is a generic concept, add a variant to the component; a look that belongs to one feature stays in that feature's own component, not in `components/ui`. Layout classes (width, flex, margin, position) belong on the parent. `shadcn/no-restyle` fails lint on violations.
- Inferred types over annotations. `any` is the enemy.
- Comments describe how a thing is used, and move when the code moves. To be used mostly to describe functions, not to annotate every line of behavior.
- Our users drive agents all day and notice a dropped frame, a lying spinner, and a stale label. No continuously repainting animations; they peg the GPU on high-refresh displays.
- If a rule here fights the task in front of you, say so loudly and get a human sign-off before breaking it.

## Additional tips

- Don't verify with browsers or computer use unless the user explicitly agrees or requests it.
- Security is important, but should not be over-indexed on, especially for dev mode/maintainer-only features.
