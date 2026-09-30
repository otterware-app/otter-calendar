import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  MessageId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderThreadId,
  ProviderTurnId,
  RuntimeRequestId,
  TurnItemId,
  type AgentThreadEvent,
  type OrchestrationV2ProviderThread,
  type OrchestrationV2TurnItem,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import * as ServerConfig from "../config.ts";
import * as McpProviderSession from "../mcp/McpProviderSession.ts";
import * as McpSessionRegistryTestkit from "../mcp/McpSessionRegistry.testkit.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { ClaudeProviderCapabilitiesV2 } from "../provider/adapters/ClaudeAdapterV2.ts";
import type {
  ProviderAdapterV2Event,
  ProviderAdapterV2InterruptInput,
  ProviderAdapterV2OpenSessionInput,
  ProviderAdapterV2RuntimeRequestResponseInput,
  ProviderAdapterV2Shape,
  ProviderAdapterV2TurnInput,
} from "../provider/adapters/ProviderAdapter.ts";
import * as ProviderAdapterRegistry from "../provider/adapters/ProviderAdapterRegistry.ts";
import * as ProviderSessionRelease from "../provider/ProviderSessionRelease.ts";
import * as ServerSettings from "../serverSettings.ts";
import { AgentService } from "./AgentService.ts";
import * as AgentServiceLive from "./AgentServiceLive.ts";

const instanceId = ProviderInstanceId.make("claude");
const driver = ProviderDriverKind.make("claudeAgent");

/** A provider that records what the service asks of it and emits whatever the test offers. */
const makeFakeProvider = (options: { readonly failStart?: boolean } = {}) =>
  Effect.gen(function* () {
    const events = yield* Queue.unbounded<ProviderAdapterV2Event>();
    const opened = yield* Queue.unbounded<ProviderAdapterV2OpenSessionInput>();
    const turnStarts = yield* Queue.unbounded<ProviderAdapterV2TurnInput>();
    const responses = yield* Queue.unbounded<ProviderAdapterV2RuntimeRequestResponseInput>();
    const interrupts = yield* Queue.unbounded<ProviderAdapterV2InterruptInput>();
    const loads = yield* Queue.unbounded<"ensure" | "resume">();
    const adapter: ProviderAdapterV2Shape = {
      instanceId,
      driver,
      getCapabilities: () => Effect.succeed(ClaudeProviderCapabilitiesV2),
      planSelectionTransition: () => Effect.die("unused"),
      openSession: (input) =>
        Effect.gen(function* () {
          yield* Queue.offer(opened, input);
          const now = yield* DateTime.now;
          return {
            instanceId,
            driver,
            providerSessionId: input.providerSessionId,
            providerSession: {
              id: input.providerSessionId,
              driver,
              providerInstanceId: instanceId,
              status: "ready",
              cwd: input.runtimePolicy.cwd ?? "/",
              model: input.modelSelection.model,
              capabilities: {
                ...ClaudeProviderCapabilitiesV2,
                turns: { ...ClaudeProviderCapabilitiesV2.turns, supportsActiveSteering: false },
              },
              createdAt: now,
              updatedAt: now,
              lastError: null,
            },
            events: Stream.fromQueue(events),
            ensureThread: (thread) =>
              Queue.offer(loads, "ensure").pipe(
                Effect.as<OrchestrationV2ProviderThread>({
                  id: ProviderThreadId.make(`provider-thread:${thread.threadId}`),
                  driver,
                  providerInstanceId: instanceId,
                  providerSessionId: input.providerSessionId,
                  appThreadId: thread.threadId,
                  ownerNodeId: null,
                  nativeThreadRef: {
                    driver,
                    nativeId: `native:${thread.threadId}`,
                    strength: "strong",
                  },
                  nativeConversationHeadRef: null,
                  status: "idle",
                  firstRunOrdinal: null,
                  lastRunOrdinal: null,
                  handoffIds: [],
                  forkedFrom: null,
                  pendingBackgroundTasks: [],
                  contextUsage: null,
                  nativeMetadata: null,
                  createdAt: now,
                  updatedAt: now,
                }),
              ),
            resumeThread: (thread) =>
              Queue.offer(loads, "resume").pipe(Effect.as(thread.providerThread)),
            startTurn: (turn) =>
              options.failStart === true
                ? Effect.die("the provider process exited")
                : Queue.offer(turnStarts, turn).pipe(Effect.asVoid),
            steerTurn: () => Effect.void,
            interruptTurn: (interrupt) => Queue.offer(interrupts, interrupt).pipe(Effect.asVoid),
            respondToRuntimeRequest: (response) =>
              Queue.offer(responses, response).pipe(Effect.asVoid),
            readThreadSnapshot: () => Effect.die("unused"),
            rollbackThread: () => Effect.die("unused"),
            forkThread: () => Effect.die("unused"),
          };
        }),
    };
    return { adapter, events, opened, turnStarts, responses, interrupts, loads };
  });

