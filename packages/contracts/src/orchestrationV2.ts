import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import * as SchemaGetter from "effect/SchemaGetter";

import {
  CheckpointId,
  CheckpointScopeId,
  CommandId,
  ContextHandoffId,
  ContextTransferId,
  IsoDateTime,
  MessageId,
  NodeId,
  NonNegativeInt,
  PlanId,
  PositiveInt,
  ProjectId,
  ProviderSessionId,
  ProviderThreadId,
  ProviderTurnId,
  RunAttemptId,
  RunId,
  RuntimeRequestId,
  ScheduledTaskId,
  ThreadId,
  TrimmedNonEmptyString,
  TurnItemId,
} from "./baseSchemas.ts";
import { ChatAttachment } from "./chatAttachment.ts";
import { ModelSelection } from "./modelSelection.ts";
import {
  ProviderApprovalDecision,
  ProviderApprovalOption,
  ProviderInteractionMode,
  ProviderRequestKind,
  ProviderUserInputAnswers,
  UserInputAttachmentAnswerPayload,
  RuntimeMode,
} from "./providerPolicy.ts";
import { ProviderDriverKind, ProviderInstanceId } from "./providerInstance.ts";
import {
  TurnTokenUsage,
  ToolActivitySurface,
  ToolActivityIcon,
  ToolActivitySource,
} from "./providerRuntime.ts";
import { ThreadTokenUsageSnapshot } from "./providerRuntime.ts";

export const OrchestrationV2Actor = Schema.Literals(["user", "agent", "system"]);
export type OrchestrationV2Actor = typeof OrchestrationV2Actor.Type;

export const OrchestrationV2CreationSource = Schema.Literals([
  "web",
  "mobile",
  "mcp",
  "provider",
  "server",
]);
export type OrchestrationV2CreationSource = typeof OrchestrationV2CreationSource.Type;

export const OrchestrationV2ThreadHistoryOrigin = Schema.Literals(["native", "v1_import"]);
export type OrchestrationV2ThreadHistoryOrigin = typeof OrchestrationV2ThreadHistoryOrigin.Type;

const OrchestrationV2CreationFields = {
  createdBy: OrchestrationV2Actor,
  creationSource: OrchestrationV2CreationSource,
} as const;

export const OrchestrationV2NativeRefStrength = Schema.Literals(["strong", "weak", "none"]);
export type OrchestrationV2NativeRefStrength = typeof OrchestrationV2NativeRefStrength.Type;

export const OrchestrationV2ProviderRef = Schema.Struct({
  driver: ProviderDriverKind,
  nativeId: Schema.NullOr(TrimmedNonEmptyString),
  strength: OrchestrationV2NativeRefStrength,
  fingerprint: Schema.optional(TrimmedNonEmptyString),
  ordinal: Schema.optional(NonNegativeInt),
});
export type OrchestrationV2ProviderRef = typeof OrchestrationV2ProviderRef.Type;

export const OrchestrationV2AppThreadLineage = Schema.Struct({
  parentThreadId: Schema.NullOr(ThreadId),
  relationshipToParent: Schema.NullOr(Schema.Literals(["fork", "subagent"])),
  rootThreadId: ThreadId,
});
export type OrchestrationV2AppThreadLineage = typeof OrchestrationV2AppThreadLineage.Type;

export const OrchestrationV2ContextTransferType = Schema.Literals([
  "fork",
  "provider_handoff",
  "merge_back",
  "subagent_spawn",
  "subagent_result",
]);
export type OrchestrationV2ContextTransferType = typeof OrchestrationV2ContextTransferType.Type;

export const OrchestrationV2ContextSourcePoint = Schema.Struct({
  threadId: ThreadId,
  runId: Schema.optional(RunId),
  checkpointId: Schema.optional(CheckpointId),
  turnItemId: Schema.optional(TurnItemId),
  providerThreadRef: Schema.optional(OrchestrationV2ProviderRef),
  providerTurnRef: Schema.optional(OrchestrationV2ProviderRef),
});
export type OrchestrationV2ContextSourcePoint = typeof OrchestrationV2ContextSourcePoint.Type;

export const OrchestrationV2ContextTransferResolution = Schema.Union([
  Schema.Struct({
    strategy: Schema.Literal("native_fork"),
    providerThreadRef: OrchestrationV2ProviderRef,
  }),
  Schema.Struct({
    strategy: Schema.Literal("portable_context"),
    contextHandoffId: ContextHandoffId,
  }),
  Schema.Struct({
    strategy: Schema.Literal("delta_context"),
    contextHandoffId: ContextHandoffId,
  }),
  Schema.Struct({
    strategy: Schema.Literal("fork_delta_context"),
    contextHandoffId: ContextHandoffId,
  }),
  Schema.Struct({
    strategy: Schema.Literal("checkpoint_context"),
    contextHandoffId: ContextHandoffId,
  }),
]);
export type OrchestrationV2ContextTransferResolution =
  typeof OrchestrationV2ContextTransferResolution.Type;

export const OrchestrationV2SessionCapabilities = Schema.Struct({
  supportsMultipleProviderThreadsPerSession: Schema.Boolean,
  supportsModelSwitchInSession: Schema.Boolean,
  supportsProviderSwitchingViaHandoff: Schema.Boolean,
  supportsRuntimeModeSwitchInSession: Schema.Boolean,
  pendingRequestsSurviveRestart: Schema.Boolean,
});
export type OrchestrationV2SessionCapabilities = typeof OrchestrationV2SessionCapabilities.Type;

export const OrchestrationV2ThreadCapabilities = Schema.Struct({
  canCreateEmptyThread: Schema.Boolean,
  canReadThreadSnapshot: Schema.Boolean,
  canRollbackThread: Schema.Boolean,
  canForkThread: Schema.Boolean,
  canForkFromTurn: Schema.Boolean,
  canForkFromSubagentThread: Schema.Boolean,
  exposesNativeThreadId: Schema.Boolean,
});
export type OrchestrationV2ThreadCapabilities = typeof OrchestrationV2ThreadCapabilities.Type;

export const OrchestrationV2TurnCapabilities = Schema.Struct({
  exposesNativeTurnId: Schema.Boolean,
  emitsTurnStarted: Schema.Boolean,
  emitsTurnCompleted: Schema.Boolean,
  supportsInterrupt: Schema.Boolean,
  supportsActiveSteering: Schema.Boolean,
  supportsSteeringByInterruptRestart: Schema.Boolean,
  supportsQueuedMessages: Schema.Boolean,
  terminalStatusQuality: Schema.Literals(["strong", "weak", "none"]),
});
export type OrchestrationV2TurnCapabilities = typeof OrchestrationV2TurnCapabilities.Type;

