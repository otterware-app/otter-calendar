# Architecture

The environment server owns the app's data, credentials, and agent processes. Web, desktop, and
mobile clients control it over authenticated RPC. A remote client must never substitute its own
filesystem, provider credentials, or machine state for the environment's. The desktop app bundles
a server, but its renderer follows the same boundary.

## Ownership boundaries

Provider processes, feature data, and third-party credentials belong to the server. Shared
connection and domain state belongs in `packages/client-runtime`; clients supply platform services
and UI. Keeping that logic shared prevents reconnect and multi-environment behavior from diverging
between web and mobile. See [connection runtime](./connection-runtime.md) and
[remote environments](./remote.md).

The [RPC contract](../../packages/contracts/src/rpc.ts) is the boundary between independently
versioned clients and servers. Subscriptions send the state a client needs, starting with a
snapshot and continuing with changes, so a client showing one thing does not pay for everything.
Authentication of a socket does not authorize every method on it: each method has a required
scope in [RPC authorization](../../apps/server/src/auth/RpcAuthorization.ts). See
[environment auth](./environment-auth.md).

Clients and environments upgrade independently. When a new feature needs a newer server,
advertise it in the environment descriptor and let clients hide what the connected environment
does not support; never infer support from a client version.

## Features

A feature is a server service that owns its data in SQLite (migrations in
[`persistence/Migrations`](../../apps/server/src/persistence/Migrations)), RPC methods that call
it, a stream that starts with a snapshot, app tools that call the same service (see
[the agent](./agent.md)), shared client state in `packages/client-runtime`, and web and mobile
screens. The calendar ([`src/calendar`](../../apps/server/src/calendar)) is this app's feature; see
[the calendar engine](./calendar-engine.md).

Services serialize their own writes and publish changes after they commit. A subscriber's
snapshot must never be newer than the changes that follow it; take the snapshot and subscribe
under the same lock, or subscribe first and apply changes idempotently.

## Settings ownership

Client preferences stay in the current client; environment defaults stay on their owning server.
The web and desktop settings target is URL state, resolved against current connections. An
unavailable target must not fall back to another environment. **All environments** is an explicit
bulk edit of connected, loaded servers, not a durable global default or a promise to synchronize
offline or future environments.

## Waiting for asynchronous work

Tests await events or Deferreds, never elapsed time. When work goes through a queue, an empty
queue alone does not prove the worker is idle: wait until the current item has finished too.
Production behavior must use persisted state and events, not test instrumentation or assumptions
about elapsed time.

## Desktop startup

The Electron shell acquires `DesktopPreReadyPlatform.layer` synchronously before asynchronous
services. On Linux this sets the desktop-entry identity and global-shortcut portal flags before
Chromium initializes its portal connection. Setting the identity later in `DesktopAppIdentity`
is too late: Chromium caches the first registration, including failures. The identity must match
the installed entry managed by `DesktopLinuxUrlHandler`. Pre-ready setup also refreshes that entry's
`Exec` path before portal registration: AppImage updates can remove the previous executable, which
makes the old entry invalid even though its filename is correct.

Native modules never load in the Electron main process on the startup path. A crash or stall in a
native addon must not take the app down, so new native capability goes in a child process with a
deadline, not an `import` in main.

See the [glossary](./glossary.md) for shared terms and the
[development runbook](../operations/development.md) for setup and checks.
