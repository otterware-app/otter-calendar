import { useAtomValue } from "@effect/atom-react";
import { EMPTY_NOTES, createNotesEnvironmentAtoms } from "@t3tools/client-runtime/state/notes";
import type { EnvironmentId, Note } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";

export const notesEnvironment = createNotesEnvironmentAtoms(connectionAtomRuntime);

const EMPTY_NOTES_ATOM = Atom.make(AsyncResult.success<ReadonlyArray<Note>>(EMPTY_NOTES)).pipe(
  Atom.withLabel("web-notes:empty"),
);

/** The environment's notes, pinned first, then the most recently edited. */
export function useNotes(environmentId: EnvironmentId | null) {
  const result = useAtomValue(
    environmentId === null
      ? EMPTY_NOTES_ATOM
      : notesEnvironment.notes({ environmentId, input: {} }),
  );
  return {
    notes: Option.getOrElse(AsyncResult.value(result), () => EMPTY_NOTES),
    isLoading: result._tag === "Initial",
    hasError: result._tag === "Failure",
  };
}