export const OrchestrationV2StreamingCapabilities = Schema.Struct({
  streamsAssistantText: Schema.Boolean,
  streamsReasoning: Schema.Boolean,
  streamsToolOutput: Schema.Boolean,
  streamsPlanText: Schema.Boolean,
  emitsMessageCompleted: Schema.Boolean,
});
export type OrchestrationV2StreamingCapabilities = typeof OrchestrationV2StreamingCapabilities.Type;

export const OrchestrationV2ToolCapabilities = Schema.Struct({
  exposesToolItemIds: Schema.Boolean,
  emitsToolStarted: Schema.Boolean,
  emitsToolCompleted: Schema.Boolean,
  emitsToolOutput: Schema.Boolean,
  supportsMcpTools: Schema.Boolean,
  supportsDynamicToolCallbacks: Schema.Boolean,
});
export type OrchestrationV2ToolCapabilities = typeof OrchestrationV2ToolCapabilities.Type;

export const OrchestrationV2ApprovalCapabilities = Schema.Struct({
  supportsCommandApproval: Schema.Boolean,
  supportsFileReadApproval: Schema.Boolean,
  supportsFileChangeApproval: Schema.Boolean,
  supportsApplyPatchApproval: Schema.Boolean,
  approvalsHaveNativeRequestIds: Schema.Boolean,
  approvalCallbacksAreLiveOnly: Schema.Boolean,
  approvalsCanOriginateFromSubagents: Schema.Boolean,
});
export type OrchestrationV2ApprovalCapabilities = typeof OrchestrationV2ApprovalCapabilities.Type;

export const OrchestrationV2PlanningCapabilities = Schema.Struct({
  emitsPlanUpdated: Schema.Boolean,
  emitsTodoList: Schema.Boolean,
  emitsProposedPlan: Schema.Boolean,
  supportsStructuredQuestions: Schema.Boolean,
  planDeltasHaveItemIds: Schema.Boolean,
});
export type OrchestrationV2PlanningCapabilities = typeof OrchestrationV2PlanningCapabilities.Type;

export const OrchestrationV2SubagentCapabilities = Schema.Struct({
  supportsSubagents: Schema.Boolean,
  exposesSubagentThreadIds: Schema.Boolean,
  emitsSubagentLifecycle: Schema.Boolean,
  canWaitForSubagents: Schema.Boolean,
  canCloseSubagents: Schema.Boolean,
  canForkSubagentThread: Schema.Boolean,
});
export type OrchestrationV2SubagentCapabilities = typeof OrchestrationV2SubagentCapabilities.Type;

export const OrchestrationV2ContextCapabilities = Schema.Struct({
  acceptsSystemContext: Schema.Boolean,
  acceptsDeveloperContext: Schema.Boolean,
  acceptsSyntheticUserContext: Schema.Boolean,
  canGenerateSummaries: Schema.Boolean,
  canConsumeHandoffSummaries: Schema.Boolean,
  supportsDeltaHandoff: Schema.Boolean,
  supportsFullThreadHandoff: Schema.Boolean,
  maxRecommendedHandoffChars: Schema.NullOr(PositiveInt),
});
export type OrchestrationV2ContextCapabilities = typeof OrchestrationV2ContextCapabilities.Type;

export const OrchestrationV2CheckpointCapabilities = Schema.Struct({
  appCanCheckpointFilesystem: Schema.Boolean,
  supportsNestedCheckpointScopes: Schema.Boolean,
  providerCanRollbackConversation: Schema.Boolean,
  providerRollbackReturnsSnapshot: Schema.Boolean,
  providerCanReadConversationSnapshot: Schema.Boolean,
});
export type OrchestrationV2CheckpointCapabilities =
  typeof OrchestrationV2CheckpointCapabilities.Type;

export const OrchestrationV2RuntimePolicyCapabilities = Schema.Struct({
  /**
   * Where T3 runtime modes are actually enforced. "native" providers receive
   * the approval and sandbox policy each turn and confine their own execution.
   * "client-boundary" providers only have policy applied where T3 mediates the
   * work (permission requests and client fs/terminal handlers); provider-owned
   * execution is not confined, so sandbox guarantees are reduced.
   */
  enforcement: Schema.Literals(["native", "client-boundary"]),
});
export type OrchestrationV2RuntimePolicyCapabilities =
  typeof OrchestrationV2RuntimePolicyCapabilities.Type;

export const OrchestrationV2IdentityCapabilities = Schema.Struct({
  nativeThreadIds: OrchestrationV2NativeRefStrength,
  nativeTurnIds: OrchestrationV2NativeRefStrength,
  nativeItemIds: OrchestrationV2NativeRefStrength,
  nativeRequestIds: OrchestrationV2NativeRefStrength,
});
export type OrchestrationV2IdentityCapabilities = typeof OrchestrationV2IdentityCapabilities.Type;

export const OrchestrationV2ProviderCapabilities = Schema.Struct({
  sessions: OrchestrationV2SessionCapabilities,
  threads: OrchestrationV2ThreadCapabilities,
  turns: OrchestrationV2TurnCapabilities,
  streaming: OrchestrationV2StreamingCapabilities,
  tools: OrchestrationV2ToolCapabilities,
  approvals: OrchestrationV2ApprovalCapabilities,
  planning: OrchestrationV2PlanningCapabilities,
  subagents: OrchestrationV2SubagentCapabilities,
  context: OrchestrationV2ContextCapabilities,
  checkpointing: OrchestrationV2CheckpointCapabilities,
  identity: OrchestrationV2IdentityCapabilities,
  // Events persisted before this field existed decode to the weaker
  // client-boundary guarantee so replay never overclaims enforcement.
  runtimePolicy: OrchestrationV2RuntimePolicyCapabilities.pipe(
    Schema.withDecodingDefault(Effect.succeed({ enforcement: "client-boundary" as const })),
  ),
});
export type OrchestrationV2ProviderCapabilities = typeof OrchestrationV2ProviderCapabilities.Type;

export const OrchestrationV2LimitRecovery = Schema.Struct({
  requestId: Schema.optional(CommandId),
  runId: RunId,
  resetAt: IsoDateTime,
  autoResume: Schema.Boolean,
  snooze: Schema.optional(Schema.Boolean),
});
export type OrchestrationV2LimitRecovery = typeof OrchestrationV2LimitRecovery.Type;

