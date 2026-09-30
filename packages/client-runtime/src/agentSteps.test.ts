import { BRAND } from "@t3tools/shared/brand";
import { describe, expect, it } from "@effect/vitest";

import {
  agentTurnWorkLabel,
  appToolTitle,
  describeAgentStep,
  presentAgentTurns,
  presentPendingRequests,
} from "./agentSteps.ts";
import {
  TURN_1,
  TURN_2,
  assistantMessage,
  detail,
  dynamicTool,
  item,
  runtimeRequest,
  turn,
  userMessage,
} from "./agentTestFixtures.ts";

describe("describeAgentStep", () => {
  it("reads the app's own tools by their titles, from either provider", () => {
    const claude = describeAgentStep(
      dynamicTool("a", 1, `mcp__${BRAND.slug}__calendar_create_event`, { title: "Standup" }),
    );
    const codex = describeAgentStep(
      dynamicTool("b", 1, `${BRAND.slug.replace(/-/g, "_")}.calendar_list_events`),
    );

    expect(claude).toMatchObject({
      kind: "tool",
      title: "Created event",
      source: BRAND.displayName,
      detail: '{"title":"Standup"}',
    });
    expect(codex).toMatchObject({ title: "Listed events", source: BRAND.displayName });
  });

  it("names other MCP servers by their title-cased name", () => {
    expect(describeAgentStep(dynamicTool("a", 1, "mcp__linear-server__list_issues"))).toMatchObject(
      { title: "List issues", source: "Linear Server" },
    );
  });

  it("describes commands, reads, searches, and edits in words", () => {
    expect(
      describeAgentStep(
        item("command_execution", {
          id: "c",
          ordinal: 1,
          input: "/bin/zsh -lc 'ls -la'",
          output: "total 0",
          exitCode: 0,
        }),
      ),
    ).toMatchObject({
      kind: "command",
      title: "Ran `ls -la`",
      output: "total 0",
      status: "completed",
    });
    expect(
      describeAgentStep(dynamicTool("r", 1, "Read", { file_path: "/work/notes/today.md" })),
    ).toMatchObject({ kind: "read", title: "Read today.md", detail: "/work/notes/today.md" });
    expect(describeAgentStep(dynamicTool("g", 1, "Grep", { pattern: "TODO" }))).toMatchObject({
      kind: "search",
      title: "Searched for TODO",
    });
    expect(
      describeAgentStep(item("file_change", { id: "e", ordinal: 1, fileName: "/work/a/b.ts" })),
    ).toMatchObject({ kind: "edit", title: "Edited b.ts" });
  });

  it("marks a command that exited non-zero as failed", () => {
    expect(
      describeAgentStep(
        item("command_execution", { id: "c", ordinal: 1, input: "false", exitCode: 1 }),
      ),
    ).toMatchObject({ status: "failed" });
  });

  it("hides the provider's own bookkeeping and non-tool items", () => {
    expect(describeAgentStep(dynamicTool("t", 1, "ToolSearch"))).toBeNull();
    expect(
      describeAgentStep(item("reasoning", { id: "r", ordinal: 1, text: "Hmm", streaming: false })),
    ).toBeNull();
    expect(describeAgentStep(assistantMessage("m", 1, "Done."))).toBeNull();
  });

  it("keeps only the start of a long output", () => {
    const step = describeAgentStep(
      item("dynamic_tool", {
        id: "d",
        ordinal: 1,
        toolName: `mcp__${BRAND.slug}__calendar_list_events`,
        input: {},
        output: [{ type: "text", text: "x".repeat(10_000) }],
      }),
    );
    expect(step?.output?.length).toBeLessThan(5_000);
  });
});

describe("appToolTitle", () => {
  it("puts the verb first and names one item for single-item verbs", () => {
    expect(appToolTitle("accounts_create")).toBe("Create account");
    expect(appToolTitle("accounts_get")).toBe("Read account");
    expect(appToolTitle("accounts_search")).toBe("Search accounts");
    expect(appToolTitle("summarize")).toBe("Summarize");
  });

  it("reads calendar tools as what they did", () => {
    expect(appToolTitle("calendar_list_events")).toBe("Listed events");
    expect(appToolTitle("calendar_create_event")).toBe("Created event");
    expect(appToolTitle("calendar_find_free_time")).toBe("Found free time");
    expect(appToolTitle("calendar_get_event")).toBe("Read event");
    expect(appToolTitle("calendar_respond")).toBe("Responded to invitation");
    expect(appToolTitle("calendar_respond_to_invitation")).toBe("Responded to invitation");
    expect(appToolTitle("calendar_list_accounts")).toBe("Listed accounts");
    expect(appToolTitle("calendar_events_search")).toBe("Searched events");
    expect(appToolTitle("calendar_overview")).toBe("Calendar overview");
  });
});

