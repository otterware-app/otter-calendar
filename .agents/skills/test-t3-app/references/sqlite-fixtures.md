# SQLite fixtures

Load this reference only when inspecting or seeding local app state directly.

## Select the correct database

When `--base-dir` or `--home-dir` is explicit, runtime state lives under `<base-dir>/userdata` and the database path is `<base-dir>/userdata/state.sqlite`. The `<base-dir>/dev` state directory is only the fallback for an implicit development home, preventing an ordinary `vp run dev` from touching production state.

Start the target runtime once before seeding so all migrations have run. Use an isolated base directory. Stop the server before writes to avoid racing the running services.

## Use the helper

List tables:

```bash
node apps/server/scripts/t3-sqlite-state.ts query \
  --base-dir <base-dir> \
  --sql "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name"
```

Inspect current columns before writing a fixture:

```bash
node apps/server/scripts/t3-sqlite-state.ts query \
  --base-dir <base-dir> \
  --sql "PRAGMA table_info(projection_threads)"
```

Apply a SQL fixture from a file:

```bash
node apps/server/scripts/t3-sqlite-state.ts exec \
  --base-dir <base-dir> \
  --file /tmp/t3-seed.sql
```

Use one statement per invocation for both `query` and `exec`; the helper wraps writes in a transaction and prints the backup path after a successful mutation. Use a single insert with multiple value rows when a fixture needs several records.

## Seed feature data carefully

Feature services own their tables (for example the calendar's `calendar_*` tables, and the agent's `agent_threads`,
`agent_turns`, `agent_turn_items` and `agent_runtime_requests`). Inspect
`PRAGMA table_info(<table>)` and the migrations under `apps/server/src/persistence/Migrations/`
before constructing inserts. Keep identifiers unique, timestamps as ISO strings, JSON columns
valid, and related IDs consistent.

Direct writes are appropriate for visual states: long titles, many rows, edge-case counts. The
running server does not see them until it restarts, and they do not prove backend behavior. Use
the app's RPC methods, or the agent's app tools, for behavior tests. Use
`node apps/server/src/bin.ts auth ...` for auth state rather than editing `auth_pairing_links` or
`auth_sessions`.