export const OrchestrationV2AppThread = Schema.Struct({
  ...OrchestrationV2CreationFields,
  id: ThreadId,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  providerInstanceId: ProviderInstanceId,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  branch: Schema.NullOr(TrimmedNonEmptyString),
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
  activeProviderThreadId: Schema.NullOr(ProviderThreadId),
  historyOrigin: Schema.optional(OrchestrationV2ThreadHistoryOrigin),
  lineage: OrchestrationV2AppThreadLineage,
  forkedFrom: Schema.NullOr(
    Schema.Union([
      Schema.Struct({ type: Schema.Literal("run"), threadId: ThreadId, runId: RunId }),
      Schema.Struct({ type: Schema.Literal("node"), nodeId: NodeId }),
      Schema.Struct({
        type: Schema.Literal("provider_thread"),
        providerThreadId: ProviderThreadId,
        providerTurnId: Schema.optional(ProviderTurnId),
      }),
    ]),
  ),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
  archivedAt: Schema.NullOr(Schema.DateTimeUtc),
  settledOverride: Schema.NullOr(Schema.Literals(["settled", "active"])).pipe(
    Schema.withDecodingDefault(Effect.succeed(null)),
  ),
  settledAt: Schema.NullOr(Schema.DateTimeUtc).pipe(
    Schema.withDecodingDefault(Effect.succeed(null)),
  ),
  unsettledAt: Schema.optional(Schema.NullOr(Schema.DateTimeUtc)),
  snoozedUntil: Schema.optional(Schema.NullOr(Schema.DateTimeUtc)),
  snoozedAt: Schema.optional(Schema.NullOr(Schema.DateTimeUtc)),
  limitRecovery: Schema.optional(Schema.NullOr(OrchestrationV2LimitRecovery)),
  pinnedAt: Schema.optional(Schema.NullOr(Schema.DateTimeUtc)),
  autoSettleDisabledAt: Schema.optional(Schema.NullOr(Schema.DateTimeUtc)),
  // Fractional-index slot in the user-arranged pinned order. Optional so
  // payloads from pre-reorder servers still decode.
  pinOrderKey: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  /** Fractional-index slot in the user-arranged active order. */
  activeOrderKey: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  lastVisitedAt: Schema.NullOr(Schema.DateTimeUtc).pipe(
    Schema.withDecodingDefault(Effect.succeed(null)),
  ),
  /** In-flight title regeneration marker; cleared when a new title lands. */
  titleRegeneration: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        requestId: CommandId,
        startedAt: Schema.DateTimeUtc,
      }),
    ),
  ),
  /** Latest accepted rollback. Only its failure is recorded in `rollbackFailure`. */
  rollbackRequestId: Schema.optional(CommandId),
  /** Latest rollback that failed after every retry; cleared when the next rollback starts. */
  rollbackFailure: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        requestId: CommandId,
        message: TrimmedNonEmptyString,
      }),
    ),
  ),
  deletedAt: Schema.NullOr(Schema.DateTimeUtc),
});
export type OrchestrationV2AppThread = typeof OrchestrationV2AppThread.Type;

export const OrchestrationV2RunStatus = Schema.Literals([
  "preparing",
  "queued",
  "starting",
  "running",
  "waiting",
  "completed",
  "interrupted",
  "failed",
  "cancelled",
  "rolled_back",
]);
export type OrchestrationV2RunStatus = typeof OrchestrationV2RunStatus.Type;

export const OrchestrationV2DelegatedCompletionTaskDeliveryState = Schema.Literals([
  "pending",
  "claimed",
  "acknowledged",
  "delivered",
  "disposed",
]);
export type OrchestrationV2DelegatedCompletionTaskDeliveryState =
  typeof OrchestrationV2DelegatedCompletionTaskDeliveryState.Type;

export const OrchestrationV2DelegatedCompletionTaskDelivery = Schema.Struct({
  state: OrchestrationV2DelegatedCompletionTaskDeliveryState,
  observedByRunId: Schema.NullOr(RunId),
});
export type OrchestrationV2DelegatedCompletionTaskDelivery =
  typeof OrchestrationV2DelegatedCompletionTaskDelivery.Type;

export const OrchestrationV2DelegatedCompletionDelivery = Schema.Struct({
  generation: PositiveInt,
  messageId: MessageId,
  taskIds: Schema.Array(NodeId),
});
export type OrchestrationV2DelegatedCompletionDelivery =
  typeof OrchestrationV2DelegatedCompletionDelivery.Type;

export const OrchestrationV2DelegatedCompletionCohort = Schema.Struct({
  disposition: Schema.Literals(["open", "stopped", "disposed"]),
  nextGeneration: PositiveInt,
  delivery: Schema.NullOr(OrchestrationV2DelegatedCompletionDelivery),
});
export type OrchestrationV2DelegatedCompletionCohort =
  typeof OrchestrationV2DelegatedCompletionCohort.Type;

/** Background work that restart recovery cancelled; the next provider turn is told once. */
export const OrchestrationV2RestartCancelledBackgroundWork = Schema.Struct({
  kind: Schema.Literals(["subagent", "shell", "monitor", "task"]),
  label: TrimmedNonEmptyString,
  /** Stable identity (turn item or provider task id) so same-named work is not merged. */
  id: Schema.optional(TrimmedNonEmptyString),
});
export type OrchestrationV2RestartCancelledBackgroundWork =
  typeof OrchestrationV2RestartCancelledBackgroundWork.Type;

/** Replaces a run's recorded restart-cancelled work without touching its lifecycle. */
export const OrchestrationV2RunBackgroundWorkCancelled = Schema.Struct({
  runId: RunId,
  restartCancelledBackgroundWork: Schema.Array(OrchestrationV2RestartCancelledBackgroundWork),
});
export type OrchestrationV2RunBackgroundWorkCancelled =
  typeof OrchestrationV2RunBackgroundWorkCancelled.Type;

export const OrchestrationV2Run = Schema.Struct({
  id: RunId,
  threadId: ThreadId,
  ordinal: PositiveInt,
  providerInstanceId: ProviderInstanceId,
  modelSelection: ModelSelection,
  providerThreadId: Schema.NullOr(ProviderThreadId),
  userMessageId: MessageId,
  rootNodeId: Schema.NullOr(NodeId),
  activeAttemptId: Schema.NullOr(RunAttemptId),
  status: OrchestrationV2RunStatus,
  queuePosition: Schema.optional(Schema.NullOr(PositiveInt)),
  /** Restart recovery holds the queue until the user explicitly resumes it. */
  queueHeld: Schema.optional(Schema.Boolean),
  requestedAt: Schema.DateTimeUtc,
  startedAt: Schema.NullOr(Schema.DateTimeUtc),
  completedAt: Schema.NullOr(Schema.DateTimeUtc),
  checkpointId: Schema.NullOr(CheckpointId),
  contextHandoffId: Schema.NullOr(ContextHandoffId),
  /** Links server-generated restart continuations to the interrupted run. */
  restartContinuationOfRunId: Schema.optional(RunId),
  /**
   * Set by restart recovery on the thread's latest started run. Delivered to
   * the provider with the first later run that reaches a provider turn.
   */
  restartCancelledBackgroundWork: Schema.optional(
    Schema.Array(OrchestrationV2RestartCancelledBackgroundWork),
  ),
  sourcePlanRef: Schema.optional(
    Schema.Struct({
      threadId: ThreadId,
      planId: PlanId,
    }),
  ),
  delegatedCompletion: Schema.optional(OrchestrationV2DelegatedCompletionCohort),
});
export type OrchestrationV2Run = typeof OrchestrationV2Run.Type;

