/**
 * AgentService - the in-app agent's conversations.
 *
 * A thread is persisted in SQLite with its turns and turn items. Sending a message opens (or
 * reuses) a provider session through the thread's provider instance adapter, issues an MCP
 * credential so the provider can call the app's tools, starts a turn, and ingests the adapter's
 * events into the store. Subscribers get a snapshot followed by live changes.
 *
 * @module AgentService
 */
import type {
  AgentCreateThreadInput,
  AgentError,
  AgentRespondToRequestInput,
  AgentSendMessageInput,
  AgentThreadEvent,
  AgentThreadListEvent,
  AgentThreadSummary,
  AgentTurn,
  AgentUpdateThreadInput,
  ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";

export interface AgentServiceShape {
  readonly createThread: (
    input: AgentCreateThreadInput,
  ) => Effect.Effect<AgentThreadSummary, AgentError>;
  readonly updateThread: (
    input: AgentUpdateThreadInput,
  ) => Effect.Effect<AgentThreadSummary, AgentError>;
  readonly deleteThread: (threadId: ThreadId) => Effect.Effect<void, AgentError>;
  /** Starts a turn, or steers the running one when the provider supports steering. */
  readonly sendMessage: (input: AgentSendMessageInput) => Effect.Effect<AgentTurn, AgentError>;
  readonly interrupt: (threadId: ThreadId) => Effect.Effect<void, AgentError>;
  readonly respondToRequest: (input: AgentRespondToRequestInput) => Effect.Effect<void, AgentError>;
  /** A snapshot of every thread summary, then changes. */
  readonly streamThreads: Stream.Stream<AgentThreadListEvent, AgentError>;
  /** A snapshot of one thread, then changes; ends after a `removed` event. */
  readonly streamThread: (threadId: ThreadId) => Stream.Stream<AgentThreadEvent, AgentError>;
}

export class AgentService extends Context.Service<AgentService, AgentServiceShape>()(
  "t3/agent/AgentService",
) {}
