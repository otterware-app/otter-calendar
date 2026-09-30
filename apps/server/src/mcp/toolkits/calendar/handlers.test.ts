import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import { McpSchema, McpServer, Tool } from "effect/unstable/ai";

import { CalendarService } from "../../../calendar/CalendarService.ts";
import * as CalendarServiceLive from "../../../calendar/CalendarServiceLive.ts";
import * as GoogleAuthUnavailable from "../../../calendar/GoogleAuthUnavailable.ts";
import { SqlitePersistenceMemory } from "../../../persistence/Layers/Sqlite.ts";
import { APP_READ_ONLY_TOOL_NAMES, AppToolkit } from "../../AppToolkit.ts";
import * as McpHttpServer from "../../McpHttpServer.ts";
import { McpInvocationContext } from "../../McpInvocationContext.ts";

const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

/** Thursday, 2026-10-01, 12:00 in Berlin. */
const NOW = Date.UTC(2026, 9, 1, 10, 0);

const client = McpSchema.McpServerClient.of({
  clientId: 1,
  protocolVersion: "2025-06-18",
  clientCapabilities: {},
  clientInfo: { name: "calendar-tools-test", version: "1" },
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "calendar-tools-test", version: "1" },
  },
  getClient: Effect.die("unused"),
});

const TestLayer = McpHttpServer.AppToolkitRegistrationLive.pipe(
  Layer.provideMerge(McpServer.McpServer.layer),
  Layer.provideMerge(CalendarServiceLive.layerWith({ demoLatency: false, autoSync: false })),
  Layer.provide(GoogleAuthUnavailable.layer),
  Layer.provide(SqlitePersistenceMemory),
  Layer.provide(NodeServices.layer),
);

/** Calls a tool the way a provider does over `/mcp`, and reads its JSON text result. */
const call = (name: string, args: Record<string, unknown>) =>
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const result = yield* server.callTool({ name, arguments: args }).pipe(
      Effect.provideService(McpInvocationContext, {
        environmentId: EnvironmentId.make("environment-calendar-tools"),
        threadId: ThreadId.make("thread-calendar-tools"),
        providerSessionId: "provider-session-calendar-tools",
        providerInstanceId: ProviderInstanceId.make("codex"),
        issuedAt: 0,
      }),
      Effect.provideService(McpSchema.McpServerClient, client),
    );
    const [content] = result.content;
    const text = content?.type === "text" ? content.text : "";
    return {
      isError: result.isError === true,
      text,
      json: result.isError ? undefined : decodeJson(text),
    };
  });

const withDemo = Effect.gen(function* () {
  yield* TestClock.setTime(NOW);
  const calendar = yield* CalendarService;
  yield* calendar.updatePreferences({ timeZone: "Europe/Berlin" });
  yield* calendar.addDemo({ size: "standard" });
  yield* calendar.sync({});
  return calendar;
});

type Json = Record<string, any>;

it("publishes object-root inputs without references and marks only reads as read-only", () => {
  for (const tool of Object.values(AppToolkit.tools)) {
    const schema = Tool.getJsonSchema(tool);
    expect(schema).toMatchObject({ type: "object" });
    // Some providers do not resolve `$ref` in tool schemas.
    expect(JSON.stringify(schema), tool.name).not.toContain('"$ref"');
  }
  expect([...APP_READ_ONLY_TOOL_NAMES].sort()).toEqual([
    "calendar_find_free_time",
    "calendar_get_event",
    "calendar_list_accounts",
    "calendar_list_events",
    "calendar_search_events",
  ]);
});

