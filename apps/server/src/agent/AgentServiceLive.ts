/**
 * AgentServiceLive - the in-app agent's threads, one provider session per active thread.
 *
 * A message starts a turn: the service persists the user's item, then a background fiber opens
 * (or reuses) the thread's provider session, resumes the provider's own conversation, and starts
 * the provider turn. The session's event pump upserts the adapter's turn items and runtime
 * requests and settles the turn on `turn.terminal`. Everything the pump and the RPC methods
 * change for a thread happens under that thread's lock, and every publish happens inside it, so
 * a subscriber's snapshot is never newer than the changes that follow it.
 *
 * Sessions are released after `SESSION_IDLE_TIMEOUT` without a turn, when the thread switches to
 * another provider instance, when the instance's sign-in changes, and when the thread is deleted.
 * After a restart, turns left running are interrupted and pending requests expire.
 *
 * @module AgentServiceLive
 */
import {
  AgentError,
  DEFAULT_MODEL_BY_PROVIDER,
  MessageId,
  ProjectId,
  type AgentThreadDetail,
  type AgentThreadEvent,
  type AgentThreadListEvent,
  type AgentThreadSummary,
  type AgentTurn,
  type ModelSelection,
  type NodeId,
  type OrchestrationV2AppThread,
  type OrchestrationV2ProviderFailure,
  type OrchestrationV2ProviderThread,
  type OrchestrationV2RuntimeRequest,
  type OrchestrationV2TurnItem,
  type ProviderInstanceId,
  type ProviderTurnId,
  type RunAttemptId,
  type RuntimeMode,
  type ThreadId,
} from "@t3tools/contracts";
import { modelSelectionsEqual } from "@t3tools/shared/model";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";

import { ServerConfig } from "../config.ts";
import * as McpProviderSession from "../mcp/McpProviderSession.ts";
import { McpSessionRegistry } from "../mcp/McpSessionRegistry.ts";
import * as IdAllocator from "../provider/adapters/IdAllocator.ts";
import type {
  ProviderAdapterV2Event,
  ProviderAdapterV2RuntimePolicy,
  ProviderAdapterV2SessionRuntime,
  ProviderAdapterV2TurnMessage,
} from "../provider/adapters/ProviderAdapter.ts";
import { ProviderAdapterRegistryV2 } from "../provider/adapters/ProviderAdapterRegistry.ts";
import {
  ProviderContinuationRequests,
  type ProviderContinuationRequest,
} from "../provider/adapters/ProviderContinuationRequests.ts";
import {
  makeProviderFailure,
  makeProviderFailureTurnItem,
} from "../provider/adapters/ProviderFailure.ts";
import { ProviderSessionRelease } from "../provider/ProviderSessionRelease.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { AgentService, type AgentServiceShape } from "./AgentService.ts";
import { makeAgentStore, type ThreadRecord } from "./AgentStore.ts";
import { AGENT_INSTRUCTIONS, providerMessageText } from "./instructions.ts";

const SESSION_IDLE_TIMEOUT = Duration.minutes(10);
const DEFAULT_TITLE = "New chat";
const TITLE_MAX_LENGTH = 80;
const PREVIEW_MAX_LENGTH = 160;

interface LiveSession {
  readonly instanceId: ProviderInstanceId;
  readonly runtime: ProviderAdapterV2SessionRuntime;
  readonly scope: Scope.Closeable;
  /** The provider thread loaded in this session, and the thread settings it was loaded with. */
  providerThread: OrchestrationV2ProviderThread | null;
  loadedWith: { readonly modelSelection: ModelSelection; readonly runtimeMode: RuntimeMode } | null;
  idle: Fiber.Fiber<void> | null;
}

interface ActiveTurn {
  turn: AgentTurn;
  readonly attemptId: RunAttemptId;
  readonly rootNodeId: NodeId;
  /** `starting` until the provider was asked to start the turn. */
  phase: "starting" | "running";
  providerThread: OrchestrationV2ProviderThread | null;
  providerTurnId: ProviderTurnId | null;
  interruptRequested: boolean;
  starter: Fiber.Fiber<void> | null;
}

interface ThreadState {
  /** Serializes everything that changes or publishes this thread. */
  readonly lock: Semaphore.Semaphore;
  session: LiveSession | null;
  active: ActiveTurn | null;
  /** Provider work that finished while a turn was running; it starts a turn when that one ends. */
  continuation: ProviderContinuationRequest | null;
}

type TurnStart =
  | {
      readonly kind: "message";
      readonly messageId: MessageId;
      readonly text: string;
      readonly context: string | undefined;
    }
  | { readonly kind: "continuation"; readonly request: ProviderContinuationRequest };

type TurnOutcome =
  | { readonly status: "completed" | "interrupted" }
  | {
      readonly status: "failed";
      readonly failure: OrchestrationV2ProviderFailure;
      /** The adapter's own failure item, when the provider reported the failure. */
      readonly item?: OrchestrationV2TurnItem;
    };

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();
const cut = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;
const titleFrom = (text: string | undefined) => {
  const title = cut(oneLine(text ?? ""), TITLE_MAX_LENGTH);
  return title === "" ? DEFAULT_TITLE : title;
};

const isAgentError = Schema.is(AgentError);

const threadNotFound = () =>
  new AgentError({ code: "thread_not_found", detail: "That conversation does not exist." });

const isOpenItem = (item: OrchestrationV2TurnItem) =>
  item.status === "pending" || item.status === "running" || item.status === "waiting";

/** An item the provider left open, closed with the turn's outcome. */
const settleItem = (
  item: OrchestrationV2TurnItem,
  status: "failed" | "interrupted" | "cancelled",
  now: DateTime.Utc,
): OrchestrationV2TurnItem => ({
  ...item,
  ...("streaming" in item ? { streaming: false } : {}),
  status,
  completedAt: item.completedAt ?? now,
  updatedAt: now,
});

