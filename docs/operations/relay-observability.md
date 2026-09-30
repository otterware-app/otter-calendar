# Relay observability

> For maintainers. Using the app? See [docs/user](../user/).

The relay's Alchemy stack provisions one Axiom trace setup per stage. Names start with
`BRAND.slug` and end with the sanitized stage name; for this repository's `prod` stage:

- `otter-scaffold-relay-traces-prod`, the OpenTelemetry trace dataset shared by the Worker, the
  mobile app, and first-party relay clients (30-day retention)
- `otter-scaffold-relay-otel-ingest-prod`, the Worker's dataset-scoped ingest token
- `otter-scaffold-mobile-otel-ingest-prod`, the mobile app's ingest token
- `otter-scaffold-relay-client-otel-ingest-prod`, the ingest token for relay calls from the server
  and web client
- `otter-scaffold-relay-recent-spans-prod`, a view of recent request spans

A personal stage uses its own suffix, for example `otter-scaffold-relay-traces-dev-julius`.
Alchemy uses the account-level `AXIOM_TOKEN` and `AXIOM_ORG_ID` to provision; at runtime each
producer gets only its scoped, write-only ingest token. Deploying writes the client tokens into the
root `.env` for source builds, and the release workflow reads them from the stack's state.

The Worker emits Effect's HTTP server spans plus endpoint and database child spans. Semantic HTTP
attributes sit under `attributes.`, relay-specific annotations under `attributes.custom`:

```apl
['otter-scaffold-relay-traces-prod']
| where name startswith 'http.server'
| extend endpoint = column_ifexists('attributes.http.route', ''),
    customAttributes = column_ifexists('attributes.custom', dynamic({}))
| project _time, name, trace_id, duration,
    ['attributes.http.request.method'],
    ['attributes.url.path'],
    ['attributes.http.response.status_code'],
    endpoint,
    relayOperation = customAttributes['relay']['operation']
| order by _time desc
| limit 200
```

The five-minute cron exports its spans the same way, including the tunnel cleanup sweep
(`relay.managed_endpoint_reaper.sweep`) and its counters.

Prefer the provisioned view or APL queries over tailing the Worker for completed incidents. The
stack provisions no query token; responders with scripted access use the account-level
`AXIOM_TOKEN` with `AXIOM_ORG_ID`.

DPoP proof failures carry the `relay.dpop.failure_code` span attribute. A `time_window` failure
means a signed proof was too old or too far in the future. It can point to a clock problem on
either device, or to a delayed request. Clients use this category, and its absence on an older
relay, to decide whether clock skew is confirmed or only a possible cause.
