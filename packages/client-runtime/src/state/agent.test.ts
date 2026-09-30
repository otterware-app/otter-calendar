import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import {
  TURN_1,
  TURN_2,
  assistantMessage,
  detail,
  runtimeRequest,
  summary,
  turn,
  userMessage,
} from "../agentTestFixtures.ts";
import { applyAgentThreadEvent, applyAgentThreadListEvent, EMPTY_AGENT_THREADS } from "./agent.ts";

const older = summary({ threadId: ThreadId.make("older"), updatedAt: "2026-09-30T09:00:00.000Z" });
const newer = summary({ threadId: ThreadId.make("newer"), updatedAt: "2026-09-30T11:00:00.000Z" });

describe("applyAgentThreadListEvent", () => {
  it("keeps threads newest first through snapshots, upserts, and removals", () => {
    const listed = applyAgentThreadListEvent(EMPTY_AGENT_THREADS, {
      _tag: "snapshot",
      threads: [older, newer],
    });
    expect(listed.map((thread) => thread.threadId)).toEqual(["newer", "older"]);

    const bumped = applyAgentThreadListEvent(listed, {
      _tag: "upserted",
      thread: { ...older, updatedAt: "2026-09-30T12:00:00.000Z", title: "Renamed" },
    });
    expect(bumped.map((thread) => [thread.threadId, thread.title])).toEqual([
      ["older", "Renamed"],
      ["newer", "Chat"],
    ]);

    const removed = applyAgentThreadListEvent(bumped, {
      _tag: "removed",
      threadId: newer.threadId,
    });
    expect(removed.map((thread) => thread.threadId)).toEqual(["older"]);
  });
});

describe("applyAgentThreadEvent", () => {
  const snapshot = applyAgentThreadEvent(null, {
    _tag: "snapshot",
    detail: detail({
      turns: [turn({ turnId: TURN_1 })],
      items: [assistantMessage("m", 1, "Hi"), userMessage("u", 0, "Hello")],
      pendingRequests: [runtimeRequest("done", "resolved"), runtimeRequest("open")],
    }),
  });

  it("orders a snapshot's items and keeps only open requests", () => {
    expect(snapshot?.items.map((item) => item.id)).toEqual(["u", "m"]);
    expect(snapshot?.pendingRequests.map((request) => request.id)).toEqual(["open"]);
  });

  it("replaces a streaming item in place and inserts new items in turn order", () => {
    const streamed = applyAgentThreadEvent(snapshot, {
      _tag: "item",
      item: assistantMessage("m", 1, "Hi there"),
    });
    expect(streamed?.items.map((item) => item.id)).toEqual(["u", "m"]);
    expect(streamed?.items[1]).toMatchObject({ text: "Hi there" });

    const withTurn = applyAgentThreadEvent(streamed, {
      _tag: "turn",
      turn: turn({ turnId: TURN_2, ordinal: 1, status: "running", completedAt: null }),
    });
    const withItems = [
      userMessage("u2", 0, "Again", TURN_2),
      assistantMessage("late", 2, "Late item of the first turn"),
    ].reduce((current, item) => applyAgentThreadEvent(current, { _tag: "item", item }), withTurn);

    expect(withItems?.turns.map((entry) => entry.turnId)).toEqual([TURN_1, TURN_2]);
    expect(withItems?.items.map((item) => item.id)).toEqual(["u", "m", "late", "u2"]);
  });

  it("adds a request while pending and drops it once answered", () => {
    const asked = applyAgentThreadEvent(snapshot, {
      _tag: "request",
      request: runtimeRequest("new"),
    });
    expect(asked?.pendingRequests.map((request) => request.id)).toEqual(["open", "new"]);

    const answered = applyAgentThreadEvent(asked, {
      _tag: "request",
      request: runtimeRequest("open", "resolved"),
    });
    expect(answered?.pendingRequests.map((request) => request.id)).toEqual(["new"]);
  });

  it("updates the summary and ends at null when the thread is removed", () => {
    const renamed = applyAgentThreadEvent(snapshot, {
      _tag: "thread",
      thread: summary({ title: "Renamed", status: "running" }),
    });
    expect(renamed?.thread).toMatchObject({ title: "Renamed", status: "running" });
    expect(applyAgentThreadEvent(renamed, { _tag: "removed" })).toBeNull();
  });

  it("ignores changes that arrive before the first snapshot", () => {
    expect(
      applyAgentThreadEvent(null, { _tag: "item", item: assistantMessage("m", 1, "Hi") }),
    ).toBeNull();
  });
});
