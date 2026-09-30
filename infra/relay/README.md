# T3 Connect relay

The relay is the hosted control plane for T3 Connect: it links environments to a signed-in account
and brokers the credentials clients use to reach them. It is not in the path of normal app traffic.
Once a client connects, API and WebSocket traffic go directly between the client and the
environment, through the environment's managed tunnel. See the
[T3 Connect architecture note](../../docs/internals/t3-connect.md) for the design.

## Responsibilities

- Linking environments to a Clerk account and listing an account's environments.
- Provisioning, recovering, and reclaiming managed Cloudflare tunnels and their hostnames.
- Issuing short-lived, DPoP-bound credentials for connecting clients to linked environments.
- Persisting relay state in PlanetScale Postgres and exporting traces to Axiom.

The environment server and the relay have separate credentials and trust boundaries. Read
[environment authentication](../../docs/internals/environment-auth.md) before changing token,
credential, or authorization behavior.

## Code map

- [`alchemy.run.ts`](./alchemy.run.ts) defines the deployed Alchemy stack (`<DisplayName>Relay`,
  from `BRAND.displayName`).
- [`src/worker.ts`](./src/worker.ts) wires Cloudflare bindings, runtime layers, the HTTP API, and
  the five-minute maintenance cron.
- [`src/http/Api.ts`](./src/http/Api.ts) contains the HTTP handlers and authentication boundaries.
- [`src/environments`](./src/environments) contains environment linking, credentials, connection,
  and managed endpoint provisioning and cleanup.
- [`src/auth`](./src/auth) contains relay tokens and DPoP proof handling.
- [`src/persistence/schema.ts`](./src/persistence/schema.ts) defines persisted state. Keep schema
  and migration changes together.

Request and response schemas live in
[`packages/contracts/src/relay.ts`](../../packages/contracts/src/relay.ts); shared client calls live
in [`packages/client-runtime/src/relay`](../../packages/client-runtime/src/relay).

## Working locally

From the repository root, after `vp i`:

```sh
cd infra/relay
vp test run
vp run typecheck
```

Backend changes ship with tests. Test the real logic with external dependencies represented at
their boundary rather than mocking internal behavior.

## Deployment

The relay deploys with Alchemy (`deploy` is `alchemy deploy` in this directory). It provisions the
Cloudflare Worker, managed endpoint resources, the PlanetScale database and Hyperdrive connection,
and the Axiom trace dataset and ingest tokens.

Copy [`.env.example`](./.env.example) to `.env` in this directory and fill it in before deploying:

| Variable                    | Required | Meaning                                                               |
| --------------------------- | -------- | --------------------------------------------------------------------- |
| `RELAY_API_ZONE_NAME`       | yes      | Cloudflare zone for the relay API (`relay.<zone>` in production)      |
| `RELAY_TUNNEL_ZONE_NAME`    | yes      | Cloudflare zone below which managed environment hostnames are created |
| `RELAY_DOMAIN`              | no       | Override for the derived relay hostname                               |
| `RELAY_TUNNEL_CLEANUP_MODE` | no       | `off` (default), `dry-run`, or `enabled`; see below                   |
| `CLERK_PUBLISHABLE_KEY`     | yes      | Clerk publishable key                                                 |
| `CLERK_SECRET_KEY`          | yes      | Clerk secret key                                                      |
| `CLERK_JWT_AUDIENCE`        | yes      | The `aud` claim of the Clerk JWT template clients use                 |

Alchemy's providers also need `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`,
`PLANETSCALE_ORGANIZATION`, `PLANETSCALE_API_TOKEN_ID` and `PLANETSCALE_API_TOKEN`, and
`AXIOM_ORG_ID` and `AXIOM_TOKEN` (an Axiom personal access token). These account-level credentials
are used while provisioning; the Worker never receives them.

The `prod` stage owns the retained PlanetScale database and the DNS zones. Every other stage
references them and gets an isolated database branch, so deploy `prod` first:

```sh
vp run --filter t3code-relay deploy --stage prod
vp run --filter t3code-relay deploy --env-file .env.local
```

Personal stages default to `dev_$USER`. The API hostname is `relay.<RELAY_API_ZONE_NAME>` for
`prod` and `relay-<stage>.<RELAY_API_ZONE_NAME>` otherwise (for example `relay-dev-julius`).
Managed environment hostnames are `<slug>-<stage>-<digest>.<RELAY_TUNNEL_ZONE_NAME>`, so apps built
from the scaffold can share a Cloudflare account and tunnel zone. Never run `alchemy destroy`
against `prod`.

The stack's `PublishClientConfig` action ([`src/clientConfig.ts`](./src/clientConfig.ts)) writes
the deployed relay URL and client tracing configuration into the repository-root `.env`, so later
source builds use the relay you just deployed. It runs only when one of those values changed;
`T3CODE_RELAY_CLIENT_CONFIG_ENV` redirects it to another file.

### Deployment CI

`.github/workflows/deploy-relay.yml` deploys `prod` on every push to `main`, in the `production`
GitHub environment. Pull requests do not deploy. The workflow reads:

- variables: `CLOUDFLARE_ACCOUNT_ID`, `PLANETSCALE_ORGANIZATION`, `AXIOM_ORG_ID`,
  `RELAY_API_ZONE_NAME`, `RELAY_TUNNEL_ZONE_NAME`, `RELAY_DOMAIN` (optional),
  `RELAY_TUNNEL_CLEANUP_MODE` (optional), `CLERK_PUBLISHABLE_KEY`, `CLERK_JWT_AUDIENCE`;
- secrets: `CLOUDFLARE_API_TOKEN`, `PLANETSCALE_API_TOKEN_ID`, `PLANETSCALE_API_TOKEN`,
  `AXIOM_TOKEN`, `CLERK_SECRET_KEY`.

The release workflow reads the relay's public configuration (and `CLERK_JWT_TEMPLATE` and
`CLERK_CLI_OAUTH_CLIENT_ID`) from the same environment; see
[release configuration](../../docs/operations/release.md#configuration).

### Idle tunnel cleanup

Cloudflare bills tunnels whether or not a connector is attached. With `RELAY_TUNNEL_CLEANUP_MODE`
set to `enabled`, the cron deletes tunnels that have been down for more than five minutes, or never
connected within an hour, as long as their host registered recovery; the host replaces the tunnel
when it comes back. The mode is read at deploy time, so changing it needs a forced deploy
(dispatch the workflow with `force`). Start with `dry-run` and read the counters on the
`relay.managed_endpoint_reaper.sweep` span (`scanned`, `wouldDelete`, `skippedLegacy`,
`skippedOrphan`, `failed`, `truncated`) before enabling it.

See also:

- [T3 Connect setup](../../docs/operations/connect-setup.md) for Clerk keys, JWT templates, and
  sign-up restrictions.
- [Relay observability](../../docs/operations/relay-observability.md) for traces and queries.
