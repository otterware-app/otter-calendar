/**
 * NotesServiceLive - notes in SQLite, streamed to every subscriber.
 *
 * Writes are serialized and publish while they hold the lock, and a new subscription reads its
 * snapshot under the same lock, so a subscriber never sees a change older than its snapshot.
 *
 * @module NotesServiceLive
 */
import { Note, NoteId, NotesError, type NotesEvent } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { NotesService, type NotesServiceShape } from "./NotesService.ts";

const NoteRow = Schema.Struct({ ...Note.fields, pinned: Schema.BooleanFromBit });
const decodeRows = Schema.decodeUnknownEffect(Schema.Array(NoteRow));

const notFound = () => new NotesError({ code: "not_found", detail: "That note does not exist." });

/** Logs the cause and answers with a failure the client can show. */
const failedTo =
  (action: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, NotesError, R> =>
    effect.pipe(
      Effect.tapCause((cause) => Effect.logError(`Could not ${action}.`, Cause.pretty(cause))),
      Effect.mapError(() => new NotesError({ code: "failed", detail: `Could not ${action}.` })),
    );

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const crypto = yield* Crypto.Crypto;
  const changes = yield* PubSub.unbounded<NotesEvent>();
  const writes = yield* Semaphore.make(1);

  const columns = sql`
    note_id AS "noteId", title, body, pinned, created_at AS "createdAt", updated_at AS "updatedAt"
  `;

  const listNotes = sql`
    SELECT ${columns} FROM notes ORDER BY pinned DESC, updated_at DESC, note_id
  `.pipe(Effect.flatMap(decodeRows));

  const list: NotesServiceShape["list"] = listNotes.pipe(failedTo("load the notes"));

  const get: NotesServiceShape["get"] = (noteId) =>
    sql`SELECT ${columns} FROM notes WHERE note_id = ${noteId}`.pipe(
      Effect.flatMap(decodeRows),
      failedTo("load the note"),
      Effect.flatMap(([note]) =>
        note === undefined ? Effect.fail(notFound()) : Effect.succeed(note),
      ),
    );

  const create: NotesServiceShape["create"] = Effect.fn("NotesService.create")(function* (input) {
    const now = DateTime.formatIso(yield* DateTime.now);
    const note: Note = {
      noteId: NoteId.make(yield* crypto.randomUUIDv4.pipe(Effect.orDie)),
      title: input.title,
      body: input.body ?? "",
      pinned: input.pinned ?? false,
      createdAt: now,
      updatedAt: now,
    };
    yield* sql`
        INSERT INTO notes (note_id, title, body, pinned, created_at, updated_at)
        VALUES (${note.noteId}, ${note.title}, ${note.body}, ${note.pinned ? 1 : 0}, ${now}, ${now})
      `.pipe(failedTo("save the note"));
    yield* PubSub.publish(changes, { _tag: "upserted", note });
    return note;
  }, writes.withPermits(1));

  const update: NotesServiceShape["update"] = Effect.fn("NotesService.update")(function* (input) {
    const now = DateTime.formatIso(yield* DateTime.now);
    const pinned = input.pinned === undefined ? null : input.pinned ? 1 : 0;
    const [note] = yield* sql`
        UPDATE notes SET
          title = COALESCE(${input.title ?? null}, title),
          body = COALESCE(${input.body ?? null}, body),
          pinned = COALESCE(${pinned}, pinned),
          updated_at = ${now}
        WHERE note_id = ${input.noteId}
        RETURNING ${columns}
      `.pipe(Effect.flatMap(decodeRows), failedTo("save the note"));
    if (note === undefined) return yield* notFound();
    yield* PubSub.publish(changes, { _tag: "upserted", note });
    return note;
  }, writes.withPermits(1));

  const remove: NotesServiceShape["remove"] = Effect.fn("NotesService.remove")(function* (noteId) {
    const deleted = yield* sql`DELETE FROM notes WHERE note_id = ${noteId} RETURNING note_id`.pipe(
      failedTo("delete the note"),
    );
    if (deleted.length === 0) return yield* notFound();
    yield* PubSub.publish(changes, { _tag: "removed", noteId });
  }, writes.withPermits(1));

  const stream: NotesServiceShape["stream"] = Stream.unwrap(
    Effect.gen(function* () {
      const subscription = yield* PubSub.subscribe(changes);
      const notes = yield* list;
      const snapshot: NotesEvent = { _tag: "snapshot", notes };
      return Stream.concat(Stream.make(snapshot), Stream.fromSubscription(subscription));
    }).pipe(writes.withPermits(1)),
  );

  return NotesService.of({ list, get, create, update, remove, stream });
});

export const layer = Layer.effect(NotesService, make);
