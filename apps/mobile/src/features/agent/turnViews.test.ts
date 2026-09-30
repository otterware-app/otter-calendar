import {
  type AgentTurn,
  MessageId,
  type OrchestrationV2TurnItem,
  RunId,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { presentTurnsReusing } from "./turnViews";

const threadId = ThreadId.make("thread-1");
const now = DateTime.makeUnsafe("2026-09-30T12:00:00.000Z");

function turn(id: string, ordinal: number): AgentTurn {
  return {
    turnId: RunId.make(id),
    ordinal,
    status: "running",
    startedAt: "2026-09-30T12:00:00.000Z",
    completedAt: null,
    error: null,
  };
}

function answer(id: string, runId: string, text: string): OrchestrationV2TurnItem {
  return {
    type: "assistant_message",
    id: TurnItemId.make(id),
    threadId,
    runId: RunId.make(runId),
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 1,
    status: "running",
    title: null,
    startedAt: now,
    completedAt: null,
    updatedAt: now,
    messageId: MessageId.make(`message-${id}`),
    text,
    streaming: true,
  };
}

describe("presentTurnsReusing", () => {
  it("keeps the views of turns whose items did not change", () => {
    const first = turn("run-1", 0);
    const second = turn("run-2", 1);
    const firstAnswer = answer("item-1", "run-1", "Done.");
    const initial = presentTurnsReusing(new Map(), {
      turns: [first, second],
      items: [firstAnswer, answer("item-2", "run-2", "Work")],
    });

    const next = presentTurnsReusing(initial.cache, {
      turns: [first, second],
      items: [firstAnswer, answer("item-2", "run-2", "Working on it")],
    });

    expect(next.views[0]).toBe(initial.views[0]);
    expect(next.views[1]).not.toBe(initial.views[1]);
    expect(next.views[1]?.answer).toMatchObject([{ type: "text", text: "Working on it" }]);
  });

  it("presents turns oldest first and drops turns that are gone", () => {
    const first = turn("run-1", 0);
    const second = turn("run-2", 1);
    const initial = presentTurnsReusing(new Map(), { turns: [second, first], items: [] });
    expect(initial.views.map((view) => view.turn.turnId)).toEqual(["run-1", "run-2"]);

    const next = presentTurnsReusing(initial.cache, { turns: [second], items: [] });
    expect(next.views.map((view) => view.turn.turnId)).toEqual(["run-2"]);
    expect([...next.cache.keys()]).toEqual(["run-2"]);
  });
});
