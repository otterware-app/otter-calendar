import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { NoteId, type NotesEvent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { NotesService } from "./NotesService.ts";
import * as NotesServiceLive from "./NotesServiceLive.ts";

const TestLayer = NotesServiceLive.layer.pipe(
  Layer.provide(SqlitePersistenceMemory),
  Layer.provide(NodeServices.layer),
);

it.effect("keeps pinned notes first, then the most recently updated", () =>
  Effect.gen(function* () {
    const notes = yield* NotesService;
    const groceries = yield* notes.create({ title: "Groceries", body: "Milk" });
    yield* TestClock.adjust("1 second");
    const ideas = yield* notes.create({ title: "Ideas" });
    yield* TestClock.adjust("1 second");
    const todo = yield* notes.create({ title: "Todo", pinned: true });
    expect(ideas.body).toBe("");
    expect((yield* notes.list).map((note) => note.title)).toEqual(["Todo", "Ideas", "Groceries"]);

    yield* TestClock.adjust("1 second");
    const edited = yield* notes.update({ noteId: groceries.noteId, body: "Milk, eggs" });
    expect(edited).toMatchObject({ title: "Groceries", body: "Milk, eggs", pinned: false });
    expect(edited.updatedAt > groceries.updatedAt).toBe(true);
    expect((yield* notes.list).map((note) => note.title)).toEqual(["Todo", "Groceries", "Ideas"]);

    yield* TestClock.adjust("1 second");
    yield* notes.update({ noteId: todo.noteId, pinned: false });
    yield* notes.remove(ideas.noteId);
    expect((yield* notes.list).map((note) => note.title)).toEqual(["Todo", "Groceries"]);
    expect(yield* notes.get(todo.noteId)).toMatchObject({ title: "Todo", pinned: false });
  }).pipe(Effect.provide(TestLayer)),
);

it.effect("reports a missing note as not found", () =>
  Effect.gen(function* () {
    const notes = yield* NotesService;
    const missing = NoteId.make("missing");
    expect((yield* Effect.flip(notes.get(missing))).code).toBe("not_found");
    expect((yield* Effect.flip(notes.update({ noteId: missing, title: "X" }))).code).toBe(
      "not_found",
    );
    expect((yield* Effect.flip(notes.remove(missing))).code).toBe("not_found");
  }).pipe(Effect.provide(TestLayer)),
);

it.effect("streams a snapshot, then every change", () =>
  Effect.gen(function* () {
    const notes = yield* NotesService;
    const existing = yield* notes.create({ title: "Existing" });
    const received = yield* Queue.unbounded<NotesEvent>();
    yield* Stream.runForEach(notes.stream, (event) => Queue.offer(received, event)).pipe(
      Effect.forkScoped,
    );
    expect(yield* Queue.take(received)).toEqual({ _tag: "snapshot", notes: [existing] });

    const created = yield* notes.create({ title: "New" });
    expect(yield* Queue.take(received)).toEqual({ _tag: "upserted", note: created });
    const renamed = yield* notes.update({ noteId: created.noteId, title: "Renamed" });
    expect(yield* Queue.take(received)).toEqual({ _tag: "upserted", note: renamed });
    yield* notes.remove(existing.noteId);
    expect(yield* Queue.take(received)).toEqual({ _tag: "removed", noteId: existing.noteId });
  }).pipe(Effect.provide(TestLayer)),
);
