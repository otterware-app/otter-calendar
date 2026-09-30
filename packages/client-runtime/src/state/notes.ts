/**
 * Notes, the scaffold's example feature, per environment: a live list (a snapshot, then
 * changes) and the commands that change it. Replace it with the app's own domain.
 */
import { type Note, type NotesEvent, WS_METHODS } from "@t3tools/contracts";
import * as Stream from "effect/Stream";
import type { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

export const EMPTY_NOTES: ReadonlyArray<Note> = [];

/** Pinned notes first, then the most recently edited; ties keep a stable order by id. */
function compareNotes(left: Note, right: Note): number {
  if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
  if (left.updatedAt !== right.updatedAt) return left.updatedAt < right.updatedAt ? 1 : -1;
  return left.noteId < right.noteId ? -1 : left.noteId > right.noteId ? 1 : 0;
}

export function applyNotesEvent(
  current: ReadonlyArray<Note>,
  event: NotesEvent,
): ReadonlyArray<Note> {
  switch (event._tag) {
    case "snapshot":
      return [...event.notes].sort(compareNotes);
    case "upserted":
      return [...current.filter((note) => note.noteId !== event.note.noteId), event.note].sort(
        compareNotes,
      );
    case "removed":
      return current.filter((note) => note.noteId !== event.noteId);
  }
}

export function createNotesEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    /** Every note, pinned first, then the most recently edited. */
    notes: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:notes:list",
      tag: WS_METHODS.notesSubscribe,
      transform: (stream) =>
        stream.pipe(
          Stream.mapAccum(
            () => EMPTY_NOTES,
            (current, event) => {
              const next = applyNotesEvent(current, event);
              return [next, [next]] as const;
            },
          ),
        ),
    }),
    createNote: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:notes:create",
      tag: WS_METHODS.notesCreate,
    }),
    /** Edits to one note run in order, so a slow save never lands after a newer one. */
    updateNote: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:notes:update",
      tag: WS_METHODS.notesUpdate,
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) => JSON.stringify([environmentId, input.noteId]),
      },
    }),
    deleteNote: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:notes:delete",
      tag: WS_METHODS.notesDelete,
    }),
  };
}