export const OrchestrationV2RunAttempt = Schema.Struct({
  id: RunAttemptId,
  // Provider-thread rows can be reused after recovery; retain the native input destination.
  nativeThreadId: Schema.optional(Schema.String),
  runId: RunId,
  attemptOrdinal: PositiveInt,
  rootNodeId: NodeId,
  providerInstanceId: ProviderInstanceId,
  providerThreadId: ProviderThreadId,
  providerTurnId: Schema.NullOr(ProviderTurnId),
  reason: Schema.Literals(["initial", "steering_restart", "retry", "provider_recovery"]),
  status: Schema.Literals([
    "pending",
    "running",
    "completed",
    "interrupted",
    "failed",
    "cancelled",
    "superseded",
  ]),
  startedAt: Schema.NullOr(Schema.DateTimeUtc),
  completedAt: Schema.NullOr(Schema.DateTimeUtc),
});
export type OrchestrationV2RunAttempt = typeof OrchestrationV2RunAttempt.Type;

export const OrchestrationV2ExecutionNode = Schema.Struct({
  id: NodeId,
  threadId: ThreadId,
  runId: Schema.NullOr(RunId),
  parentNodeId: Schema.NullOr(NodeId),
  rootNodeId: NodeId,
  kind: Schema.Literals([
    "root_turn",
    "assistant_message",
    "reasoning",
    "plan",
    "todo_list",
    "tool_call",
    "approval_request",
    "user_input_request",
    "subagent",
    "hook",
    "system",
  ]),
  status: Schema.Literals([
    "idle",
    "pending",
    "running",
    "waiting",
    "completed",
    "interrupted",
    "failed",
    "cancelled",
    "rolled_back",
  ]),
  countsForRun: Schema.Boolean,
  providerThreadId: Schema.NullOr(ProviderThreadId),
  providerTurnId: Schema.NullOr(ProviderTurnId),
  nativeItemRef: Schema.NullOr(OrchestrationV2ProviderRef),
  runtimeRequestId: Schema.NullOr(RuntimeRequestId),
  checkpointScopeId: Schema.NullOr(CheckpointScopeId),
  startedAt: Schema.NullOr(Schema.DateTimeUtc),
  completedAt: Schema.NullOr(Schema.DateTimeUtc),
});
export type OrchestrationV2ExecutionNode = typeof OrchestrationV2ExecutionNode.Type;

export const OrchestrationV2Subagent = Schema.Struct({
  id: NodeId,
  threadId: ThreadId,
  runId: Schema.NullOr(RunId),
  parentNodeId: NodeId,
  origin: Schema.Literals(["provider_native", "app_owned"]),
  createdBy: OrchestrationV2Actor,
  driver: ProviderDriverKind,
  providerInstanceId: ProviderInstanceId,
  providerThreadId: Schema.NullOr(ProviderThreadId),
  childThreadId: Schema.NullOr(ThreadId),
  nativeTaskRef: Schema.NullOr(OrchestrationV2ProviderRef),
  prompt: Schema.String,
  title: Schema.NullOr(Schema.String),
  model: Schema.NullOr(Schema.String),
  // Parent-wake policy for app-owned tasks: "always" offers a continuation on
  // every terminal (async delegations; queue_after_active sequences it behind
  // a live parent run), "settled_only" offers only when the parent has no
  // live run (wait-mode delegations, whose result returns through the
  // blocking tool call). Absent on legacy records; treated as settled_only.
  completionWake: Schema.optional(Schema.Literals(["always", "settled_only"])),
  completionDelivery: Schema.optional(OrchestrationV2DelegatedCompletionTaskDelivery),
  status: Schema.Literals([
    "idle",
    "pending",
    "running",
    "waiting",
    "completed",
    "failed",
    "cancelled",
    "interrupted",
  ]),
  progress: Schema.optional(Schema.String),
  result: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(Schema.DateTimeUtc),
  completedAt: Schema.NullOr(Schema.DateTimeUtc),
  updatedAt: Schema.DateTimeUtc,
});
export type OrchestrationV2Subagent = typeof OrchestrationV2Subagent.Type;

/** Idle work is resumable, but does not keep a turn or its subscription alive. */
export function isOrchestrationV2WorkActive(
  status: OrchestrationV2ExecutionNode["status"],
): boolean {
  return status === "pending" || status === "running" || status === "waiting";
}

export const OrchestrationV2CheckpointScope = Schema.Struct({
  id: CheckpointScopeId,
  threadId: ThreadId,
  runId: Schema.NullOr(RunId),
  nodeId: NodeId,
  parentScopeId: Schema.NullOr(CheckpointScopeId),
  providerThreadId: Schema.NullOr(ProviderThreadId),
  kind: Schema.Literals(["root_run", "subagent", "tool", "provider_thread", "manual"]),
  ordinalWithinParent: NonNegativeInt,
  advancesAppRunCount: Schema.Boolean,
  cwd: TrimmedNonEmptyString,
  createdAt: Schema.DateTimeUtc,
});
export type OrchestrationV2CheckpointScope = typeof OrchestrationV2CheckpointScope.Type;

export const OrchestrationV2ProviderSession = Schema.Struct({
  id: ProviderSessionId,
  driver: ProviderDriverKind,
  providerInstanceId: ProviderInstanceId,
  status: Schema.Literals(["starting", "ready", "running", "waiting", "stopped", "error"]),
  cwd: TrimmedNonEmptyString,
  model: Schema.NullOr(TrimmedNonEmptyString),
  capabilities: OrchestrationV2ProviderCapabilities,
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
  lastError: Schema.NullOr(Schema.String),
});
export type OrchestrationV2ProviderSession = typeof OrchestrationV2ProviderSession.Type;

export const OrchestrationV2ProviderSessionDetached = Schema.Struct({
  providerSessionId: ProviderSessionId,
  detachedAt: Schema.DateTimeUtc,
  reason: Schema.optional(Schema.String),
});
export type OrchestrationV2ProviderSessionDetached =
  typeof OrchestrationV2ProviderSessionDetached.Type;

/** The literal `kind` a union member is stored and sent with. */
function encodedKind(member: Schema.Top): string {
  const encoded = SchemaAST.toEncoded(member.ast);
  const kind = SchemaAST.isObjects(encoded)
    ? encoded.propertySignatures.find((property) => property.name === "kind")?.type
    : undefined;
  if (kind !== undefined && SchemaAST.isLiteral(kind) && typeof kind.literal === "string") {
    return kind.literal;
  }
  throw new Error("Each member of a kind union needs a literal string `kind`.");
}

