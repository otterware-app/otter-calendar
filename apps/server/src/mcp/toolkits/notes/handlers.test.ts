import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, Note, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { McpSchema, McpServer, Tool } from "effect/unstable/ai";

import { NotesService } from "../../../notes/NotesService.ts";
import * as NotesServiceLive from "../../../notes/NotesServiceLive.ts";
import { SqlitePersistenceMemory } from "../../../persistence/Layers/Sqlite.ts";
import { APP_READ_ONLY_TOOL_NAMES, AppToolkit } from "../../AppToolkit.ts";
import * as McpHttpServer from "../../McpHttpServer.ts";
import { McpInvocationContext } from "../../McpInvocationContext.ts";

const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));
const decodeNote = Schema.decodeUnknownSync(Schema.fromJsonString(Note));

const client = McpSchema.McpServerClient.of({
  clientId: 1,
  protocolVersion: "2025-06-18",
  clientCapabilities: {},
  clientInfo: { name: "notes-tools-test", version: "1" },
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "notes-tools-test", version: "1" },
  },
  getClient: Effect.die("unused"),
});

const TestLayer = McpHttpServer.AppToolkitRegistrationLive.pipe(
  Layer.provideMerge(McpServer.McpServer.layer),
  Layer.provideMerge(NotesServiceLive.layer),
  Layer.provide(SqlitePersistenceMemory),
  Layer.provide(NodeServices.layer),
);

/** Calls a tool the way a provider does over `/mcp`, and reads its JSON text result. */
const call = (name: string, args: Record<string, unknown>) =>
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const result = yield* server.callTool({ name, arguments: args }).pipe(
      Effect.provideService(McpInvocationContext, {
        environmentId: EnvironmentId.make("environment-notes-tools"),
        threadId: ThreadId.make("thread-notes-tools"),
        providerSessionId: "provider-session-notes-tools",
        providerInstanceId: ProviderInstanceId.make("codex"),
        issuedAt: 0,
      }),
      Effect.provideService(McpSchema.McpServerClient, client),
    );
    const [content] = result.content;
    return {
      isError: result.isError === true,
      text: content?.type === "text" ? content.text : "",
    };
  });

it("publishes object-root inputs without references and marks only reads as read-only", () => {
  for (const tool of Object.values(AppToolkit.tools)) {
    const schema = Tool.getJsonSchema(tool);
    expect(schema).toMatchObject({ type: "object" });
    // Some providers do not resolve `$ref` in tool schemas.
    expect(JSON.stringify(schema), tool.name).not.toContain('"$ref"');
  }
  expect([...APP_READ_ONLY_TOOL_NAMES].sort()).toEqual(["notes_get", "notes_list"]);
});

it.effect("changes notes through the same service the app uses", () =>
  Effect.gen(function* () {
    const notes = yield* NotesService;
    const created = yield* call("notes_create", { title: "Trip", body: "Book the train" });
    expect(created.isError).toBe(false);
    const note = decodeNote(created.text);
    expect((yield* notes.list).map((entry) => entry.title)).toEqual(["Trip"]);

    yield* notes.create({ title: "Groceries", body: "Milk" });
    const found = decodeJson((yield* call("notes_list", { query: "TRAIN" })).text);
    expect(found).toEqual({
      notes: [
        expect.objectContaining({ noteId: note.noteId, title: "Trip", excerpt: "Book the train" }),
      ],
    });

    const updated = yield* call("notes_update", { noteId: note.noteId, pinned: true });
    expect(decodeJson(updated.text)).toMatchObject({ title: "Trip", pinned: true });

    const deleted = yield* call("notes_delete", { noteId: note.noteId });
    expect(decodeJson(deleted.text)).toEqual({ deleted: note.noteId });
    expect((yield* notes.list).map((entry) => entry.title)).toEqual(["Groceries"]);
  }).pipe(Effect.provide(TestLayer)),
);

it.effect("tells the agent when a note does not exist", () =>
  Effect.gen(function* () {
    const result = yield* call("notes_get", { noteId: "missing" });
    expect(result).toEqual({ isError: true, text: "That note does not exist." });
  }).pipe(Effect.provide(TestLayer)),
);