const expireRequest = (
  request: OrchestrationV2RuntimeRequest,
  reason: string,
  now: DateTime.Utc,
): OrchestrationV2RuntimeRequest => ({
  ...request,
  status: "expired",
  responseCapability: { type: "not_resumable", reason },
  resolvedAt: now,
});

const make = Effect.gen(function* () {
  const store = yield* makeAgentStore;
  const adapters = yield* ProviderAdapterRegistryV2;
  const mcpSessions = yield* McpSessionRegistry;
  const sessionRelease = yield* ProviderSessionRelease;
  const continuationRequests = yield* ProviderContinuationRequests;
  const serverSettings = yield* ServerSettingsService;
  const idAllocator = yield* IdAllocator.IdAllocatorV2;
  const config = yield* ServerConfig;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const layerScope = yield* Effect.scope;

  const workspaceDir = path.join(config.stateDir, "agent-workspace");
  yield* fileSystem.makeDirectory(workspaceDir, { recursive: true }).pipe(Effect.orDie);

  const listEvents = yield* PubSub.unbounded<AgentThreadListEvent>();
  const threadEvents = yield* PubSub.unbounded<{
    readonly threadId: ThreadId;
    readonly event: AgentThreadEvent;
  }>();
  /** Held while a thread summary is read and published, and while a list snapshot is taken. */
  const listLock = yield* Semaphore.make(1);
  const states = new Map<ThreadId, ThreadState>();

  const stateFor = (threadId: ThreadId): ThreadState => {
    const existing = states.get(threadId);
    if (existing !== undefined) return existing;
    const created: ThreadState = {
      lock: Semaphore.makeUnsafe(1),
      session: null,
      active: null,
      continuation: null,
    };
    states.set(threadId, created);
    return created;
  };

  const existingState = (threadId: ThreadId) =>
    store.getThread(threadId).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(threadNotFound()),
          onSome: () => Effect.succeed(stateFor(threadId)),
        }),
      ),
    );

  const loadThread = (threadId: ThreadId) =>
    store
      .getThread(threadId)
      .pipe(
        Effect.flatMap(
          Option.match({ onNone: () => Effect.fail(threadNotFound()), onSome: Effect.succeed }),
        ),
      );

  const toSummary = (record: ThreadRecord, state: ThreadState | undefined): AgentThreadSummary => {
    const active = state?.active ?? null;
    return {
      threadId: record.threadId,
      title: record.title,
      modelSelection: record.modelSelection,
      runtimeMode: record.runtimeMode,
      status:
        active === null
          ? "idle"
          : active.phase === "starting"
            ? "starting"
            : record.pendingRequestCount > 0
              ? "waiting"
              : "running",
      preview: record.preview,
      pendingRequestCount: record.pendingRequestCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  };

  const publish = (threadId: ThreadId, event: AgentThreadEvent) =>
    PubSub.publish(threadEvents, { threadId, event });

  /** Publishes the thread's current summary to its subscribers and to the list. */
  const publishSummary = (threadId: ThreadId, state: ThreadState) =>
    listLock.withPermits(1)(
      Effect.gen(function* () {
        const summary = toSummary(yield* loadThread(threadId), state);
        yield* PubSub.publish(listEvents, { _tag: "upserted", thread: summary });
        yield* publish(threadId, { _tag: "thread", thread: summary });
        return summary;
      }),
    );

  const saveItem = (turnOrdinal: number, item: OrchestrationV2TurnItem) =>
    store
      .upsertItem(turnOrdinal, item)
      .pipe(Effect.andThen(publish(item.threadId, { _tag: "item", item })));

  const saveRequest = (threadId: ThreadId, request: OrchestrationV2RuntimeRequest) =>
    store
      .upsertRequest(threadId, request)
      .pipe(Effect.andThen(publish(threadId, { _tag: "request", request })));

  const saveTurn = (threadId: ThreadId, turn: AgentTurn) =>
    store.updateTurn(turn).pipe(Effect.andThen(publish(threadId, { _tag: "turn", turn })));

  const requireAdapter = (instanceId: ProviderInstanceId) =>
    Effect.gen(function* () {
      const adapter = yield* Effect.option(adapters.get(instanceId));
      const metadata =
        adapters.getMetadata === undefined
          ? Option.none()
          : yield* Effect.option(adapters.getMetadata(instanceId));
      if (Option.isNone(adapter) || (Option.isSome(metadata) && !metadata.value.enabled)) {
        return yield* new AgentError({
          code: "provider_unavailable",
          detail: "That agent is not available. Check it in Settings → Agents.",
        });
      }
      return adapter.value;
    });

  /** The first available agent with its default model, when settings name none. */
  const defaultModelSelection = Effect.gen(function* () {
    for (const instanceId of yield* adapters.list()) {
      const adapter = yield* Effect.option(requireAdapter(instanceId));
      const model = Option.isSome(adapter)
        ? DEFAULT_MODEL_BY_PROVIDER[adapter.value.driver]
        : undefined;
      if (model !== undefined) return { instanceId, model } satisfies ModelSelection;
    }
    return yield* new AgentError({
      code: "provider_unavailable",
      detail: "No agent is set up yet. Add Claude or Codex in Settings → Agents.",
    });
  });

  const appThread = (
    record: ThreadRecord,
    providerThread: OrchestrationV2ProviderThread,
  ): OrchestrationV2AppThread => ({
    createdBy: "user",
    creationSource: "web",
    id: record.threadId,
    projectId: ProjectId.make("agent"),
    title: record.title,
    providerInstanceId: record.modelSelection.instanceId,
    modelSelection: record.modelSelection,
    runtimeMode: record.runtimeMode,
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: providerThread.id,
    lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: record.threadId },
    forkedFrom: null,
    createdAt: DateTime.makeUnsafe(record.createdAt),
    updatedAt: DateTime.makeUnsafe(record.updatedAt),
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    lastVisitedAt: null,
    deletedAt: null,
  });

  const turnOrdinalFor = (state: ThreadState, threadId: ThreadId, item: OrchestrationV2TurnItem) =>
    Effect.gen(function* () {
      const active = state.active;
      if (item.runId !== null && item.runId !== active?.turn.turnId) {
        const ordinal = yield* store.turnOrdinalOf(item.runId);
        if (Option.isSome(ordinal)) return ordinal.value;
      }
      return active?.turn.ordinal ?? (yield* store.lastTurnOrdinal(threadId));
    });

  // ── Sessions ───────────────────────────────────────────────────────

  /**
   * Ends a live session: its scope closes in the background (a wedged provider must not hold
   * the thread), requests it could answer expire, and a turn running on it fails with `failure`
   * (or is interrupted without one). A turn still starting fails in its own fiber when it finds
   * the session gone.
   */
  const endSession = (
    threadId: ThreadId,
    state: ThreadState,
    session: LiveSession,
    failure: string | null,
  ): Effect.Effect<void, AgentError> =>
    Effect.gen(function* () {
      if (state.session !== session) return;
      state.session = null;
      yield* Scope.close(session.scope, Exit.void).pipe(Effect.forkIn(layerScope));
      const now = yield* DateTime.now;
      for (const { request } of yield* store.listPendingRequests(threadId)) {
        if (
          request.responseCapability.type === "live" &&
          request.responseCapability.providerSessionId === session.runtime.providerSessionId
        ) {
          yield* saveRequest(
            threadId,
            expireRequest(request, "The agent's session ended before this was answered.", now),
          );
        }
      }
      if (state.active?.phase === "running") {
        yield* finishTurn(
          threadId,
          state,
          failure === null
            ? { status: "interrupted" }
            : { status: "failed", failure: makeProviderFailure({ message: failure }) },
        );
      } else {
        yield* publishSummary(threadId, state);
      }
    });

  const scheduleIdleRelease = (threadId: ThreadId, state: ThreadState, session: LiveSession) =>
    Effect.gen(function* () {
      if (session.idle !== null) yield* Fiber.interrupt(session.idle);
      const release = Effect.gen(function* () {
        // Background work the provider still runs (a Claude background task) keeps it alive.
        while (true) {
          yield* Effect.sleep(SESSION_IDLE_TIMEOUT);
          const busy = yield* (
            session.runtime.hasPendingBackgroundWork ?? Effect.succeed(false)
          ).pipe(Effect.catchCause(() => Effect.succeed(false)));
          if (!busy) break;
        }
        yield* state.lock.withPermits(1)(
          Effect.gen(function* () {
            if (state.active !== null || state.session !== session) return;
            session.idle = null;
            yield* endSession(threadId, state, session, null);
          }),
        );
      }).pipe(Effect.catchCause((cause) => Effect.logWarning("agent idle release failed", cause)));
      session.idle = yield* release.pipe(Effect.forkIn(session.scope));
    });

  const cancelIdleRelease = (session: LiveSession) =>
    Effect.gen(function* () {
      const idle = session.idle;
      session.idle = null;
      if (idle !== null) yield* Fiber.interrupt(idle);
    });

  const openSession = (threadId: ThreadId, state: ThreadState, record: ThreadRecord) =>
    Effect.gen(function* () {
      const instanceId = record.modelSelection.instanceId;
      const adapter = yield* requireAdapter(instanceId);
      const providerSessionId = yield* idAllocator.allocate.providerSession({
        providerInstanceId: instanceId,
        threadId,
      });
      const { config: mcp } = yield* mcpSessions.issue({
        threadId,
        providerInstanceId: instanceId,
        instructions: AGENT_INSTRUCTIONS,
      });
      const scope = yield* Scope.fork(layerScope, "sequential");
      // Added first, so it runs last: after the provider process is gone.
      yield* Scope.addFinalizer(
        scope,
        mcpSessions
          .revokeProviderSession(mcp.providerSessionId)
          .pipe(
            Effect.andThen(
              Effect.sync(() =>
                McpProviderSession.clearMcpProviderSession(threadId, mcp.providerSessionId),
              ),
            ),
          ),
      );
      return yield* Effect.gen(function* () {
        // Adapters read the MCP server and instructions when they configure the provider.
        yield* Effect.sync(() => McpProviderSession.setMcpProviderSession(mcp));
        const runtime = yield* adapter
          .openSession({
            threadId,
            providerSessionId,
            modelSelection: record.modelSelection,
            runtimePolicy: runtimePolicyFor(record),
          })
          .pipe(Scope.provide(scope));
        const session: LiveSession = {
          instanceId,
          runtime,
          scope,
          providerThread: null,
          loadedWith: null,
          idle: null,
        };
        yield* sessionRelease
          .register(
            instanceId,
            state.lock.withPermits(1)(
              endSession(
                threadId,
                state,
                session,
                "The agent's sign-in changed. Send the message again.",
              ).pipe(Effect.ignoreCause({ log: true })),
            ),
          )
          .pipe(Scope.provide(scope));
        yield* pump(threadId, state, session).pipe(Effect.forkIn(scope));
        return session;
      }).pipe(
        Effect.onExit((exit) => (Exit.isSuccess(exit) ? Effect.void : Scope.close(scope, exit))),
      );
    });

  const runtimePolicyFor = (record: ThreadRecord): ProviderAdapterV2RuntimePolicy => ({
    runtimeMode: record.runtimeMode,
    interactionMode: "default",
    cwd: workspaceDir,
  });

  // ── Turns ──────────────────────────────────────────────────────────

  /** Settles the active turn. Holds the thread's lock. */
  const finishTurn = (
    threadId: ThreadId,
    state: ThreadState,
    outcome: TurnOutcome,
  ): Effect.Effect<void, AgentError> =>
    Effect.gen(function* () {
      const active = state.active;
      if (active === null) return;
      state.active = null;
      const now = yield* DateTime.now;
      const ordinal = active.turn.ordinal;
      if (outcome.status === "failed") {
        const item: OrchestrationV2TurnItem = outcome.item ?? {
          id: idAllocator.derive.runSignalTurnItem({
            runId: active.turn.turnId,
            signal: "failure",
          }),
          threadId,
          runId: active.turn.turnId,
          nodeId: active.rootNodeId,
          providerThreadId: active.providerThread?.id ?? null,
          providerTurnId: active.providerTurnId,
          nativeItemRef: null,
          parentItemId: null,
          ordinal: (yield* store.maxItemOrdinal(threadId, ordinal)) + 1,
          status: "failed",
          title: "The agent could not answer",
          startedAt: now,
          completedAt: now,
          updatedAt: now,
          type: "error",
          failure: outcome.failure,
        };
        yield* saveItem(ordinal, item);
      }
      if (outcome.status !== "completed") {
        for (const item of yield* store.listItems(threadId, ordinal)) {
          if (isOpenItem(item)) yield* saveItem(ordinal, settleItem(item, outcome.status, now));
        }
      }
      // Questions and approvals of this turn can no longer be answered.
      if (active.providerTurnId !== null) {
        for (const { request } of yield* store.listPendingRequests(threadId)) {
          if (request.providerTurnId === active.providerTurnId) {
            yield* saveRequest(threadId, { ...request, status: "cancelled", resolvedAt: now });
          }
        }
      }
      yield* saveTurn(threadId, {
        ...active.turn,
        status: outcome.status,
        completedAt: DateTime.formatIso(now),
        error: outcome.status === "failed" ? outcome.failure.message : null,
      });
      yield* store.updateThread({ threadId, updatedAt: DateTime.formatIso(now) });
      yield* publishSummary(threadId, state);
      const session = state.session;
      if (session === null) return;
      const continuation = state.continuation;
      state.continuation = null;
      if (continuation !== null) {
        yield* beginTurn(threadId, state, yield* loadThread(threadId), {
          kind: "continuation",
          request: continuation,
        });
      } else {
        yield* scheduleIdleRelease(threadId, state, session);
      }
    });

  /**
   * Starts the provider turn for the active turn: opens or reuses the session, loads the
   * provider's conversation, and asks the provider to start. Runs on its own fiber and takes the
   * thread's lock only between adapter calls.
   */
  const runTurn = (
    threadId: ThreadId,
    state: ThreadState,
    active: ActiveTurn,
    message: ProviderAdapterV2TurnMessage,
  ) =>
    Effect.gen(function* () {
      const locked = <A, E>(effect: Effect.Effect<A, E>) => state.lock.withPermits(1)(effect);
      const record = yield* loadThread(threadId);
      const instanceId = record.modelSelection.instanceId;
      const current = yield* locked(
        Effect.gen(function* () {
          const session = state.session;
          if (session !== null && session.instanceId !== instanceId) {
            yield* endSession(threadId, state, session, null);
            return null;
          }
          if (session !== null) yield* cancelIdleRelease(session);
          return session;
        }),
      );
      const session = current ?? (yield* openSession(threadId, state, record));
      if (current === null) {
        const stillActive = yield* locked(
          Effect.sync(() => {
            if (state.active !== active) return false;
            state.session = session;
            return true;
          }),
        );
        if (!stillActive) {
          return yield* Scope.close(session.scope, Exit.void);
        }
      }

      const runtimePolicy = runtimePolicyFor(record);
      const known = session.providerThread ?? record.providerThread;
      const reusable =
        known !== null && known.providerInstanceId === instanceId && known.nativeThreadRef !== null
          ? known
          : null;
      const ensureFresh = session.runtime.ensureThread({
        threadId,
        modelSelection: record.modelSelection,
        runtimePolicy,
        providerSessionId: session.runtime.providerSessionId,
      });
      const loaded =
        reusable === null
          ? { providerThread: yield* ensureFresh, fresh: true }
          : session.providerThread === reusable &&
              session.loadedWith !== null &&
              session.loadedWith.runtimeMode === record.runtimeMode &&
              modelSelectionsEqual(session.loadedWith.modelSelection, record.modelSelection)
            ? { providerThread: reusable, fresh: false }
            : yield* session.runtime
                .resumeThread({
                  providerThread: reusable,
                  threadId,
                  modelSelection: record.modelSelection,
                  runtimePolicy,
                })
                .pipe(
                  Effect.map((providerThread) => ({ providerThread, fresh: false })),
                  Effect.catch((error) =>
                    Effect.logWarning(
                      "agent could not resume the provider conversation; starting a new one",
                      error,
                    ).pipe(
                      Effect.andThen(ensureFresh),
                      Effect.map((providerThread) => ({ providerThread, fresh: true })),
                    ),
                  ),
                );
      const providerThread = loaded.providerThread;
      const providerTurnOrdinal = (loaded.fresh ? 0 : record.providerTurnOrdinal) + 1;

      const proceed = yield* locked(
        Effect.gen(function* () {
          if (state.active !== active) return false;
          if (state.session !== session) {
            return yield* new AgentError({
              code: "failed",
              detail: "The agent's session closed while it was starting. Send the message again.",
            });
          }
          session.providerThread = providerThread;
          session.loadedWith = {
            modelSelection: record.modelSelection,
            runtimeMode: record.runtimeMode,
          };
          active.providerThread = providerThread;
          active.phase = "running";
          yield* store.setProviderThread(threadId, providerThread, providerTurnOrdinal - 1);
          yield* publishSummary(threadId, state);
          return true;
        }),
      );
      if (!proceed) return;

      yield* mcpSessions.touch(threadId);
      yield* session.runtime.startTurn({
        appThread: appThread(record, providerThread),
        threadId,
        runId: active.turn.turnId,
        runOrdinal: active.turn.ordinal,
        providerTurnOrdinal,
        attemptId: active.attemptId,
        rootNodeId: active.rootNodeId,
        providerThread,
        message,
        modelSelection: record.modelSelection,
        runtimePolicy,
      });
    }).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) return Effect.void;
        const error = Cause.squash(cause);
        const failure = makeProviderFailure({
          cause: error,
          class: "provider_error",
          // Our own errors are written for the user; provider errors map to curated messages.
          ...(isAgentError(error) ? { message: error.detail } : {}),
        });
        return Effect.logWarning("agent turn failed to start", { threadId, cause }).pipe(
          Effect.andThen(
            state.lock.withPermits(1)(
              Effect.suspend(() =>
                state.active === active
                  ? finishTurn(threadId, state, { status: "failed", failure })
                  : Effect.void,
              ),
            ),
          ),
          Effect.ignoreCause({ log: true }),
        );
      }),
    );

  /** Accepts a turn and starts it in the background. Holds the thread's lock. */
  const beginTurn = (
    threadId: ThreadId,
    state: ThreadState,
    record: ThreadRecord,
    start: TurnStart,
  ): Effect.Effect<AgentTurn, AgentError> =>
    Effect.gen(function* () {
      const now = yield* DateTime.now;
      const iso = DateTime.formatIso(now);
      const ordinal = (yield* store.lastTurnOrdinal(threadId)) + 1;
      const turnId = idAllocator.derive.run({ threadId, ordinal });
      const rootNodeId = idAllocator.derive.rootNode({ runId: turnId });
      const turn: AgentTurn = {
        turnId,
        ordinal,
        status: "running",
        startedAt: iso,
        completedAt: null,
        error: null,
      };
      const base = {
        threadId,
        runId: turnId,
        nodeId: rootNodeId,
        providerThreadId: null,
        providerTurnId: null,
        nativeItemRef: null,
        parentItemId: null,
        ordinal: 0,
        status: "completed" as const,
        title: null,
        startedAt: now,
        completedAt: now,
        updatedAt: now,
      };
      let firstItem: OrchestrationV2TurnItem | null;
      let message: ProviderAdapterV2TurnMessage;
      if (start.kind === "message") {
        firstItem = {
          ...base,
          id: idAllocator.derive.userTurnItem({ messageId: start.messageId }),
          type: "user_message",
          createdBy: "user",
          creationSource: "web",
          messageId: start.messageId,
          inputIntent: "turn_start",
          text: start.text,
          attachments: [],
        };
        message = {
          messageId: start.messageId,
          text: providerMessageText(start.text, start.context),
          attachments: [],
          createdBy: "user",
          creationSource: "web",
        };
      } else {
        const notification = start.request.notification;
        firstItem =
          notification === undefined
            ? null
            : {
                ...base,
                id: idAllocator.derive.runSignalTurnItem({ runId: turnId, signal: "continuation" }),
                type: "notification",
                ...notification,
              };
        message = {
          messageId: yield* newMessageId(threadId),
          text: start.request.detail ?? notification?.summary ?? "",
          attachments: [],
          createdBy: "system",
          creationSource: "provider",
        };
      }

      yield* store.insertTurn(threadId, turn);
      yield* publish(threadId, { _tag: "turn", turn });
      if (firstItem !== null) yield* saveItem(ordinal, firstItem);
      yield* store.updateThread({
        threadId,
        updatedAt: iso,
        ...(start.kind === "message"
          ? { preview: cut(oneLine(start.text), PREVIEW_MAX_LENGTH) }
          : {}),
        // A thread named by default takes its name from its first message.
        ...(start.kind === "message" && ordinal === 1 && record.title === DEFAULT_TITLE
          ? { title: titleFrom(start.text) }
          : {}),
      });
      const active: ActiveTurn = {
        turn,
        attemptId: idAllocator.derive.runAttempt({ runId: turnId, attemptOrdinal: 1 }),
        rootNodeId,
        phase: "starting",
        providerThread: null,
        providerTurnId: null,
        interruptRequested: false,
        starter: null,
      };
      state.active = active;
      yield* publishSummary(threadId, state);
      active.starter = yield* runTurn(threadId, state, active, message).pipe(
        Effect.forkIn(layerScope),
      );
      return turn;
    });

  // ── Provider events ────────────────────────────────────────────────

  /** Applies one adapter event. Holds the thread's lock. */
  const handleEvent = (
    threadId: ThreadId,
    state: ThreadState,
    session: LiveSession,
    event: ProviderAdapterV2Event,
  ): Effect.Effect<void, AgentError> =>
    Effect.gen(function* () {
      if (state.session !== session) return;
      const active = state.active;
      switch (event.type) {
        case "turn_item.updated": {
          const item = event.turnItem;
          // Subagents' own threads; their progress reaches this thread as a `subagent` item.
          if (item.threadId !== threadId) return;
          yield* saveItem(yield* turnOrdinalFor(state, threadId, item), item);
          if (item.type === "assistant_message" && !item.streaming && item.text.trim() !== "") {
            yield* store.updateThread({
              threadId,
              preview: cut(oneLine(item.text), PREVIEW_MAX_LENGTH),
              updatedAt: DateTime.formatIso(yield* DateTime.now),
            });
            yield* publishSummary(threadId, state);
          }
          return;
        }
        case "runtime_request.updated": {
          if (event.threadId !== undefined && event.threadId !== threadId) return;
          yield* saveRequest(threadId, event.runtimeRequest);
          yield* publishSummary(threadId, state);
          return;
        }
        case "provider_turn.updated": {
          const providerTurn = event.providerTurn;
          if (active === null || providerTurn.runAttemptId !== active.attemptId) return;
          yield* store.recordProviderTurnOrdinal(threadId, providerTurn.ordinal);
          if (active.providerTurnId !== null) return;
          active.providerTurnId = providerTurn.id;
          // A stop that came before the provider named its turn.
          if (active.interruptRequested && active.providerThread !== null) {
            yield* session.runtime
              .interruptTurn({
                providerThread: active.providerThread,
                providerTurnId: providerTurn.id,
              })
              .pipe(Effect.ignoreCause({ log: true }), Effect.forkIn(layerScope));
          }
          return;
        }
        case "provider_thread.updated": {
          const providerThread = event.providerThread;
          if (session.providerThread?.id !== providerThread.id) return;
          session.providerThread = providerThread;
          if (active !== null) active.providerThread = providerThread;
          const record = yield* loadThread(threadId);
          yield* store.setProviderThread(threadId, providerThread, record.providerTurnOrdinal);
          return;
        }
        case "turn.terminal": {
          if (active === null) return;
          const ours =
            active.providerTurnId === null
              ? event.runOrdinal === active.turn.ordinal
              : event.providerTurnId === active.providerTurnId;
          if (!ours) return;
          if (event.threadDisposition === "broken") {
            // The provider cannot continue this conversation; the next turn starts a new one.
            session.providerThread = null;
            yield* store.setProviderThread(threadId, null, 0);
          }
          if (event.status !== "failed") {
            return yield* finishTurn(threadId, state, {
              status: event.status === "completed" ? "completed" : "interrupted",
            });
          }
          return yield* finishTurn(threadId, state, {
            status: "failed",
            failure: event.failure,
            item: makeProviderFailureTurnItem({
              idAllocator,
              driver: event.driver,
              threadId,
              runId: active.turn.turnId,
              nodeId: active.rootNodeId,
              providerThreadId: event.providerThreadId,
              providerTurnId: event.providerTurnId,
              itemOrdinal: event.failureItemOrdinal,
              failure: event.failure,
              ...(event.retry === undefined ? {} : { retry: event.retry }),
              ...(event.retryStartedAt === undefined
                ? {}
                : { retryStartedAt: event.retryStartedAt }),
              occurredAt: yield* DateTime.now,
            }),
          });
        }
        default:
          return;
      }
    });

  /** Consumes a session's events until the session closes; an unexpected end fails its turn. */
  const pump = (threadId: ThreadId, state: ThreadState, session: LiveSession) =>
    session.runtime.events.pipe(
      Stream.runForEach((event) =>
        state.lock.withPermits(1)(
          handleEvent(threadId, state, session, event).pipe(
            Effect.catch((error) =>
              Effect.logWarning("agent could not apply a provider event", {
                threadId,
                type: event.type,
                error,
              }),
            ),
          ),
        ),
      ),
      Effect.exit,
      Effect.flatMap((exit) =>
        Effect.logWarning("agent provider session ended", { threadId, exit }).pipe(
          Effect.andThen(
            state.lock.withPermits(1)(
              endSession(threadId, state, session, "The agent stopped unexpectedly. Try again."),
            ),
          ),
        ),
      ),
      Effect.ignoreCause({ log: true }),
    );

  const continueThread = (request: ProviderContinuationRequest) =>
    Effect.gen(function* () {
      const state = states.get(request.threadId);
      if (state === undefined) return;
      yield* state.lock.withPermits(1)(
        Effect.gen(function* () {
          if (state.session === null) return;
          if (state.active !== null) {
            state.continuation = request;
            return;
          }
          const record = yield* store.getThread(request.threadId);
          if (Option.isNone(record)) return;
          yield* beginTurn(request.threadId, state, record.value, {
            kind: "continuation",
            request,
          });
        }),
      );
    });

  // ── Recovery ───────────────────────────────────────────────────────

  // Nothing survives a restart: running turns were cut off and no provider is waiting for an
  // answer to a pending request.
  const recoveredAt = yield* DateTime.now;
  for (const { threadId, turnId } of yield* store.listRunningTurns) {
    const turns = yield* store.listTurns(threadId);
    const turn = turns.find((candidate) => candidate.turnId === turnId);
    if (turn === undefined) continue;
    for (const item of yield* store.listItems(threadId, turn.ordinal)) {
      if (isOpenItem(item)) {
        yield* store.upsertItem(turn.ordinal, settleItem(item, "interrupted", recoveredAt));
      }
    }
    yield* store.updateTurn({
      ...turn,
      status: "interrupted",
      completedAt: DateTime.formatIso(recoveredAt),
    });
  }
  for (const { threadId, request } of yield* store.listPendingRequests()) {
    yield* store.upsertRequest(
      threadId,
      expireRequest(request, "The server restarted before this was answered.", recoveredAt),
    );
  }

  yield* continuationRequests.take.pipe(
    Effect.flatMap((request) =>
      continueThread(request).pipe(
        Effect.catchCause((cause) => Effect.logWarning("agent could not continue a thread", cause)),
      ),
    ),
    Effect.forever,
    Effect.forkIn(layerScope),
  );

  // ── Service ────────────────────────────────────────────────────────

  const createThread: AgentServiceShape["createThread"] = Effect.fn("AgentService.createThread")(
    function* (input) {
      const settings = yield* serverSettings.getSettings.pipe(
        Effect.mapError(
          () => new AgentError({ code: "failed", detail: "Could not read the settings." }),
        ),
      );
      const modelSelection =
        input.modelSelection ?? settings.defaultModelSelection ?? (yield* defaultModelSelection);
      yield* requireAdapter(modelSelection.instanceId);
      const threadId = yield* idAllocator.allocate
        .thread({})
        .pipe(
          Effect.mapError(
            () => new AgentError({ code: "failed", detail: "Could not create the conversation." }),
          ),
        );
      const text = input.message?.trim() ?? "";
      yield* store.insertThread({
        threadId,
        title: input.title ?? titleFrom(text),
        modelSelection,
        runtimeMode: input.runtimeMode ?? settings.defaultRuntimeMode,
        now: DateTime.formatIso(yield* DateTime.now),
      });
      const state = stateFor(threadId);
      return yield* state.lock.withPermits(1)(
        Effect.gen(function* () {
          if (text !== "") {
            yield* beginTurn(threadId, state, yield* loadThread(threadId), {
              kind: "message",
              messageId: yield* newMessageId(threadId),
              text,
              context: input.context,
            });
          }
          return yield* publishSummary(threadId, state);
        }),
      );
    },
  );

  const newMessageId = (threadId: ThreadId) =>
    idAllocator.allocate
      .message({ threadId, ordinal: 0 })
      .pipe(
        Effect.mapError(
          () => new AgentError({ code: "failed", detail: "Could not send the message." }),
        ),
      );

  const updateThread: AgentServiceShape["updateThread"] = Effect.fn("AgentService.updateThread")(
    function* (input) {
      const state = yield* existingState(input.threadId);
      return yield* state.lock.withPermits(1)(
        Effect.gen(function* () {
          if (input.modelSelection !== undefined) {
            yield* requireAdapter(input.modelSelection.instanceId);
          }
          yield* store.updateThread(input);
          // A switch to another agent frees the idle session now; a running turn keeps its
          // session, and the next turn opens the new one.
          const session = state.session;
          if (
            session !== null &&
            state.active === null &&
            input.modelSelection !== undefined &&
            input.modelSelection.instanceId !== session.instanceId
          ) {
            yield* endSession(input.threadId, state, session, null);
          }
          return yield* publishSummary(input.threadId, state);
        }),
      );
    },
  );

  const deleteThread: AgentServiceShape["deleteThread"] = Effect.fn("AgentService.deleteThread")(
    function* (threadId) {
      const state = yield* existingState(threadId);
      yield* state.lock.withPermits(1)(
        Effect.gen(function* () {
          const starter = state.active?.starter ?? null;
          state.active = null;
          if (starter !== null) yield* Fiber.interrupt(starter);
          const session = state.session;
          state.session = null;
          if (session !== null) {
            yield* Scope.close(session.scope, Exit.void).pipe(Effect.forkIn(layerScope));
          }
          yield* mcpSessions.revokeThread(threadId);
          yield* store.deleteThread(threadId);
          yield* publish(threadId, { _tag: "removed" });
          yield* listLock.withPermits(1)(PubSub.publish(listEvents, { _tag: "removed", threadId }));
        }),
      );
      states.delete(threadId);
    },
  );

  const sendMessage: AgentServiceShape["sendMessage"] = Effect.fn("AgentService.sendMessage")(
    function* (input) {
      const state = yield* existingState(input.threadId);
      const messageId = input.messageId ?? (yield* newMessageId(input.threadId));
      const accepted = yield* state.lock.withPermits(1)(
        Effect.gen(function* () {
          const record = yield* loadThread(input.threadId);
          const active = state.active;
          if (active === null) {
            yield* requireAdapter(record.modelSelection.instanceId);
            const turn = yield* beginTurn(input.threadId, state, record, {
              kind: "message",
              messageId,
              text: input.text,
              context: input.context,
            });
            return { turn } as const;
          }
          const session = state.session;
          if (
            active.phase === "running" &&
            active.providerTurnId !== null &&
            active.providerThread !== null &&
            session !== null &&
            session.runtime.providerSession.capabilities.turns.supportsActiveSteering
          ) {
            return {
              steer: {
                active,
                runtime: session.runtime,
                providerThread: active.providerThread,
                providerTurnId: active.providerTurnId,
              },
            } as const;
          }
          return yield* new AgentError({
            code: "busy",
            detail: "The agent is still working on the last message. Stop it or wait.",
          });
        }),
      );
      if ("turn" in accepted) return accepted.turn;

      // Steering: the running turn takes the message as it goes.
      const { active } = accepted.steer;
      yield* accepted.steer.runtime
        .steerTurn({
          threadId: input.threadId,
          runId: active.turn.turnId,
          providerThread: accepted.steer.providerThread,
          providerTurnId: accepted.steer.providerTurnId,
          message: {
            messageId,
            text: providerMessageText(input.text, input.context),
            attachments: [],
            createdBy: "user",
            creationSource: "web",
          },
        })
        .pipe(
          Effect.mapError(
            () => new AgentError({ code: "failed", detail: "Could not send the message." }),
          ),
        );
      return yield* state.lock.withPermits(1)(
        Effect.gen(function* () {
          const now = yield* DateTime.now;
          const ordinal = active.turn.ordinal;
          yield* saveItem(ordinal, {
            id: idAllocator.derive.userTurnItem({ messageId }),
            threadId: input.threadId,
            runId: active.turn.turnId,
            nodeId: active.rootNodeId,
            providerThreadId: accepted.steer.providerThread.id,
            providerTurnId: accepted.steer.providerTurnId,
            nativeItemRef: null,
            parentItemId: null,
            ordinal: (yield* store.maxItemOrdinal(input.threadId, ordinal)) + 1,
            status: "completed",
            title: null,
            startedAt: now,
            completedAt: now,
            updatedAt: now,
            type: "user_message",
            createdBy: "user",
            creationSource: "web",
            messageId,
            inputIntent: "steer",
            text: input.text,
            attachments: [],
          });
          yield* store.updateThread({
            threadId: input.threadId,
            preview: cut(oneLine(input.text), PREVIEW_MAX_LENGTH),
            updatedAt: DateTime.formatIso(now),
          });
          yield* publishSummary(input.threadId, state);
          return active.turn;
        }),
      );
    },
  );

  const interrupt: AgentServiceShape["interrupt"] = Effect.fn("AgentService.interrupt")(
    function* (threadId) {
      const state = yield* existingState(threadId);
      const target = yield* state.lock.withPermits(1)(
        Effect.gen(function* () {
          const active = state.active;
          if (active === null) return null;
          const session = state.session;
          // Not at the provider yet, or it ignored the first stop: settle the turn here.
          if (active.phase === "starting" || active.interruptRequested || session === null) {
            if (active.starter !== null) yield* Fiber.interrupt(active.starter);
            yield* finishTurn(threadId, state, { status: "interrupted" });
            if (active.interruptRequested && session !== null) {
              yield* endSession(threadId, state, session, null);
            }
            return null;
          }
          active.interruptRequested = true;
          // Without a provider turn id yet, the pump stops the turn once the provider names it.
          if (active.providerTurnId === null || active.providerThread === null) return null;
          return {
            runtime: session.runtime,
            providerThread: active.providerThread,
            providerTurnId: active.providerTurnId,
          };
        }),
      );
      if (target === null) return;
      yield* target.runtime
        .interruptTurn({
          providerThread: target.providerThread,
          providerTurnId: target.providerTurnId,
        })
        .pipe(
          Effect.mapError(
            () => new AgentError({ code: "failed", detail: "Could not stop the agent." }),
          ),
        );
    },
  );

  const respondToRequest: AgentServiceShape["respondToRequest"] = Effect.fn(
    "AgentService.respondToRequest",
  )(function* (input) {
    const state = yield* existingState(input.threadId);
    const runtime = yield* state.lock.withPermits(1)(
      Effect.gen(function* () {
        const request = Option.getOrUndefined(
          yield* store.getRequest(input.threadId, input.requestId),
        );
        if (request === undefined || request.status !== "pending") {
          return yield* new AgentError({
            code: "request_not_found",
            detail: "This request was already answered or no longer exists.",
          });
        }
        const session = state.session;
        if (
          session === null ||
          request.responseCapability.type !== "live" ||
          request.responseCapability.providerSessionId !== session.runtime.providerSessionId
        ) {
          const now = yield* DateTime.now;
          yield* saveRequest(
            input.threadId,
            expireRequest(request, "The agent is no longer waiting for this answer.", now),
          );
          yield* publishSummary(input.threadId, state);
          return yield* new AgentError({
            code: "request_not_found",
            detail: "The agent is no longer waiting for this answer.",
          });
        }
        return session.runtime;
      }),
    );
    yield* mcpSessions.touch(input.threadId);
    yield* runtime
      .respondToRuntimeRequest({
        requestId: input.requestId,
        ...(input.decision === undefined ? {} : { decision: input.decision }),
        ...(input.answers === undefined ? {} : { answers: input.answers }),
      })
      .pipe(
        Effect.mapError(
          () =>
            new AgentError({ code: "failed", detail: "Could not send the answer to the agent." }),
        ),
      );
    yield* state.lock.withPermits(1)(
      Effect.gen(function* () {
        const request = Option.getOrUndefined(
          yield* store.getRequest(input.threadId, input.requestId),
        );
        if (request === undefined || request.status !== "pending") return;
        yield* saveRequest(input.threadId, {
          ...request,
          status: "resolved",
          resolvedAt: yield* DateTime.now,
          ...(input.decision === undefined ? {} : { decision: input.decision }),
          ...(input.answers === undefined ? {} : { answers: input.answers }),
        });
        yield* publishSummary(input.threadId, state);
      }),
    );
  });

  const streamThreads: AgentServiceShape["streamThreads"] = Stream.unwrap(
    listLock.withPermits(1)(
      Effect.gen(function* () {
        const subscription = yield* PubSub.subscribe(listEvents);
        const threads = (yield* store.listThreads).map((record) =>
          toSummary(record, states.get(record.threadId)),
        );
        const snapshot: AgentThreadListEvent = { _tag: "snapshot", threads };
        return Stream.concat(Stream.make(snapshot), Stream.fromSubscription(subscription));
      }),
    ),
  );

  const readDetail = (threadId: ThreadId, state: ThreadState) =>
    Effect.gen(function* () {
      const record = yield* loadThread(threadId);
      const detail: AgentThreadDetail = {
        thread: toSummary(record, state),
        turns: yield* store.listTurns(threadId),
        items: yield* store.listItems(threadId),
        pendingRequests: (yield* store.listPendingRequests(threadId)).map(({ request }) => request),
      };
      return detail;
    });

  const streamThread: AgentServiceShape["streamThread"] = (threadId) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const state = yield* existingState(threadId);
        return yield* state.lock.withPermits(1)(
          Effect.gen(function* () {
            const subscription = yield* PubSub.subscribe(threadEvents);
            const detail = yield* readDetail(threadId, state);
            const snapshot: AgentThreadEvent = { _tag: "snapshot", detail };
            return Stream.concat(
              Stream.make(snapshot),
              Stream.fromSubscription(subscription).pipe(
                Stream.filter((entry) => entry.threadId === threadId),
                Stream.map((entry) => entry.event),
                Stream.takeUntil((event) => event._tag === "removed"),
              ),
            );
          }),
        );
      }),
    );

  return AgentService.of({
    createThread,
    updateThread,
    deleteThread,
    sendMessage,
    interrupt,
    respondToRequest,
    streamThreads,
    streamThread,
  });
});

export const layer = Layer.effect(AgentService, make).pipe(Layer.provide(IdAllocator.layer));