/**
 * A union tagged by `kind` that tolerates kinds this build does not know.
 * After the known members comes a decode-only arm: an object with an unknown
 * `kind`, or none, decodes through `fallback` to a known member instead of
 * failing, so a newer server can add kinds without breaking older clients and
 * rows written before a kind existed still load. `unknown` builds that arm's
 * input around the given `kind` field. A known kind whose fields do not decode
 * still fails. Kinds are the encoded ones, which a member may rename on decode.
 * The arm never encodes; values always match a known member first.
 */
function kindUnionWithFallback<
  const Members extends ReadonlyArray<Schema.Top & { readonly Encoded: { readonly kind: string } }>,
  Unknown extends Schema.Top,
>(
  members: Members,
  unknown: (kind: Schema.optional<Schema.String>) => Unknown,
  fallback: (value: Unknown["Type"]) => Schema.Union<Members>["Encoded"],
) {
  const knownKinds: ReadonlySet<string> = new Set(members.map(encodedKind));
  const unknownKind = unknown(
    Schema.optional(
      Schema.String.check(
        Schema.makeFilter(
          (kind: string) => !knownKinds.has(kind) || "A known kind must decode in full.",
        ),
      ),
    ),
  ).pipe(
    Schema.decodeTo(Schema.Union(members), {
      decode: SchemaGetter.transform(fallback),
      encode: SchemaGetter.forbidden(() => "Unknown kinds are decode-only."),
    }),
  );
  // Members are tried in order, so the fallback must come last.
  return Schema.Union([...members, unknownKind]);
}

const PendingBackgroundTaskFields = {
  taskId: TrimmedNonEmptyString,
  /** The work's name: a subagent's title, a command's description, a monitor's. */
  description: Schema.optional(TrimmedNonEmptyString),
};

/**
 * Provider-owned background work that can outlive the root turn (for example a
 * Claude background Bash task). Associated with the provider thread so shared
 * runtimes cannot make an unrelated app thread look busy. Adapters pick the
 * kind; `background_task` is work they cannot name. Rosters persisted before
 * kinds existed carry no `kind` and load as `background_task`.
 */
export const OrchestrationV2PendingBackgroundTask = kindUnionWithFallback(
  [
    Schema.Struct({
      ...PendingBackgroundTaskFields,
      kind: Schema.Literal("subagent"),
      /** The subagent's own thread, when it has one. */
      childThreadId: Schema.optional(ThreadId),
    }),
    Schema.Struct({ ...PendingBackgroundTaskFields, kind: Schema.Literal("command") }),
    Schema.Struct({ ...PendingBackgroundTaskFields, kind: Schema.Literal("monitor") }),
    Schema.Struct({ ...PendingBackgroundTaskFields, kind: Schema.Literal("background_task") }),
  ],
  (kind) => Schema.Struct({ ...PendingBackgroundTaskFields, kind }),
  ({ taskId, description }) => ({
    taskId,
    ...(description === undefined ? {} : { description }),
    kind: "background_task",
  }),
);
export type OrchestrationV2PendingBackgroundTask = typeof OrchestrationV2PendingBackgroundTask.Type;

/** Provider and adapter metadata that should not overwrite the app thread's title. */
export const OrchestrationV2ProviderThreadNativeMetadata = Schema.Struct({
  title: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  updatedAt: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  /** Version 2 scopes provider-derived item ids by provider instance. */
  itemIdentityVersion: Schema.optional(Schema.Literal(2)),
});
export type OrchestrationV2ProviderThreadNativeMetadata =
  typeof OrchestrationV2ProviderThreadNativeMetadata.Type;

export const OrchestrationV2ProviderThread = Schema.Struct({
  id: ProviderThreadId,
  driver: ProviderDriverKind,
  providerInstanceId: ProviderInstanceId,
  providerSessionId: Schema.NullOr(ProviderSessionId),
  appThreadId: Schema.NullOr(ThreadId),
  ownerNodeId: Schema.NullOr(NodeId),
  nativeThreadRef: Schema.NullOr(OrchestrationV2ProviderRef),
  nativeConversationHeadRef: Schema.NullOr(OrchestrationV2ProviderRef),
  status: Schema.Literals(["not_loaded", "idle", "active", "archived", "closed", "error"]),
  firstRunOrdinal: Schema.NullOr(PositiveInt),
  lastRunOrdinal: Schema.NullOr(PositiveInt),
  handoffIds: Schema.Array(ContextHandoffId),
  forkedFrom: Schema.NullOr(
    Schema.Struct({
      providerThreadId: ProviderThreadId,
      providerTurnId: Schema.optional(ProviderTurnId),
      checkpointId: Schema.optional(CheckpointId),
    }),
  ),
  // Optional Type so adapters can omit empty rosters; historical JSON decodes to [].
  pendingBackgroundTasks: Schema.optional(Schema.Array(OrchestrationV2PendingBackgroundTask)).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  contextUsage: Schema.optional(Schema.NullOr(ThreadTokenUsageSnapshot)).pipe(
    Schema.withDecodingDefault(Effect.succeed(null)),
  ),
  nativeMetadata: Schema.optional(Schema.NullOr(OrchestrationV2ProviderThreadNativeMetadata)).pipe(
    Schema.withDecodingDefault(Effect.succeed(null)),
  ),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
});
export type OrchestrationV2ProviderThread = typeof OrchestrationV2ProviderThread.Type;

export const OrchestrationV2HistoricalMessage = Schema.Struct({
  role: Schema.Literals(["user", "assistant"]),
  text: Schema.String,
  runStatus: Schema.optional(Schema.String),
  threadId: ThreadId,
  runId: Schema.NullOr(RunId),
  itemId: TurnItemId,
  providerThreadId: Schema.NullOr(ProviderThreadId),
  status: Schema.String,
  kind: Schema.String,
});
export type OrchestrationV2HistoricalMessage = typeof OrchestrationV2HistoricalMessage.Type;

export const OrchestrationV2ContextHandoff = Schema.Struct({
  id: ContextHandoffId,
  transferId: Schema.optional(Schema.NullOr(ContextTransferId)),
  threadId: ThreadId,
  targetRunId: RunId,
  fromProviderThreadIds: Schema.Array(ProviderThreadId),
  toProviderThreadId: ProviderThreadId,
  coveredRunOrdinals: Schema.Struct({
    from: PositiveInt,
    to: PositiveInt,
  }),
  strategy: Schema.Literals([
    "delta_since_target_last_seen",
    "fork_delta_summary",
    "full_thread_summary",
    "checkpoint_summary",
    "manual_context",
  ]),
  status: Schema.Literals(["pending", "ready", "failed", "superseded"]),
  summaryMessageId: Schema.NullOr(MessageId),
  summaryText: Schema.String,
  // Optional fields keep existing preview events and projections readable without a migration.
  history: Schema.optional(
    Schema.Struct({
      messages: Schema.Array(OrchestrationV2HistoricalMessage),
      coverage: Schema.String,
      omittedItems: NonNegativeInt,
      // IDs omitted during preparation, before the target's delivery budget is known.
      omittedItemIds: Schema.optional(Schema.Array(TurnItemId)),
    }),
  ),
  delivery: Schema.optional(
    Schema.Struct({
      nativeThreadId: Schema.String,
      status: Schema.Literals(["pending", "injected", "inline"]),
      itemIds: Schema.Array(TurnItemId),
      // Covered by recovery instructions, but not present in native model history.
      omittedItemIds: Schema.optional(Schema.Array(TurnItemId)),
    }),
  ),
  detailInTurnItem: Schema.optional(Schema.Literal(true)),
  createdByProviderInstanceId: Schema.NullOr(ProviderInstanceId),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
});
export type OrchestrationV2ContextHandoff = typeof OrchestrationV2ContextHandoff.Type;

