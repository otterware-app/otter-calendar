/**
 * The in-app agent, per environment: the list of conversations, one conversation's detail, and
 * the commands that drive them. Both subscriptions start with a snapshot (again after every
 * reconnect) and then apply changes, so the reducers below are the whole client-side model.
 */
import {
  type AgentThreadDetail,
  type AgentThreadEvent,
  type AgentThreadListEvent,
  type AgentThreadSummary,
  type AgentTurn,
  type OrchestrationV2RuntimeRequest,
  type OrchestrationV2TurnItem,
  WS_METHODS,
} from "@t3tools/contracts";
import * as Stream from "effect/Stream";
import type { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

export const EMPTY_AGENT_THREADS: ReadonlyArray<AgentThreadSummary> = [];

/** Newest activity first; ties keep a stable order by id. */
function compareThreads(left: AgentThreadSummary, right: AgentThreadSummary): number {
  if (left.updatedAt !== right.updatedAt) return left.updatedAt < right.updatedAt ? 1 : -1;
  return left.threadId < right.threadId ? -1 : left.threadId > right.threadId ? 1 : 0;
}

export function applyAgentThreadListEvent(
  current: ReadonlyArray<AgentThreadSummary>,
  event: AgentThreadListEvent,
): ReadonlyArray<AgentThreadSummary> {
  switch (event._tag) {
    case "snapshot":
      return [...event.threads].sort(compareThreads);
    case "upserted":
      return [
        ...current.filter((thread) => thread.threadId !== event.thread.threadId),
        event.thread,
      ].sort(compareThreads);
    case "removed":
      return current.filter((thread) => thread.threadId !== event.threadId);
  }
}

function upsertTurn(turns: ReadonlyArray<AgentTurn>, turn: AgentTurn): ReadonlyArray<AgentTurn> {
  const index = turns.findIndex((existing) => existing.turnId === turn.turnId);
  if (index !== -1) {
    const next = [...turns];
    next[index] = turn;
    return next;
  }
  return [...turns, turn].sort((left, right) => left.ordinal - right.ordinal);
}

/** Items are ordered by their turn's ordinal, then by item ordinal. */
function itemOrderKey(
  item: OrchestrationV2TurnItem,
  turnOrdinals: ReadonlyMap<string, number>,
): readonly [number, number] {
  const turnOrdinal =
    item.runId === null
      ? Number.MAX_SAFE_INTEGER
      : (turnOrdinals.get(item.runId) ?? Number.MAX_SAFE_INTEGER);
  return [turnOrdinal, item.ordinal];
}

function compareOrderKeys(left: readonly [number, number], right: readonly [number, number]) {
  return left[0] - right[0] || left[1] - right[1];
}

function turnOrdinalsOf(turns: ReadonlyArray<AgentTurn>): ReadonlyMap<string, number> {
  return new Map(turns.map((turn) => [turn.turnId, turn.ordinal]));
}

function sortItems(
  items: ReadonlyArray<OrchestrationV2TurnItem>,
  turns: ReadonlyArray<AgentTurn>,
): ReadonlyArray<OrchestrationV2TurnItem> {
  const ordinals = turnOrdinalsOf(turns);
  return [...items].sort((left, right) =>
    compareOrderKeys(itemOrderKey(left, ordinals), itemOrderKey(right, ordinals)),
  );
}

/**
 * Streaming text arrives as repeated upserts of one item, so an existing item is replaced in
 * place; a new one is inserted where it belongs, which is almost always the end.
 */
function upsertItem(
  items: ReadonlyArray<OrchestrationV2TurnItem>,
  item: OrchestrationV2TurnItem,
  turns: ReadonlyArray<AgentTurn>,
): ReadonlyArray<OrchestrationV2TurnItem> {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (
    index !== -1 &&
    items[index]!.ordinal === item.ordinal &&
    items[index]!.runId === item.runId
  ) {
    const next = [...items];
    next[index] = item;
    return next;
  }
  const without = index === -1 ? items : items.filter((existing) => existing.id !== item.id);
  const ordinals = turnOrdinalsOf(turns);
  const key = itemOrderKey(item, ordinals);
  let insertAt = without.length;
  while (
    insertAt > 0 &&
    compareOrderKeys(itemOrderKey(without[insertAt - 1]!, ordinals), key) > 0
  ) {
    insertAt -= 1;
  }
  return [...without.slice(0, insertAt), item, ...without.slice(insertAt)];
}

/** Only requests still waiting for an answer stay in `pendingRequests`. */
function upsertRequest(
  requests: ReadonlyArray<OrchestrationV2RuntimeRequest>,
  request: OrchestrationV2RuntimeRequest,
): ReadonlyArray<OrchestrationV2RuntimeRequest> {
  const without = requests.filter((existing) => existing.id !== request.id);
  return request.status === "pending" ? [...without, request] : without;
}

/** A conversation's detail after one event; null once the conversation is removed. */
export function applyAgentThreadEvent(
  current: AgentThreadDetail | null,
  event: AgentThreadEvent,
): AgentThreadDetail | null {
  switch (event._tag) {
    case "snapshot":
      return {
        ...event.detail,
        turns: [...event.detail.turns].sort((left, right) => left.ordinal - right.ordinal),
        items: sortItems(event.detail.items, event.detail.turns),
        pendingRequests: event.detail.pendingRequests.filter(
          (request) => request.status === "pending",
        ),
      };
    case "removed":
      return null;
  }
  if (current === null) return null;
  switch (event._tag) {
    case "thread":
      return { ...current, thread: event.thread };
    case "turn": {
      const turns = upsertTurn(current.turns, event.turn);
      const isNewTurn = turns.length !== current.turns.length;
      // A new turn can adopt items that arrived before it did.
      return {
        ...current,
        turns,
        items: isNewTurn ? sortItems(current.items, turns) : current.items,
      };
    }
    case "item":
      return { ...current, items: upsertItem(current.items, event.item, current.turns) };
    case "request":
      return { ...current, pendingRequests: upsertRequest(current.pendingRequests, event.request) };
  }
}

/** The environment's agent conversations and commands. */
export function createAgentEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    /** Every conversation's summary, newest activity first. */
    threads: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:agent:threads",
      tag: WS_METHODS.agentSubscribeThreads,
      transform: (stream) =>
        stream.pipe(
          Stream.mapAccum(
            () => EMPTY_AGENT_THREADS,
            (current, event) => {
              const next = applyAgentThreadListEvent(current, event);
              return [next, [next]] as const;
            },
          ),
        ),
    }),
    /** One conversation's detail; `null` after it was deleted. */
    thread: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:agent:thread",
      tag: WS_METHODS.agentSubscribeThread,
      idleTtlMs: 60_000,
      transform: (stream) =>
        stream.pipe(
          Stream.mapAccum(
            (): AgentThreadDetail | null => null,
            (current, event) => {
              const next = applyAgentThreadEvent(current, event);
              return [next, [next]] as const;
            },
          ),
        ),
    }),
    createThread: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:agent:create-thread",
      tag: WS_METHODS.agentCreateThread,
    }),
    updateThread: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:agent:update-thread",
      tag: WS_METHODS.agentUpdateThread,
    }),
    deleteThread: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:agent:delete-thread",
      tag: WS_METHODS.agentDeleteThread,
    }),
    /** Starts a turn, or steers the running one when the provider supports it. */
    sendMessage: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:agent:send-message",
      tag: WS_METHODS.agentSendMessage,
    }),
    interrupt: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:agent:interrupt",
      tag: WS_METHODS.agentInterrupt,
      concurrency: {
        mode: "singleFlight",
        key: ({ environmentId, input }) => JSON.stringify([environmentId, input.threadId]),
      },
    }),
    respondToRequest: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:agent:respond-to-request",
      tag: WS_METHODS.agentRespondToRequest,
      concurrency: {
        mode: "singleFlight",
        key: ({ environmentId, input }) => JSON.stringify([environmentId, input.requestId]),
      },
    }),
  };
}