type FakeProvider = Effect.Success<ReturnType<typeof makeFakeProvider>>;

const agentLayer = (provider: FakeProvider) =>
  AgentServiceLive.layer.pipe(
    Layer.provide(ProviderAdapterRegistry.makeSingleLayer(provider.adapter)),
    Layer.provide(McpSessionRegistryTestkit.layer),
    Layer.provide(ProviderSessionRelease.layer),
    Layer.provide(ServerSettings.layerTest()),
  );

/** The database and state directory outlive one service instance, like a server restart. */
const StorageLayer = Layer.mergeAll(
  SqlitePersistenceMemory,
  ServerConfig.layerTest(process.cwd(), { prefix: "t3-agent-service-test-" }),
).pipe(Layer.provideMerge(NodeServices.layer));

const withAgent = <A, E, R>(
  provider: FakeProvider,
  use: (agent: AgentService["Service"]) => Effect.Effect<A, E, R>,
) =>
  Effect.scoped(
    Layer.build(agentLayer(provider)).pipe(
      Effect.flatMap((context) => use(Context.get(context, AgentService))),
    ),
  );

/** Subscribes to a thread and returns its snapshot and a way to wait for later events. */
const watch = (agent: AgentService["Service"], threadId: ThreadId) =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<AgentThreadEvent>();
    yield* Stream.runForEach(agent.streamThread(threadId), (event) =>
      Queue.offer(queue, event),
    ).pipe(Effect.forkScoped);
    const first = yield* Queue.take(queue);
    if (first._tag !== "snapshot") return yield* Effect.die("expected a snapshot first");
    const until = <T extends AgentThreadEvent>(
      predicate: (event: AgentThreadEvent) => event is T,
    ) =>
      Effect.gen(function* () {
        while (true) {
          const event = yield* Queue.take(queue);
          if (predicate(event)) return event;
        }
      });
    return { snapshot: first.detail, until };
  });

const isTurn =
  (status: string) =>
  (event: AgentThreadEvent): event is Extract<AgentThreadEvent, { _tag: "turn" }> =>
    event._tag === "turn" && event.turn.status === status;

const assistantItem = (
  turn: ProviderAdapterV2TurnInput,
  providerTurnId: ProviderTurnId,
  text: string,
  streaming: boolean,
  now: DateTime.Utc,
): OrchestrationV2TurnItem => ({
  id: TurnItemId.make(`assistant:${turn.runId}`),
  threadId: turn.threadId,
  runId: turn.runId,
  nodeId: turn.rootNodeId,
  providerThreadId: turn.providerThread.id,
  providerTurnId,
  nativeItemRef: null,
  parentItemId: null,
  ordinal: turn.providerTurnOrdinal * 100 + 1,
  status: streaming ? "running" : "completed",
  title: null,
  startedAt: now,
  completedAt: streaming ? null : now,
  updatedAt: now,
  type: "assistant_message",
  messageId: MessageId.make(`assistant-message:${turn.runId}`),
  text,
  streaming,
});

