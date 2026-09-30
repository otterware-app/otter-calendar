/**
 * Notes: the scaffold's example feature. It shows one vertical slice end to end: a server
 * service with SQLite persistence, RPC methods and a live subscription, MCP tools the agent
 * can call, and web and mobile screens. Replace it with the app's own domain.
 */
import * as Schema from "effect/Schema";

import { IsoDateTime, TrimmedNonEmptyString, makeEntityId } from "./baseSchemas.ts";

export const NoteId = makeEntityId("NoteId");
export type NoteId = typeof NoteId.Type;

export const Note = Schema.Struct({
  noteId: NoteId,
  title: Schema.String,
  body: Schema.String,
  pinned: Schema.Boolean,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Note = typeof Note.Type;

export const NotesEvent = Schema.Union([
  Schema.TaggedStruct("snapshot", { notes: Schema.Array(Note) }),
  Schema.TaggedStruct("upserted", { note: Note }),
  Schema.TaggedStruct("removed", { noteId: NoteId }),
]);
export type NotesEvent = typeof NotesEvent.Type;

export const NoteCreateInput = Schema.Struct({
  title: TrimmedNonEmptyString,
  body: Schema.optional(Schema.String),
  pinned: Schema.optional(Schema.Boolean),
});
export type NoteCreateInput = typeof NoteCreateInput.Type;

export const NoteUpdateInput = Schema.Struct({
  noteId: NoteId,
  title: Schema.optional(TrimmedNonEmptyString),
  body: Schema.optional(Schema.String),
  pinned: Schema.optional(Schema.Boolean),
});
export type NoteUpdateInput = typeof NoteUpdateInput.Type;

export const NoteRefInput = Schema.Struct({ noteId: NoteId });
export type NoteRefInput = typeof NoteRefInput.Type;

export class NotesError extends Schema.TaggedError<NotesError>()("NotesError", {
  code: Schema.Literals(["not_found", "failed"]),
  detail: Schema.String,
}) {
  override get message(): string {
    return this.detail;
  }
}