/** Live context usage reported by the provider mid-turn (#8144). */
export const OrchestrationV2ProviderTurnTokenUsage = Schema.Struct({
  usedTokens: NonNegativeInt,
  maxTokens: Schema.optional(Schema.NullOr(NonNegativeInt)),
  inputTokens: Schema.optional(NonNegativeInt),
  cachedInputTokens: Schema.optional(NonNegativeInt),
  outputTokens: Schema.optional(NonNegativeInt),
  reasoningOutputTokens: Schema.optional(NonNegativeInt),
  /** ISO timestamp of the provider's report; string so wire encoding is stable. */
  updatedAt: Schema.String,
});
export type OrchestrationV2ProviderTurnTokenUsage =
  typeof OrchestrationV2ProviderTurnTokenUsage.Type;

export const OrchestrationV2ProviderTurn = Schema.Struct({
  id: ProviderTurnId,
  providerThreadId: ProviderThreadId,
  nodeId: NodeId,
  runAttemptId: Schema.NullOr(RunAttemptId),
  nativeTurnRef: Schema.NullOr(OrchestrationV2ProviderRef),
  ordinal: PositiveInt,
  status: Schema.Literals([
    "pending",
    "running",
    "completed",
    "interrupted",
    "failed",
    "cancelled",
  ]),
  startedAt: Schema.NullOr(Schema.DateTimeUtc),
  completedAt: Schema.NullOr(Schema.DateTimeUtc),
  tokenUsage: Schema.optional(OrchestrationV2ProviderTurnTokenUsage),
  turnTokenUsage: Schema.optional(TurnTokenUsage),
});
export type OrchestrationV2ProviderTurn = typeof OrchestrationV2ProviderTurn.Type;

export const OrchestrationV2RuntimeRequest = Schema.Struct({
  id: RuntimeRequestId,
  nodeId: NodeId,
  providerTurnId: Schema.NullOr(ProviderTurnId),
  nativeRequestRef: Schema.NullOr(OrchestrationV2ProviderRef),
  kind: Schema.Union([
    ProviderRequestKind,
    Schema.Literals(["dynamic_tool_call", "user_input", "auth_refresh"]),
  ]),
  status: Schema.Literals(["pending", "resolved", "expired", "cancelled"]),
  responseCapability: Schema.Union([
    Schema.Struct({ type: Schema.Literal("live"), providerSessionId: ProviderSessionId }),
    Schema.Struct({ type: Schema.Literal("message") }),
    Schema.Struct({ type: Schema.Literal("not_resumable"), reason: Schema.String }),
  ]),
  createdAt: Schema.DateTimeUtc,
  resolvedAt: Schema.NullOr(Schema.DateTimeUtc),
  decision: Schema.optional(ProviderApprovalDecision),
  answers: Schema.optional(ProviderUserInputAnswers),
});
export type OrchestrationV2RuntimeRequest = typeof OrchestrationV2RuntimeRequest.Type;

const SubagentNotificationSource = Schema.Struct({
  kind: Schema.Literal("subagent"),
  /** The subagent's own thread, when the notification reports one subagent. */
  childThreadId: Schema.optional(ThreadId),
});
const CommandNotificationSource = Schema.Struct({ kind: Schema.Literal("command") });

/**
 * What a notification reports on. Several pieces of work of one kind share
 * that kind; mixed or unnamed work is `background_task`.
 *
 * Sources are stored and sent in the shape clients before `subagent` and
 * `command` existed decode, since they reject a kind they do not know: a
 * command is `background_command`, and a subagent is `background_task` with
 * `work: "subagent"`, a field those clients ignore. Encoding picks the first
 * member that fits, so those come first. The plain `subagent` and `command`
 * members after them decode values that were already decoded once.
 */
export const OrchestrationV2NotificationSource = kindUnionWithFallback(
  [
    Schema.Struct({
      kind: Schema.Literal("delegated_task"),
      taskIds: Schema.Array(NodeId),
      /** The task's own thread, when the notification reports one task. */
      childThreadId: Schema.optional(ThreadId),
    }),
    Schema.Struct({
      kind: Schema.Literal("background_task"),
      work: Schema.Literal("subagent"),
      childThreadId: Schema.optional(ThreadId),
    }).pipe(
      Schema.decodeTo(Schema.toType(SubagentNotificationSource), {
        decode: SchemaGetter.transform(({ childThreadId }) =>
          childThreadId === undefined
            ? { kind: "subagent" as const }
            : { kind: "subagent" as const, childThreadId },
        ),
        encode: SchemaGetter.transform(({ childThreadId }) => ({
          kind: "background_task" as const,
          work: "subagent" as const,
          ...(childThreadId === undefined ? {} : { childThreadId }),
        })),
      }),
    ),
    Schema.Struct({ kind: Schema.Literal("background_command").transform("command") }),
    SubagentNotificationSource,
    CommandNotificationSource,
    Schema.Struct({ kind: Schema.Literal("monitor") }),
    Schema.Struct({ kind: Schema.Literal("background_task") }),
  ],
  (kind) => Schema.Struct({ kind }),
  () => ({ kind: "background_task" }),
);
export type OrchestrationV2NotificationSource = typeof OrchestrationV2NotificationSource.Type;

// A notification records an observed event, not whether its payload has reached the agent.
// Provider delivery, wake policy, and agent-facing instructions belong to the backend.
export const OrchestrationV2Notification = Schema.Struct({
  source: OrchestrationV2NotificationSource,
  // Item status describes this timeline record; outcome describes the reported work.
  outcome: Schema.Literals(["completed", "failed", "cancelled", "updated", "unknown"]),
  summary: TrimmedNonEmptyString,
  detail: Schema.optional(Schema.String),
});
export type OrchestrationV2Notification = typeof OrchestrationV2Notification.Type;

