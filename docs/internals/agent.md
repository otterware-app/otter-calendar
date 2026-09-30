# The in-app agent

The agent is the assistant inside the app. It runs on the user's own Claude Code or Codex
subscription, on the environment, and works on the app's data through the app's tools. The
design takes T3 Code's provider layer and Otter Mail's product idea (an assistant that operates
the app, shown as a conversation with foldable steps) and leaves out T3's orchestration.

## Three layers

1. **Providers** ([`src/provider`](../../apps/server/src/provider)) own everything
   provider-shaped: installation, sign-in, model catalogs, status, and the adapters
   ([`src/provider/adapters`](../../apps/server/src/provider/adapters)) that turn Claude's Agent SDK
   and Codex's app-server into one interface. Adapters emit normalized
   `OrchestrationV2TurnItem`s and runtime requests (approvals, questions). Provider differences
   stop there; see [provider constraints](./providers.md).
2. **The agent service** ([`src/agent`](../../apps/server/src/agent)) owns conversations: threads,
   turns, turn items and pending requests in SQLite, one provider session per active thread,
   and the streams clients subscribe to. It is deliberately small. There is no event log,
   command bus, projection, checkpoint or fork machinery. A thread's rows are the truth, and
   every change to a thread happens under that thread's lock, so a subscriber's snapshot is
   never newer than the changes that follow it.
3. **App tools** ([`src/mcp`](../../apps/server/src/mcp)) are Effect `Toolkit`s served on the
   environment's authenticated `/mcp` endpoint. [`AppToolkit.ts`](../../apps/server/src/mcp/AppToolkit.ts)
   is the one list of the app's tools.

## App tools call the same services as clients

A tool handler calls the same feature service an RPC handler calls (the calendar toolkit calls
`CalendarService`). The agent's change then takes the path a click takes: same validation, same
persistence, same live update to every client. Never give the agent a second way to write app
data, such as files or SQL, because clients would not see it.

The provider reaches `/mcp` with a credential the agent service issues per provider session and
revokes when the session closes. The server is registered under `BRAND.slug`, so Claude sees
tools as `mcp__<slug>__<tool>`.

## Approvals follow the runtime mode

Read-only tools carry the `Readonly` annotation. In `approval-required` mode, only read-only
app tools are pre-approved, and anything that changes data goes through the provider's own
permission flow, which reaches the user as a pending request in the thread. In the other modes,
app tools run without asking. Keep annotations honest: a tool marked read-only is never
confirmed.

## Instructions and context

[`agent/instructions.ts`](../../apps/server/src/agent/instructions.ts) is appended to the
provider's own prompt: it tells the agent it is inside the app and to prefer app tools. Clients
pass what the user is looking at as `context`, which reaches the provider as a fenced block
after the message and is not shown as user text. Keep both short. The provider already knows
how to be an agent; it only needs to know where it is.

The agent's working directory is `<stateDir>/agent-workspace`, a scratch folder. App data never
lives there.

## Lifecycle traps

- `sendMessage` returns once the turn is recorded. Opening the session and starting the turn
  happen after, so the UI shows the user's message immediately even when a provider is slow to
  start.
- A second message during a running turn steers it when the adapter supports steering, and
  fails with `busy` otherwise. Clients should say so rather than queue silently.
- Stopping must always get out: a stop before the provider started cancels the start; a second
  stop settles the turn locally and drops the session, in case the provider ignores the first.
- After a restart, turns left running become interrupted and pending requests expire. The
  provider conversation resumes from the stored provider thread on the next message.
- Items are ordered by turn, then by item ordinal. Provider turn ordinals restart when a thread
  moves to another provider instance, so a global ordinal is not an order.
- Switching a thread to another provider starts a fresh provider conversation; earlier turns
  stay visible but are not handed to the new provider.

## Presentation

[`agent-steps`](../../packages/client-runtime/src/agentSteps.ts) turns items into what web and
mobile render: the user's prompt, the work (tool calls as one-line steps, grouped by source),
and the answer after the last step. While a turn runs, the UI shows "Working for Ns"; once it
ends, the work folds behind "Worked for Ns". Both clients share this helper, so they label steps
the same way.
