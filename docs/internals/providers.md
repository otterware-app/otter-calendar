# Provider constraints

The agent service records conversations without knowing which provider runs a thread. Provider
protocols, account ownership, permissions, and capabilities belong at the
[adapter boundary](../../apps/server/src/provider/adapters/ProviderAdapter.ts). Normalize there
instead of spreading provider checks through the agent service and clients. The scaffold ships
Claude (Agent SDK) and Codex (app-server); T3 Code's other adapters (Cursor, OpenCode, Grok, Pi,
Antigravity, ACP) are left upstream and can be ported the same way.

A driver kind identifies an integration; an instance identifies one configuration and account
lifecycle. Route work by instance, so two accounts using the same driver do not share mutable
session or catalog state.

## Setup must not happen as a health-check side effect

Opening a provider session can start MCP servers, run hooks, or launch a login browser. Status
probes therefore read versions, sign-in state and catalogs without opening agent sessions;
authenticated catalog work waits for explicit setup or a user's model refresh.

Provider sign-in belongs to the initiating auth session. When the browser runs on another
machine than the environment, the client carries the provider's loopback return URL back to the
environment; forward only the callback for the owned pending flow. A successful callback HTTP
request is not proof that authentication finished; the native process owns token exchange and
storage.

Managed ChatGPT sign-in for a remote environment can finish on a local primary. The
[primary handoff](../../apps/server/src/provider/CodexChatGptHandoff.ts) uses an ephemeral
credential store and the destination's environment ID. It exchanges and verifies the code before
transferring the issued client registration and tokens. Only the destination persists and refreshes
that session; retaining a primary refresh session would race refresh-token rotation. Without a local
primary, the client uses the remote callback completion flow.

## Provider updates run only through the owning installer

A one-click update is offered only when the resolved executable's path proves which installer owns
it. Homebrew and npm are proven by the real path (symlinks followed): a versioned keg or cask under
`brew --prefix`, or `<prefix>/lib/node_modules/<pkg>/`. Native installer layouts and the global bin
directories of pnpm, Bun, and Vite+ may match on either the resolved path or its real target, since
those installers place real files or their own symlinks there. Anything unproven stays manual-only
but still reports the version gap. npm updates pin `--prefix` because the `npm` on `PATH` can
belong to a different Node than the one that owns the provider. Homebrew compares against
`brew info` since casks trail npm by hours; native installs share npm's version train, so the
registry stays authoritative for them.

Ownership is cached per instance and re-read immediately before an update runs; the runner refuses
when the lock key changed since the advisory, and reports success only when the refreshed provider
is still installed with a readable, current version.

## Protocol traps

Capabilities must describe what the provider can actually do. Native permission and question
option IDs must survive normalization; a display label is not necessarily a valid reply.

App tools reach providers over MCP with a per-session credential (see [the agent](./agent.md)).
Claude receives them as `mcpServers` in its query options, and they are pre-approved through
`allowedTools` (`mcp__<slug>__*`, or only the read-only tools in `approval-required` mode).
Codex receives them as `mcp_servers` on thread start and resume, and relies on its own MCP
approval flow. Adapters log only whether MCP configuration exists, never the headers.

## Provider diagnostics

Native event logs retain lifecycle events, responses, and failures. Token deltas and duplicate raw
frames are filtered before adapters copy or redact payloads; decode failures remain visible through
diagnostic frames.

Log payloads have a 64 KiB encoded budget. Large or deeply nested payloads become structural
summaries that retain routing identifiers, methods, status, and error fields. Traversal is bounded
before redaction and serialization, so logging a large response does not require several full
copies. These limits apply to diagnostics; provider event handling is unchanged.

Model classification has its own [manifest constraints](./model-manifest.md).