/** Emits the provider's turn start, like an adapter does once the turn is running. */
const emitTurnStarted = (provider: FakeProvider, turn: ProviderAdapterV2TurnInput) =>
  Effect.gen(function* () {
    const providerTurnId = ProviderTurnId.make(`provider-turn:${turn.runId}`);
    yield* Queue.offer(provider.events, {
      type: "provider_turn.updated",
      driver,
      providerTurn: {
        id: providerTurnId,
        providerThreadId: turn.providerThread.id,
        nodeId: turn.rootNodeId,
        runAttemptId: turn.attemptId,
        nativeTurnRef: null,
        ordinal: turn.providerTurnOrdinal,
        status: "running",
        startedAt: yield* DateTime.now,
        completedAt: null,
      },
    });
    return providerTurnId;
  });

const terminal = (
  turn: ProviderAdapterV2TurnInput,
  providerTurnId: ProviderTurnId,
  status: "completed" | "interrupted",
): ProviderAdapterV2Event => ({
  type: "turn.terminal",
  driver,
  providerThreadId: turn.providerThread.id,
  providerTurnId,
  runOrdinal: turn.runOrdinal,
  status,
  failure: null,
  threadDisposition: "reusable",
});

it.effect("runs a message through the provider and streams the answer", () =>
  Effect.gen(function* () {
    const provider = yield* makeFakeProvider();
    yield* withAgent(provider, (agent) =>
      Effect.gen(function* () {
        const thread = yield* agent.createThread({});
        expect(thread.title).toBe("New chat");
        const events = yield* watch(agent, thread.threadId);

        const accepted = yield* agent.sendMessage({
          threadId: thread.threadId,
          text: "Summarize my notes",
          context: "The user is on the Notes page.",
        });
        expect(accepted.status).toBe("running");

        const start = yield* Queue.take(provider.turnStarts);
        expect(start.runId).toBe(accepted.turnId);
        expect(start.providerTurnOrdinal).toBe(1);
        expect(start.message.text).toBe(
          "Summarize my notes\n\n```context\nThe user is on the Notes page.\n```",
        );
        expect(start.runtimePolicy.cwd).toMatch(/agent-workspace$/);
        const mcp = McpProviderSession.readMcpProviderSession(thread.threadId);
        expect(mcp?.serverName).toBe(McpProviderSession.MCP_SERVER_NAME);
        expect(mcp?.readOnlyToolNames).toContain("notes_list");
        expect(mcp?.instructions).toContain("notes_create");

        const providerTurnId = yield* emitTurnStarted(provider, start);
        const now = yield* DateTime.now;
        yield* Queue.offer(provider.events, {
          type: "turn_item.updated",
          driver,
          turnItem: assistantItem(start, providerTurnId, "You have", true, now),
        });
        yield* Queue.offer(provider.events, {
          type: "turn_item.updated",
          driver,
          turnItem: assistantItem(start, providerTurnId, "You have two notes.", false, now),
        });
        yield* Queue.offer(provider.events, terminal(start, providerTurnId, "completed"));
        yield* events.until(isTurn("completed"));

        const detail = (yield* watch(agent, thread.threadId)).snapshot;
        expect(detail.thread).toMatchObject({
          status: "idle",
          title: "Summarize my notes",
          preview: "You have two notes.",
        });
        expect(detail.turns.map((turn) => turn.status)).toEqual(["completed"]);
        expect(detail.items.map((item) => item.type)).toEqual([
          "user_message",
          "assistant_message",
        ]);
        const [userItem] = detail.items;
        // The context goes to the provider, not into the user's message.
        expect(userItem?.type === "user_message" ? userItem.text : null).toBe("Summarize my notes");
      }),
    );
  }).pipe(Effect.provide(StorageLayer)),
);