it.effect("lists accounts and events in the user's zone and searches every calendar", () =>
  Effect.gen(function* () {
    yield* withDemo;
    const accounts = (yield* call("calendar_list_accounts", {})).json as Json;
    expect(accounts.timeZone).toBe("Europe/Berlin");
    expect(accounts.workingHours).toEqual({
      start: "09:00",
      end: "17:00",
      days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    });
    expect(accounts.accounts.map((account: Json) => account.email)).toEqual([
      "alex.morgan@northwind.example",
      "alex.m.personal@gmail.example",
      "alex@otterware.example",
    ]);

    const day = (yield* call("calendar_list_events", { start: "2026-10-01", end: "2026-10-02" }))
      .json as Json;
    expect(day.truncated).toBe(false);
    const standup = day.events.find((event: Json) => event.title === "Daily standup");
    expect(standup).toMatchObject({
      calendar: "Alex Morgan",
      start: "2026-10-01T09:30:00+02:00",
      end: "2026-10-01T09:45:00+02:00",
    });
    expect(standup.seriesId).toBeDefined();
    const filtered = (yield* call("calendar_list_events", {
      start: "2026-10-01T00:00:00+02:00",
      end: "2026-10-02T00:00:00+02:00",
      query: "LUNCH",
    })).json as Json;
    expect(filtered.events.map((event: Json) => event.title)).toEqual(["Lunch"]);

    const nothing = (yield* call("calendar_search_events", { query: "no such meeting" }))
      .json as Json;
    expect(nothing.events).toEqual([]);
    const unity = (yield* call("calendar_search_events", { query: "German Unity" })).json as Json;
    expect(unity.events[0]).toMatchObject({
      title: "Day of German Unity",
      allDay: true,
      start: "2026-10-03",
      end: "2026-10-04",
      readOnly: true,
    });

    const detail = (yield* call("calendar_get_event", {
      calendarId: standup.calendarId,
      eventId: standup.eventId,
    })).json as Json;
    expect(detail).toMatchObject({ repeats: "Every weekday", canRespond: false });
    expect(detail.videoCall).toMatch(/^https:\/\/meet\.google\.com\//);
    expect(detail.attendees.length).toBeGreaterThan(1);
  }).pipe(Effect.provide(TestLayer)),
);

it.effect("creates events from wall times and finds free time around them", () =>
  Effect.gen(function* () {
    const calendar = yield* withDemo;
    const directory = yield* calendar.getDirectory;
    const side = directory.calendars.find((entry) => entry.name === "Alex")!;

    const created = (yield* call("calendar_create_event", {
      calendarId: side.calendarId,
      title: "Deep work",
      start: "2026-10-05T13:00",
      end: "2026-10-05T17:00",
    })).json as Json;
    expect(created.event).toMatchObject({
      title: "Deep work",
      start: "2026-10-05T13:00:00+02:00",
      end: "2026-10-05T17:00:00+02:00",
    });

    const moved = (yield* call("calendar_update_event", {
      calendarId: side.calendarId,
      eventId: created.event.eventId,
      start: "2026-10-05T14:00:00+02:00",
    })).json as Json;
    expect(moved.event).toMatchObject({
      start: "2026-10-05T14:00:00+02:00",
      end: "2026-10-05T18:00:00+02:00",
    });

    const free = (yield* call("calendar_find_free_time", {
      start: "2026-10-05",
      end: "2026-10-06",
      durationMinutes: 30,
    })).json as Json;
    expect(free.timeZone).toBe("Europe/Berlin");
    for (const slot of free.slots as Array<Json>) {
      expect(slot.start >= "2026-10-05T09:00:00+02:00").toBe(true);
      expect(slot.end <= "2026-10-05T14:00:00+02:00").toBe(true);
      expect(slot.minutes).toBeGreaterThanOrEqual(30);
    }

    const deleted = yield* call("calendar_delete_event", {
      calendarId: side.calendarId,
      eventId: created.event.eventId,
    });
    expect(deleted.json).toEqual({ deleted: true });
  }).pipe(Effect.provide(TestLayer)),
);

it.effect("tells the agent what went wrong", () =>
  Effect.gen(function* () {
    yield* withDemo;
    const badTime = yield* call("calendar_list_events", { start: "tomorrow", end: "2026-10-02" });
    expect(badTime.isError).toBe(true);
    expect(badTime.text).toContain("Could not read the time");
    const missing = yield* call("calendar_get_event", { calendarId: "nope", eventId: "nope" });
    expect(missing).toMatchObject({ isError: true, text: "That calendar does not exist." });
  }).pipe(Effect.provide(TestLayer)),
);
