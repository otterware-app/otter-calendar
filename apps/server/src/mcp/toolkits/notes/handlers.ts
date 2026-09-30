import * as Effect from "effect/Effect";

import { NotesService } from "../../../notes/NotesService.ts";
import { NOTE_EXCERPT_LENGTH, NotesToolkit } from "./tools.ts";

export const NotesHandlersLive = NotesToolkit.toLayer(
  Effect.gen(function* () {
    const notes = yield* NotesService;
    return {
      notes_list: ({ query }) =>
        notes.list.pipe(
          Effect.map((all) => {
            const needle = query?.trim().toLowerCase() ?? "";
            const matching =
              needle === ""
                ? all
                : all.filter(
                    (note) =>
                      note.title.toLowerCase().includes(needle) ||
                      note.body.toLowerCase().includes(needle),
                  );
            return {
              notes: matching.map((note) => ({
                noteId: note.noteId,
                title: note.title,
                pinned: note.pinned,
                updatedAt: note.updatedAt,
                excerpt: note.body.slice(0, NOTE_EXCERPT_LENGTH),
              })),
            };
          }),
        ),
      notes_get: ({ noteId }) => notes.get(noteId),
      notes_create: (input) => notes.create(input),
      notes_update: (input) => notes.update(input),
      notes_delete: ({ noteId }) => notes.remove(noteId).pipe(Effect.as({ deleted: noteId })),
    };
  }),
);
