# Product analytics

Analytics are off unless the server's environment sets `T3CODE_POSTHOG_KEY`; without it
[the analytics service](../../apps/server/src/telemetry/AnalyticsService.ts) records nothing and
creates no identifier. An app built from the scaffold decides whether and where to collect. There
is no build-time key, so a release never collects by accident.

The server owns delivery, opt-out, and identity for every connected client. Clients do not load
an analytics SDK, so one environment variable controls all of them.
[Identity selection](../../apps/server/src/telemetry/Identify.ts) hashes an available provider
account ID and falls back to an installation-scoped ID. This identity can span several clients; it
does not identify a browser session.

## Attribution

Client dimensions belong to the event's WebSocket connection, taken from the connection's query
parameters. A server-global "current client" would misattribute simultaneous web, desktop, and
mobile use. A desktop host can serve a phone or a remote browser, so keep client and server
dimensions separate, and leave missing client values unknown rather than backfilling them from
server properties. `clientType` describes how the server runs; `surface` describes the client.

`client.connected` counts reconnects, so network behavior inflates it. Count active use from
events tied to user actions, not from connections.

## Collection boundary

Keep payloads to product metadata and normalized measurements. Do not send prompts, app data,
authentication material, raw provider payloads, user-assigned device names, or conversation
identifiers. Client metadata is best effort; invalid values must not reject a connection. PostHog
person profiles stay disabled.