export const OrchestrationV2ConversationMessage = Schema.Struct({
  notification: Schema.optional(OrchestrationV2Notification),
  ...OrchestrationV2CreationFields,
  scheduledTaskId: Schema.optional(ScheduledTaskId),
  // The sending agent's thread in this environment, separate from the receiving thread.
  senderThreadId: Schema.optional(ThreadId),
  id: MessageId,
  threadId: ThreadId,
  runId: Schema.NullOr(RunId),
  nodeId: Schema.NullOr(NodeId),
  role: Schema.Literals(["user", "assistant", "system"]),
  text: Schema.String,
  attachments: Schema.Array(ChatAttachment),
  streaming: Schema.Boolean,
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
  delegatedCompletion: Schema.optional(
    Schema.Struct({
      parentRunId: RunId,
      generation: PositiveInt,
      taskIds: Schema.Array(NodeId),
    }),
  ),
});
export type OrchestrationV2ConversationMessage = typeof OrchestrationV2ConversationMessage.Type;

export const OrchestrationV2PlanStep = Schema.Struct({
  id: TrimmedNonEmptyString,
  text: TrimmedNonEmptyString,
  status: Schema.Literals(["pending", "running", "completed"]),
  /** Durable server-owned boundary used to calculate elapsed time. */
  durationAnchorAt: Schema.optional(IsoDateTime),
  /** Elapsed time for a completed step. */
  durationMs: Schema.optional(NonNegativeInt),
});
export type OrchestrationV2PlanStep = typeof OrchestrationV2PlanStep.Type;

export const OrchestrationV2UserInputQuestion = Schema.Struct({
  id: TrimmedNonEmptyString,
  header: TrimmedNonEmptyString,
  question: TrimmedNonEmptyString,
  options: Schema.Array(
    Schema.Struct({
      label: TrimmedNonEmptyString,
      description: TrimmedNonEmptyString,
      value: Schema.optional(Schema.String),
    }),
  ),
  multiSelect: Schema.optional(Schema.Boolean),
  allowCustomAnswer: Schema.optional(Schema.Boolean),
  required: Schema.optional(Schema.Boolean),
});
export type OrchestrationV2UserInputQuestion = typeof OrchestrationV2UserInputQuestion.Type;

const OrchestrationV2PlanArtifactBaseFields = {
  id: PlanId,
  threadId: ThreadId,
  runId: Schema.NullOr(RunId),
  nodeId: NodeId,
  status: Schema.Literals(["draft", "active", "completed", "superseded"]),
  detailInTurnItem: Schema.optional(Schema.Literal(true)),
} as const;

export const OrchestrationV2PlanArtifact = Schema.Union([
  Schema.Struct({
    ...OrchestrationV2PlanArtifactBaseFields,
    kind: Schema.Literal("proposed_plan"),
    markdown: Schema.String,
  }),
  Schema.Struct({
    ...OrchestrationV2PlanArtifactBaseFields,
    kind: Schema.Literal("todo_list"),
    steps: Schema.Array(OrchestrationV2PlanStep),
    explanation: Schema.optional(Schema.String),
  }),
]);
export type OrchestrationV2PlanArtifact = typeof OrchestrationV2PlanArtifact.Type;

export const OrchestrationV2CheckpointFileSummary = Schema.Struct({
  path: TrimmedNonEmptyString,
  kind: TrimmedNonEmptyString,
  additions: NonNegativeInt,
  deletions: NonNegativeInt,
});
export type OrchestrationV2CheckpointFileSummary = typeof OrchestrationV2CheckpointFileSummary.Type;

