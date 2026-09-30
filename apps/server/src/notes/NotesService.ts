/**
 * NotesService - the scaffold's example feature: notes stored in SQLite, changed through RPC
 * and through the agent's MCP tools, and streamed to every connected client.
 *
 * Replace it with the app's own domain; keep the shape: one service owns the data, RPC handlers
 * and MCP tools both call it, and subscribers get a snapshot followed by changes.
 *
 * @module NotesService
 */
import type {
  Note,
  NoteCreateInput,
  NoteId,
  NotesError,
  NotesEvent,
  NoteUpdateInput,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";

export interface NotesServiceShape {
  readonly list: Effect.Effect<ReadonlyArray<Note>, NotesError>;
  readonly get: (noteId: NoteId) => Effect.Effect<Note, NotesError>;
  readonly create: (input: NoteCreateInput) => Effect.Effect<Note, NotesError>;
  readonly update: (input: NoteUpdateInput) => Effect.Effect<Note, NotesError>;
  readonly remove: (noteId: NoteId) => Effect.Effect<void, NotesError>;
  /** A snapshot of every note, then changes. */
  readonly stream: Stream.Stream<NotesEvent, NotesError>;
}

export class NotesService extends Context.Service<NotesService, NotesServiceShape>()(
  "t3/notes/NotesService",
) {}
