import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { toastCommandFailure } from "../../lib/commandFailureToast";
import { readActiveEnvironmentId } from "../../state/activeEnvironment";
import { notesEnvironment } from "../../state/notes";
import { useAtomCommand } from "../../state/use-atom-command";

export const NEW_NOTE_TITLE = "Untitled";

/** Creates an empty note in the active environment and opens it. */
export function useCreateNote() {
  const navigate = useNavigate();
  const createNote = useAtomCommand(notesEnvironment.createNote);
  return useCallback(async () => {
    const environmentId = readActiveEnvironmentId();
    if (environmentId === null) return;
    const result = await createNote({ environmentId, input: { title: NEW_NOTE_TITLE } });
    if (toastCommandFailure("Could not create the note", result) || result._tag !== "Success") {
      return;
    }
    await navigate({
      to: "/notes/$noteId",
      params: { noteId: result.value.noteId },
      search: { focus: "title" },
    });
  }, [createNote, navigate]);
}