it.effect("answers an approval through the provider session that asked for it", () =>
  Effect.gen(function* () {
    const provider = yield* makeFakeProvider();
    yield* withAgent(provider, (agent) =>
      Effect.gen(function* () {
        const thread = yield* agent.createThread({ message: "Delete the old note" });
        const events = yield* watch(agent, thread.threadId);
        const session = yield* Queue.take(provider.opened);
        const start = yield* Queue.take(provider.turnStarts);
        const providerTurnId = yield* emitTurnStarted(provider, start);
        const requestId = RuntimeRequestId.make("request:delete-note");
        yield* Queue.offer(provider.events, {
          type: "runtime_request.updated",
          driver,
          threadId: thread.threadId,
          runtimeRequest: {
            id: requestId,
            nodeId: start.rootNodeId,
            providerTurnId,
            nativeRequestRef: null,
            kind: "permission",
            status: "pending",
            responseCapability: { type: "live", providerSessionId: session.providerSessionId },
            createdAt: yield* DateTime.now,
            resolvedAt: null,
          },
        });
        const waiting = yield* events.until(
          (event): event is Extract<AgentThreadEvent, { _tag: "thread" }> =>
            event._tag === "thread" && event.thread.status === "waiting",
        );
        expect(waiting.thread.pendingRequestCount).toBe(1);

        yield* agent.respondToRequest({ threadId: thread.threadId, requestId, decision: "accept" });
        expect(yield* Queue.take(provider.responses)).toMatchObject({
          requestId,
          decision: "accept",
        });
        const resolved = yield* events.until(
          (event): event is Extract<AgentThreadEvent, { _tag: "request" }> =>
            event._tag === "request" && event.request.status === "resolved",
        );
        expect(resolved.request.decision).toBe("accept");

        const again = yield* agent
          .respondToRequest({ threadId: thread.threadId, requestId, decision: "accept" })
          .pipe(Effect.flip);
        expect(again.code).toBe("request_not_found");

        yield* Queue.offer(provider.events, terminal(start, providerTurnId, "completed"));
        yield* events.until(isTurn("completed"));
      }),
    );
  }).pipe(Effect.provide(StorageLayer)),
);

it.effect("stops a running turn and settles what the provider left open", () =>
  Effect.gen(function* () {
    const provider = yield* makeFakeProvider();
    yield* withAgent(provider, (agent) =>
      Effect.gen(function* () {
        const thread = yield* agent.createThread({ message: "Write a long note" });
        const events = yield* watch(agent, thread.threadId);
        const start = yield* Queue.take(provider.turnStarts);
        const providerTurnId = yield* emitTurnStarted(provider, start);
        yield* Queue.offer(provider.events, {
          type: "turn_item.updated",
          driver,
          turnItem: assistantItem(start, providerTurnId, "Once upon", true, yield* DateTime.now),
        });
        yield* events.until(
          (event): event is Extract<AgentThreadEvent, { _tag: "item" }> =>
            event._tag === "item" && event.item.type === "assistant_message",
        );

        const busy = yield* agent
          .sendMessage({ threadId: thread.threadId, text: "Also this" })
          .pipe(Effect.flip);
        expect(busy.code).toBe("busy");

        yield* agent.interrupt(thread.threadId);
        expect((yield* Queue.take(provider.interrupts)).providerTurnId).toBe(providerTurnId);
        yield* Queue.offer(provider.events, terminal(start, providerTurnId, "interrupted"));
        yield* events.until(isTurn("interrupted"));

        const detail = (yield* watch(agent, thread.threadId)).snapshot;
        expect(detail.thread.status).toBe("idle");
        const assistant = detail.items.find((item) => item.type === "assistant_message");
        expect(assistant).toMatchObject({ status: "interrupted", streaming: false });
      }),
    );
  }).pipe(Effect.provide(StorageLayer)),
);

