import { NoteId, type Note } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { applyNotesEvent, EMPTY_NOTES } from "./notes.ts";

function note(id: string, updatedAt: string, pinned = false): Note {
  return {
    noteId: NoteId.make(id),
    title: id,
    body: "",
    pinned,
    createdAt: "2026-09-30T08:00:00.000Z",
    updatedAt,
  };
}

describe("applyNotesEvent", () => {
  it("keeps pinned notes first, then the most recently edited", () => {
    const listed = applyNotesEvent(EMPTY_NOTES, {
      _tag: "snapshot",
      notes: [
        note("old", "2026-09-30T09:00:00.000Z"),
        note("new", "2026-09-30T11:00:00.000Z"),
        note("pinned", "2026-09-30T08:00:00.000Z", true),
      ],
    });
    expect(listed.map((entry) => entry.noteId)).toEqual(["pinned", "new", "old"]);

    const edited = applyNotesEvent(listed, {
      _tag: "upserted",
      note: { ...note("old", "2026-09-30T12:00:00.000Z"), body: "Edited" },
    });
    expect(edited.map((entry) => [entry.noteId, entry.body])).toEqual([
      ["pinned", ""],
      ["old", "Edited"],
      ["new", ""],
    ]);

    const removed = applyNotesEvent(edited, { _tag: "removed", noteId: NoteId.make("pinned") });
    expect(removed.map((entry) => entry.noteId)).toEqual(["old", "new"]);
  });
});
