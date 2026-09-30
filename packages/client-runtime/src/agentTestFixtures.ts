import {
  MessageId,
  NodeId,
  ProviderInstanceId,
  RunId,
  RuntimeRequestId,
  ThreadId,
  TurnItemId,
  type AgentThreadDetail,
  type AgentThreadSummary,
  type AgentTurn,
  type OrchestrationV2RuntimeRequest,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

const THREAD_ID = ThreadId.make("thread-1");
export const TURN_1 = RunId.make("turn-1");
export const TURN_2 = RunId.make("turn-2");
const AT = DateTime.makeUnsafe("2026-09-30T10:00:00.000Z");

export function summary(overrides: Partial<AgentThreadSummary> = {}): AgentThreadSummary {
  return {
    threadId: THREAD_ID,
    title: "Chat",
    modelSelection: { instanceId: ProviderInstanceId.make("claude"), model: "claude-sonnet" },
    runtimeMode: "full-access",
    status: "idle",
    preview: "",
    pendingRequestCount: 0,
    createdAt: "2026-09-30T10:00:00.000Z",
    updatedAt: "2026-09-30T10:00:00.000Z",
    ...overrides,
  };
}

export function turn(overrides: Partial<AgentTurn> & Pick<AgentTurn, "turnId">): AgentTurn {
  return {
    ordinal: 0,
    status: "completed",
    startedAt: "2026-09-30T10:00:00.000Z",
    completedAt: "2026-09-30T10:00:12.000Z",
    error: null,
    ...overrides,
  };
}

type ItemOf<T extends OrchestrationV2TurnItem["type"]> = Extract<
  OrchestrationV2TurnItem,
  { readonly type: T }
>;
type BaseKey =
  | "id"
  | "threadId"
  | "runId"
  | "nodeId"
  | "providerThreadId"
  | "providerTurnId"
  | "nativeItemRef"
  | "parentItemId"
  | "ordinal"
  | "status"
  | "title"
  | "startedAt"
  | "completedAt"
  | "updatedAt";

/** A turn item of one type; only its own fields and the ones a test cares about are given. */
export function item<T extends OrchestrationV2TurnItem["type"]>(
  type: T,
  fields: Omit<ItemOf<T>, BaseKey | "type"> & {
    readonly id: string;
    readonly runId?: RunId | null;
    readonly ordinal: number;
    readonly status?: OrchestrationV2TurnItem["status"];
    readonly title?: string | null;
  },
): OrchestrationV2TurnItem {
  const { id, runId, ordinal, status, title, ...rest } = fields;
  return {
    id: TurnItemId.make(id),
    threadId: THREAD_ID,
    runId: runId === undefined ? TURN_1 : runId,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal,
    status: status ?? "completed",
    title: title ?? null,
    startedAt: AT,
    completedAt: AT,
    updatedAt: AT,
    type,
    ...rest,
  } as OrchestrationV2TurnItem;
}

export function userMessage(id: string, ordinal: number, text: string, runId = TURN_1) {
  return item("user_message", {
    id,
    runId,
    ordinal,
    messageId: MessageId.make(`message-${id}`),
    createdBy: "user",
    creationSource: "web",
    inputIntent: "turn_start",
    text,
    attachments: [],
  });
}

export function assistantMessage(
  id: string,
  ordinal: number,
  text: string,
  options: { readonly runId?: RunId; readonly streaming?: boolean } = {},
) {
  return item("assistant_message", {
    id,
    runId: options.runId ?? TURN_1,
    ordinal,
    messageId: MessageId.make(`message-${id}`),
    text,
    streaming: options.streaming ?? false,
  });
}

export function dynamicTool(id: string, ordinal: number, toolName: string, input: unknown = {}) {
  return item("dynamic_tool", { id, ordinal, toolName, input });
}

export function runtimeRequest(
  id: string,
  status: OrchestrationV2RuntimeRequest["status"] = "pending",
): OrchestrationV2RuntimeRequest {
  return {
    id: RuntimeRequestId.make(id),
    nodeId: NodeId.make("node-1"),
    providerTurnId: null,
    nativeRequestRef: null,
    kind: "command",
    status,
    responseCapability: { type: "message" },
    createdAt: AT,
    resolvedAt: null,
  };
}

export function detail(overrides: Partial<AgentThreadDetail> = {}): AgentThreadDetail {
  return {
    thread: summary(),
    turns: [],
    items: [],
    pendingRequests: [],
    ...overrides,
  };
}
