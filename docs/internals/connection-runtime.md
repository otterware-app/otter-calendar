# Connection runtime

Web, the desktop renderer, and mobile share one connection owner per environment
in `packages/client-runtime`. Platform code supplies storage, credentials, network
signals, and application lifecycle events. React views consume the runtime.
Keeping retries and session lifetime here prevents competing reconnect loops when
several views need the same environment.

## One transport retry owner

The [supervisor](../../packages/client-runtime/src/connection/supervisor.ts) owns
transport retry policy; resolving an endpoint and opening an RPC session are single
attempts. Transient failures retry with capped backoff. Offline states and
authentication failures wait for a wakeup instead of spending attempts on
unchanged conditions.

Foregrounding needs different treatment depending on the connection's state.
It wakes a retry immediately, leaves an ordinary in-flight attempt alone, and
probes an established session before replacing it. A long mobile background
suspension forces replacement because the OS can kill a socket without reporting
closure. Treating every foreground event as a reconnect delays healthy attempts;
treating every resume as harmless leaves suspended sockets stuck.

The [registry](../../packages/client-runtime/src/connection/registry.ts) scopes
connections by environment. An involuntary disconnect retains the registration
and cached data. Explicit removal closes the scope and clears credentials,
cached data, and platform-owned state. Cloud-account changes apply
to relay registrations; they must not discard directly paired environments.

## HTTP authorization

RPC sessions authenticate at socket upgrade, while HTTP requests need current
credentials from the
[authorization service](../../packages/client-runtime/src/authorization/service.ts).
Replacing a healthy socket for HTTP renewal would interrupt conversations and
change the transport generation without a transport failure. Credential expiry
does not close the socket, and refresh failure belongs to the HTTP operation.

Session listings must retain unrevoked connected sessions after credential expiry
so an open connection does not disappear from connection management. This does
not extend the credential's lifetime. New HTTP requests and socket upgrades still
require valid credentials.

## Transport health and data freshness are separate

A socket opening is insufficient evidence that the environment is usable. The
[RPC session](../../packages/client-runtime/src/rpc/session.ts) waits for the
initial server configuration before becoming ready. Feature data then has its own
subscription state. A failed feature subscription can coexist with a healthy
connection; labeling that state "reconnecting" promises a transport retry that
will never happen.

Feature state such as [agent conversations](../../packages/client-runtime/src/state/agent.ts)
and [notes](../../packages/client-runtime/src/state/notes.ts) is a snapshot followed
by changes. Every subscription starts with a snapshot, again after each reconnect,
so the reducers in those modules are the whole client-side model: there is no
replay cursor to keep consistent and no offline copy to merge. A new feature
should keep that shape. Only the server configuration is cached on the device, so
the shell can render offline; that cache must neither imply a live connection nor
overwrite newer live data.

Subscriptions are atom families keyed by environment and input. Mounted consumers
share one stream, which stops after the last consumer unmounts and its idle
time-to-live passes (one minute for a conversation's detail, five minutes by
default). Returning to a recent screen therefore reuses the live stream instead of
downloading another snapshot. Keep a subscription's scope as narrow as its screen:
a conversation's detail is its own stream, so the list does not pay for every
conversation's items.

The [RPC boundary](../../packages/client-runtime/src/rpc/client.ts) resolves
requests against the current session at execution time. Durable subscriptions
follow replacement sessions. After a transport failure they wait for the
supervisor; an expected domain failure may resubscribe on the same healthy
session. Reconnection does not automatically replay mutations, whose retry and
idempotency rules belong to the operation.