it.effect("fails the turn with a readable message when the provider cannot start it", () =>
  Effect.gen(function* () {
    const provider = yield* makeFakeProvider({ failStart: true });
    yield* withAgent(provider, (agent) =>
      Effect.gen(function* () {
        const thread = yield* agent.createThread({});
        const events = yield* watch(agent, thread.threadId);
        yield* agent.sendMessage({ threadId: thread.threadId, text: "Hello" });
        const failed = yield* events.until(isTurn("failed"));
        expect(failed.turn.error).toBeTruthy();
        const detail = (yield* watch(agent, thread.threadId)).snapshot;
        expect(detail.thread.status).toBe("idle");
        expect(detail.items.at(-1)?.type).toBe("error");
      }),
    );
  }).pipe(Effect.provide(StorageLayer)),
);

it.effect("recovers after a restart and resumes the provider's conversation", () =>
  Effect.gen(function* () {
    const before = yield* makeFakeProvider();
    const threadId = yield* withAgent(before, (agent) =>
      Effect.gen(function* () {
        const thread = yield* agent.createThread({ message: "Plan my week" });
        const events = yield* watch(agent, thread.threadId);
        const session = yield* Queue.take(before.opened);
        const start = yield* Queue.take(before.turnStarts);
        const providerTurnId = yield* emitTurnStarted(before, start);
        yield* Queue.offer(before.events, {
          type: "turn_item.updated",
          driver,
          turnItem: assistantItem(start, providerTurnId, "Monday:", true, yield* DateTime.now),
        });
        yield* Queue.offer(before.events, {
          type: "runtime_request.updated",
          driver,
          threadId: thread.threadId,
          runtimeRequest: {
            id: RuntimeRequestId.make("request:before-restart"),
            nodeId: start.rootNodeId,
            providerTurnId,
            nativeRequestRef: null,
            kind: "permission",
            status: "pending",
            responseCapability: { type: "live", providerSessionId: session.providerSessionId },
            createdAt: yield* DateTime.now,
            resolvedAt: null,
          },
        });
        yield* events.until(
          (event): event is Extract<AgentThreadEvent, { _tag: "request" }> =>
            event._tag === "request",
        );
        return thread.threadId;
      }),
    );

    const after = yield* makeFakeProvider();
    yield* withAgent(after, (agent) =>
      Effect.gen(function* () {
        const { snapshot, until } = yield* watch(agent, threadId);
        expect(snapshot.thread.status).toBe("idle");
        expect(snapshot.turns.map((turn) => turn.status)).toEqual(["interrupted"]);
        expect(snapshot.pendingRequests).toEqual([]);
        expect(snapshot.thread.pendingRequestCount).toBe(0);
        const assistant = snapshot.items.find((item) => item.type === "assistant_message");
        expect(assistant).toMatchObject({ status: "interrupted", streaming: false });

        yield* agent.sendMessage({ threadId, text: "Continue" });
        const start = yield* Queue.take(after.turnStarts);
        expect(yield* Queue.take(after.loads)).toBe("resume");
        expect(start.runOrdinal).toBe(2);
        expect(start.providerTurnOrdinal).toBe(2);
        const providerTurnId = yield* emitTurnStarted(after, start);
        yield* Queue.offer(after.events, terminal(start, providerTurnId, "completed"));
        yield* until(isTurn("completed"));
      }),
    );
  }).pipe(Effect.provide(StorageLayer)),
);

it.effect("deletes a thread and ends its subscriptions", () =>
  Effect.gen(function* () {
    const provider = yield* makeFakeProvider();
    yield* withAgent(provider, (agent) =>
      Effect.gen(function* () {
        const thread = yield* agent.createThread({ title: "Scratch" });
        const events = yield* watch(agent, thread.threadId);
        yield* agent.deleteThread(thread.threadId);
        yield* events.until(
          (event): event is Extract<AgentThreadEvent, { _tag: "removed" }> =>
            event._tag === "removed",
        );
        const missing = yield* agent
          .sendMessage({ threadId: thread.threadId, text: "Hello?" })
          .pipe(Effect.flip);
        expect(missing.code).toBe("thread_not_found");
      }),
    );
  }).pipe(Effect.provide(StorageLayer)),
);