describe("presentAgentTurns", () => {
  it("splits a finished turn into prompt, foldable work, and the answer after the last step", () => {
    const [view] = presentAgentTurns(
      detail({
        turns: [turn({ turnId: TURN_1 })],
        items: [
          userMessage("u", 0, "Add a meeting"),
          assistantMessage("m1", 1, "Let me look first."),
          dynamicTool("s1", 2, `mcp__${BRAND.slug}__calendar_find_free_time`),
          dynamicTool("s2", 3, `mcp__${BRAND.slug}__calendar_create_event`),
          item("reasoning", { id: "r", ordinal: 4, text: "…", streaming: false }),
          assistantMessage("m2", 5, "Added it."),
        ],
      }),
    );

    expect(view?.prompt).toEqual({ id: "u", text: "Add a meeting" });
    expect(view?.stepCount).toBe(2);
    expect(view?.foldable).toBe(true);
    expect(view?.work.map((block) => block.type)).toEqual(["text", "group"]);
    const group = view?.work[1];
    expect(group?.type === "group" && group.steps.map((step) => step.title)).toEqual([
      "Found free time",
      "Created event",
    ]);
    expect(view?.answer).toEqual([{ type: "text", id: "m2", text: "Added it.", streaming: false }]);
  });

  it("does not fold a running turn and keeps turns in order with their own items", () => {
    const views = presentAgentTurns(
      detail({
        turns: [
          turn({ turnId: TURN_2, ordinal: 1, status: "running", completedAt: null }),
          turn({ turnId: TURN_1, ordinal: 0 }),
        ],
        items: [
          dynamicTool("s", 1, "Read", { file_path: "a.md" }),
          userMessage("u2", 0, "Second", TURN_2),
          userMessage("u1", 0, "First"),
          assistantMessage("m", 1, "Streaming", { runId: TURN_2, streaming: true }),
        ],
      }),
    );

    expect(views.map((view) => view.prompt?.text)).toEqual(["First", "Second"]);
    expect(views[0]?.foldable).toBe(true);
    expect(views[1]?.foldable).toBe(false);
    expect(views[1]?.answer).toEqual([
      { type: "text", id: "m", text: "Streaming", streaming: true },
    ]);
  });

  it("reports a failure once, and not a provider's own retries", () => {
    const failure = {
      class: "provider_error" as const,
      message: "Overloaded",
      code: null,
      retryable: true,
    };
    const [view] = presentAgentTurns(
      detail({
        turns: [turn({ turnId: TURN_1, status: "failed", error: "Overloaded" })],
        items: [
          userMessage("u", 0, "Hi"),
          item("error", {
            id: "retry",
            ordinal: 1,
            failure,
            retry: { attempt: 1, maxAttempts: 3, retryDelayMs: 1000 },
          }),
          item("error", { id: "final", ordinal: 2, failure }),
        ],
      }),
    );

    expect(view?.answer).toEqual([{ type: "error", id: "final", message: "Overloaded" }]);
    expect(view?.error).toBeNull();
  });
});

describe("presentPendingRequests", () => {
  it("pairs each pending request with the item that asks it", () => {
    const approval = item("approval_request", {
      id: "approval",
      ordinal: 1,
      requestId: runtimeRequest("request-1").id,
      requestKind: "command",
      prompt: "Run rm?",
    });
    const pending = presentPendingRequests(
      detail({
        items: [approval],
        pendingRequests: [runtimeRequest("request-1"), runtimeRequest("request-2")],
      }),
    );

    expect(pending.map((entry) => [entry.request.id, entry.item?.id ?? null])).toEqual([
      ["request-1", "approval"],
      ["request-2", null],
    ]);
  });
});

describe("agentTurnWorkLabel", () => {
  it("counts up while running and reports the total once done", () => {
    const running = turn({ turnId: TURN_1, status: "running", completedAt: null });
    expect(agentTurnWorkLabel(running, Date.parse("2026-09-30T10:00:04.000Z"))).toBe(
      "Working for 4s",
    );
    expect(
      agentTurnWorkLabel(turn({ turnId: TURN_1 }), Date.parse("2026-09-30T11:00:00.000Z")),
    ).toBe("Worked for 12s");
    expect(
      agentTurnWorkLabel(
        turn({ turnId: TURN_1, completedAt: "2026-09-30T10:03:05.000Z" }),
        Date.parse("2026-09-30T11:00:00.000Z"),
      ),
    ).toBe("Worked for 3m 5s");
  });

  it("needs no clock once the turn settled, even without a completion time", () => {
    expect(agentTurnWorkLabel(turn({ turnId: TURN_1 }))).toBe("Worked for 12s");
    expect(
      agentTurnWorkLabel(turn({ turnId: TURN_1, status: "interrupted", completedAt: null })),
    ).toBe("Worked");
  });
});
