/**
 * The agent's tools for the Notes example. Each one calls `NotesService`, the same service the
 * RPC handlers call, so an agent's change reaches every client like a click does.
 */
import {
  IsoDateTime,
  Note,
  NoteCreateInput,
  NoteId,
  NoteRefInput,
  NotesError,
  NoteUpdateInput,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

/** How much of a body `notes_list` shows; `notes_get` returns the whole note. */
export const NOTE_EXCERPT_LENGTH = 200;

const NoteListEntry = Schema.Struct({
  noteId: NoteId,
  title: Schema.String,
  pinned: Schema.Boolean,
  updatedAt: IsoDateTime,
  excerpt: Schema.String,
});

const NotesListTool = Tool.make("notes_list", {
  description: `List the user's notes, pinned first, then the most recently updated. Each entry has the first ${NOTE_EXCERPT_LENGTH} characters of the body as an excerpt; read a whole note with notes_get. Pass query to keep only notes whose title or body contains it (case-insensitive).`,
  parameters: Schema.Struct({ query: Schema.optional(Schema.String) }),
  success: Schema.Struct({ notes: Schema.Array(NoteListEntry) }),
  failure: NotesError,
})
  .annotate(Tool.Title, "List notes")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const NotesGetTool = Tool.make("notes_get", {
  description: "Read one note, with its whole body.",
  parameters: NoteRefInput,
  success: Note,
  failure: NotesError,
})
  .annotate(Tool.Title, "Read note")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const NotesCreateTool = Tool.make("notes_create", {
  description:
    "Create a note. The body is plain text (Markdown is fine). Pinned notes stay at the top of the list.",
  parameters: NoteCreateInput,
  success: Note,
  failure: NotesError,
})
  .annotate(Tool.Title, "Create note")
  .annotate(Tool.Destructive, false)
  .annotate(Tool.OpenWorld, false);

const NotesUpdateTool = Tool.make("notes_update", {
  description:
    "Change a note's title, body, or pinned state. Omitted fields keep their value; a body replaces the whole body, so read the note first when editing part of it.",
  parameters: NoteUpdateInput,
  success: Note,
  failure: NotesError,
})
  .annotate(Tool.Title, "Update note")
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const NotesDeleteTool = Tool.make("notes_delete", {
  description:
    "Delete a note for good. There is no undo, so only delete a note the user asked you to delete.",
  parameters: NoteRefInput,
  success: Schema.Struct({ deleted: NoteId }),
  failure: NotesError,
})
  .annotate(Tool.Title, "Delete note")
  .annotate(Tool.OpenWorld, false);

export const NotesToolkit = Toolkit.make(
  NotesListTool,
  NotesGetTool,
  NotesCreateTool,
  NotesUpdateTool,
  NotesDeleteTool,
);