export const OrchestrationV2TurnItemStatus = Schema.Literals([
  "idle",
  "pending",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

export type OrchestrationV2TurnItemStatus = typeof OrchestrationV2TurnItemStatus.Type;

/** One structured file operation reported by a provider inside a file_change item. */
export const OrchestrationV2FileChangeDetail = Schema.Struct({
  operation: TrimmedNonEmptyString,
  path: TrimmedNonEmptyString,
  oldPath: Schema.optional(TrimmedNonEmptyString),
  fileType: Schema.optional(TrimmedNonEmptyString),
  mimeType: Schema.optional(TrimmedNonEmptyString),
});
export type OrchestrationV2FileChangeDetail = typeof OrchestrationV2FileChangeDetail.Type;

export const OrchestrationV2ProviderFailureClass = Schema.Literals([
  "usage_limit",
  "provider_error",
  "transport_error",
  "permission_error",
  "validation_error",
  "unknown",
]);
export type OrchestrationV2ProviderFailureClass = typeof OrchestrationV2ProviderFailureClass.Type;

const OrchestrationV2ProviderFailureMessage = TrimmedNonEmptyString.check(
  Schema.isMaxLength(4_096),
);
const OrchestrationV2ProviderFailureCode = TrimmedNonEmptyString.check(Schema.isMaxLength(128));

/**
 * Transport-safe failure information suitable for persistence and display.
 * Producers must redact credentials before constructing this value. The
 * schema bounds every provider-controlled string as a second line of defense.
 */
export const OrchestrationV2ProviderFailure = Schema.Struct({
  class: OrchestrationV2ProviderFailureClass,
  message: OrchestrationV2ProviderFailureMessage,
  code: Schema.NullOr(OrchestrationV2ProviderFailureCode),
  retryable: Schema.NullOr(Schema.Boolean),
  /** Reported reset time; absent when the provider cannot name one. */
  resetAt: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type OrchestrationV2ProviderFailure = typeof OrchestrationV2ProviderFailure.Type;

/**
 * Provider-reported retry progress. Some providers expose all fields (Claude),
 * while others only expose `willRetry` and encode counters in display text
 * (Codex), so the protocol-specific values remain nullable.
 */
export const OrchestrationV2ProviderRetry = Schema.Struct({
  attempt: PositiveInt,
  maxAttempts: Schema.NullOr(PositiveInt),
  retryDelayMs: Schema.NullOr(NonNegativeInt),
});
export type OrchestrationV2ProviderRetry = typeof OrchestrationV2ProviderRetry.Type;

export const OrchestrationV2ProviderThreadDisposition = Schema.Literals(["reusable", "broken"]);
export type OrchestrationV2ProviderThreadDisposition =
  typeof OrchestrationV2ProviderThreadDisposition.Type;

export const OrchestrationV2UserMessageInputIntent = Schema.Literals([
  "turn_start",
  "queued_turn",
  "steer",
  "promoted_queued_to_steer",
]);
export type OrchestrationV2UserMessageInputIntent =
  typeof OrchestrationV2UserMessageInputIntent.Type;

const OrchestrationV2TurnItemBaseFields = {
  toolSurface: Schema.optional(ToolActivitySurface),
  toolIcon: Schema.optional(ToolActivityIcon),
  toolSource: Schema.optional(ToolActivitySource),
  id: TurnItemId,
  threadId: ThreadId,
  runId: Schema.NullOr(RunId),
  nodeId: Schema.NullOr(NodeId),
  providerThreadId: Schema.NullOr(ProviderThreadId),
  providerTurnId: Schema.NullOr(ProviderTurnId),
  nativeItemRef: Schema.NullOr(OrchestrationV2ProviderRef),
  parentItemId: Schema.NullOr(TurnItemId),
  ordinal: NonNegativeInt,
  status: OrchestrationV2TurnItemStatus,
  title: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(Schema.DateTimeUtc),
  completedAt: Schema.NullOr(Schema.DateTimeUtc),
  updatedAt: Schema.DateTimeUtc,
} as const;

export const OrchestrationV2FileSearchResult = Schema.Struct({
  fileName: TrimmedNonEmptyString,
  line: Schema.optional(PositiveInt),
  column: Schema.optional(PositiveInt),
  preview: Schema.optional(Schema.String),
});
export type OrchestrationV2FileSearchResult = typeof OrchestrationV2FileSearchResult.Type;

export const OrchestrationV2WebSearchResult = Schema.Struct({
  title: Schema.optional(Schema.String),
  url: Schema.optional(TrimmedNonEmptyString),
  snippet: Schema.optional(Schema.String),
});
export type OrchestrationV2WebSearchResult = typeof OrchestrationV2WebSearchResult.Type;

export const OrchestrationV2TurnItem = Schema.Union([
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("notification"),
    ...OrchestrationV2Notification.fields,
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    ...OrchestrationV2CreationFields,
    type: Schema.Literal("user_message"),
    messageId: MessageId,
    scheduledTaskId: Schema.optional(ScheduledTaskId),
    senderThreadId: Schema.optional(ThreadId),
    inputIntent: OrchestrationV2UserMessageInputIntent,
    text: Schema.String,
    attachments: Schema.Array(ChatAttachment),
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("assistant_message"),
    messageId: MessageId,
    text: Schema.String,
    attachments: Schema.optional(Schema.Array(ChatAttachment)),
    streaming: Schema.Boolean,
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("reasoning"),
    text: Schema.String,
    streaming: Schema.Boolean,
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("proposed_plan"),
    planId: PlanId,
    markdown: Schema.String,
    streaming: Schema.Boolean,
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("todo_list"),
    planId: PlanId,
    steps: Schema.Array(OrchestrationV2PlanStep),
    explanation: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("user_input_request"),
    requestId: RuntimeRequestId,
    questions: Schema.Array(OrchestrationV2UserInputQuestion),
    questionAnswer: Schema.optional(UserInputAttachmentAnswerPayload),
    responseMode: Schema.optional(Schema.Literal("message")),
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("file_change"),
    fileName: TrimmedNonEmptyString,
    additions: Schema.optional(NonNegativeInt),
    deletions: Schema.optional(NonNegativeInt),
    diffStr: Schema.optional(Schema.String),
    oldStr: Schema.optional(Schema.String),
    newStr: Schema.optional(Schema.String),
    changes: Schema.optional(Schema.Array(OrchestrationV2FileChangeDetail)),
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("command_execution"),
    input: Schema.String,
    output: Schema.optional(Schema.String),
    outputIndicatesFailure: Schema.optional(Schema.Boolean),
    exitCode: Schema.optional(Schema.Int),
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("file_search"),
    pattern: Schema.optional(Schema.String),
    results: Schema.optional(Schema.Array(OrchestrationV2FileSearchResult)),
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("web_search"),
    patterns: Schema.optional(Schema.Array(Schema.String)),
    results: Schema.optional(Schema.Array(OrchestrationV2WebSearchResult)),
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("approval_request"),
    requestId: RuntimeRequestId,
    requestKind: ProviderRequestKind,
    prompt: Schema.optional(Schema.String),
    /** App requesting access, for mcp-elicitation approvals (#8058). */
    appName: Schema.optional(Schema.String),
    /** Approval choices advertised by the provider (#8058). */
    options: Schema.optional(Schema.Array(ProviderApprovalOption)),
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("checkpoint"),
    checkpointId: CheckpointId,
    scopeId: CheckpointScopeId,
    files: Schema.Array(OrchestrationV2CheckpointFileSummary),
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("run_interrupt_request"),
    message: Schema.String,
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("run_interrupt_result"),
    message: Schema.String,
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("system_notice"),
    message: Schema.String,
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("error"),
    failure: OrchestrationV2ProviderFailure,
    retry: Schema.optional(OrchestrationV2ProviderRetry),
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("compaction"),
    driver: Schema.NullOr(ProviderDriverKind),
    summary: Schema.optional(Schema.String),
    beforeTokenCount: Schema.optional(NonNegativeInt),
    afterTokenCount: Schema.optional(NonNegativeInt),
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("handoff"),
    contextHandoffId: ContextHandoffId,
    fromProviderThreadIds: Schema.Array(ProviderThreadId),
    toProviderThreadId: ProviderThreadId,
    fromProviderInstanceIds: Schema.Array(ProviderInstanceId),
    toProviderInstanceId: ProviderInstanceId,
    // Model selections active on the covered source runs and the target
    // model, so timelines can label the handoff by model rather than by
    // provider instance id. Absent on items persisted before these fields.
    fromModelSelections: Schema.optional(Schema.Array(ModelSelection)),
    toModel: Schema.optional(Schema.String),
    strategy: Schema.Literals([
      "delta_since_target_last_seen",
      "fork_delta_summary",
      "full_thread_summary",
      "checkpoint_summary",
      "manual_context",
    ]),
    summary: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("fork"),
    source: Schema.Union([
      Schema.Struct({ type: Schema.Literal("run"), threadId: ThreadId, runId: RunId }),
      Schema.Struct({ type: Schema.Literal("node"), nodeId: NodeId }),
      Schema.Struct({
        type: Schema.Literal("provider_thread"),
        providerThreadId: ProviderThreadId,
        providerTurnId: Schema.optional(ProviderTurnId),
      }),
    ]),
    targetThreadId: ThreadId,
    providerThreadId: Schema.optional(ProviderThreadId),
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("thread_created"),
    targetThreadId: ThreadId,
    targetRunId: Schema.NullOr(RunId),
    targetProviderInstanceId: ProviderInstanceId,
    targetModel: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("subagent"),
    subagentId: NodeId,
    origin: Schema.Literals(["provider_native", "app_owned"]),
    driver: ProviderDriverKind,
    providerInstanceId: ProviderInstanceId,
    childThreadId: Schema.NullOr(ThreadId),
    prompt: Schema.String,
    progress: Schema.optional(Schema.String),
    result: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    ...OrchestrationV2TurnItemBaseFields,
    type: Schema.Literal("dynamic_tool"),
    toolName: Schema.NullOr(TrimmedNonEmptyString),
    viewedImagePath: Schema.optional(TrimmedNonEmptyString),
    input: Schema.Unknown,
    output: Schema.optional(Schema.Unknown),
  }),
]);
export type OrchestrationV2TurnItem = typeof OrchestrationV2TurnItem.Type;
