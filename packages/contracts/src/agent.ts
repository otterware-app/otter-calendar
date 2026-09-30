/**
 * The in-app agent: conversations the user has with a provider (Claude, Codex, …) that can
 * operate the app through its MCP tools.
 *
 * A thread is one conversation. Each user message starts a turn; the provider adapter streams
 * turn items (assistant text, reasoning, tool calls, approvals) that the server persists and
 * forwards. Items reuse the provider layer's `OrchestrationV2TurnItem` shapes, so every adapter
 * is normalized once, at the adapter boundary.
 */
import * as Schema from "effect/Schema";

import {
  IsoDateTime,
  MessageId,
  NonNegativeInt,
  RunId,
  RuntimeRequestId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { ModelSelection } from "./modelSelection.ts";
import { OrchestrationV2RuntimeRequest, OrchestrationV2TurnItem } from "./orchestrationV2.ts";
import {
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
  RuntimeMode,
} from "./providerPolicy.ts";

export const AgentThreadStatus = Schema.Literals([
  /** No turn is running. */
  "idle",
  /** A turn was accepted and the provider session is opening. */
  "starting",
  /** The provider is working. */
  "running",
  /** The provider is blocked on an approval or a question. */
  "waiting",
]);
export type AgentThreadStatus = typeof AgentThreadStatus.Type;

export const AgentTurnStatus = Schema.Literals(["running", "completed", "interrupted", "failed"]);
export type AgentTurnStatus = typeof AgentTurnStatus.Type;

export const AgentTurn = Schema.Struct({
  turnId: RunId,
  ordinal: NonNegativeInt,
  status: AgentTurnStatus,
  startedAt: IsoDateTime,
  completedAt: Schema.NullOr(IsoDateTime),
  /** A user-facing failure message when `status` is `failed`. */
  error: Schema.NullOr(Schema.String),
});
export type AgentTurn = typeof AgentTurn.Type;

export const AgentThreadSummary = Schema.Struct({
  threadId: ThreadId,
  title: Schema.String,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  status: AgentThreadStatus,
  /** The last user or assistant text, trimmed for list rows. */
  preview: Schema.String,
  /** Pending approvals or questions. Non-zero means the thread needs the user. */
  pendingRequestCount: NonNegativeInt,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type AgentThreadSummary = typeof AgentThreadSummary.Type;

export const AgentThreadDetail = Schema.Struct({
  thread: AgentThreadSummary,
  turns: Schema.Array(AgentTurn),
  /** Every item of every turn, ordered by turn, then by item ordinal. */
  items: Schema.Array(OrchestrationV2TurnItem),
  /** Approvals and questions that still wait for an answer. */
  pendingRequests: Schema.Array(OrchestrationV2RuntimeRequest),
});
export type AgentThreadDetail = typeof AgentThreadDetail.Type;

// ── Streams ──────────────────────────────────────────────────────────

export const AgentThreadListEvent = Schema.Union([
  Schema.TaggedStruct("snapshot", { threads: Schema.Array(AgentThreadSummary) }),
  Schema.TaggedStruct("upserted", { thread: AgentThreadSummary }),
  Schema.TaggedStruct("removed", { threadId: ThreadId }),
]);
export type AgentThreadListEvent = typeof AgentThreadListEvent.Type;

export const AgentThreadEvent = Schema.Union([
  /** First event of every subscription, and again after the server lost track of a client. */
  Schema.TaggedStruct("snapshot", { detail: AgentThreadDetail }),
  Schema.TaggedStruct("thread", { thread: AgentThreadSummary }),
  Schema.TaggedStruct("turn", { turn: AgentTurn }),
  /** An item was added or changed; streaming text arrives as repeated upserts of one item. */
  Schema.TaggedStruct("item", { item: OrchestrationV2TurnItem }),
  Schema.TaggedStruct("request", { request: OrchestrationV2RuntimeRequest }),
  Schema.TaggedStruct("removed", {}),
]);
export type AgentThreadEvent = typeof AgentThreadEvent.Type;

// ── Inputs ───────────────────────────────────────────────────────────

export const AgentCreateThreadInput = Schema.Struct({
  title: Schema.optional(TrimmedNonEmptyString),
  /** Defaults to the environment's default model selection. */
  modelSelection: Schema.optional(ModelSelection),
  /** Defaults to the environment's default runtime mode. */
  runtimeMode: Schema.optional(RuntimeMode),
  /** Sent as the first message when present. */
  message: Schema.optional(Schema.String),
  /**
   * App context the agent should know about, such as the item the user was looking at.
   * Appended to the message as a fenced block; it is not shown as user text.
   */
  context: Schema.optional(Schema.String),
});
export type AgentCreateThreadInput = typeof AgentCreateThreadInput.Type;

export const AgentSendMessageInput = Schema.Struct({
  threadId: ThreadId,
  messageId: Schema.optional(MessageId),
  text: TrimmedNonEmptyString,
  context: Schema.optional(Schema.String),
});
export type AgentSendMessageInput = typeof AgentSendMessageInput.Type;

export const AgentUpdateThreadInput = Schema.Struct({
  threadId: ThreadId,
  title: Schema.optional(TrimmedNonEmptyString),
  modelSelection: Schema.optional(ModelSelection),
  runtimeMode: Schema.optional(RuntimeMode),
});
export type AgentUpdateThreadInput = typeof AgentUpdateThreadInput.Type;

export const AgentThreadRefInput = Schema.Struct({ threadId: ThreadId });
export type AgentThreadRefInput = typeof AgentThreadRefInput.Type;

export const AgentRespondToRequestInput = Schema.Struct({
  threadId: ThreadId,
  requestId: RuntimeRequestId,
  decision: Schema.optional(ProviderApprovalDecision),
  answers: Schema.optional(ProviderUserInputAnswers),
});
export type AgentRespondToRequestInput = typeof AgentRespondToRequestInput.Type;

export class AgentError extends Schema.TaggedError<AgentError>()("AgentError", {
  code: Schema.Literals([
    "thread_not_found",
    "request_not_found",
    "provider_unavailable",
    "busy",
    "failed",
  ]),
  detail: Schema.String,
}) {
  override get message(): string {
    return this.detail;
  }
}
