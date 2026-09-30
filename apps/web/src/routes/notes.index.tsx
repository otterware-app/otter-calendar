import { useAtomValue } from "@effect/atom-react";
import { createFileRoute } from "@tanstack/react-router";
import { NotebookPenIcon, PlusIcon } from "lucide-react";

import { useCreateNote } from "../components/notes/useCreateNote";
import { NotesList } from "../components/notes/NotesList";
import { Button } from "../components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../components/ui/empty";
import { shortcutLabelForCommand } from "../keybindings";
import { useActiveEnvironmentId } from "../state/activeEnvironment";
import { useNotes } from "../state/notes";
import { primaryServerKeybindingsAtom } from "../state/server";

function NotesIndexRoute() {
  const createNote = useCreateNote();
  const environmentId = useActiveEnvironmentId();
  const { notes, isLoading } = useNotes(environmentId);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const shortcut = shortcutLabelForCommand(keybindings, "notes.new");
  return (
    <>
      {/* Narrow windows have no list column, so the list takes the page. */}
      <div className="flex min-h-0 flex-1 flex-col pt-1 md:hidden">
        <NotesList notes={notes} selectedNoteId={null} isLoading={isLoading} />
      </div>
      <Empty className="flex-1 max-md:hidden">
        <EmptyHeader>
          <NotebookPenIcon className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden />
          <EmptyTitle>{notes.length === 0 ? "No notes yet" : "Pick a note"}</EmptyTitle>
          <EmptyDescription>Write things down, or ask the agent to do it for you.</EmptyDescription>
          <div className="mt-5 flex justify-center">
            <Button size="sm" onClick={() => void createNote()}>
              <PlusIcon />
              New note{shortcut ? ` (${shortcut})` : ""}
            </Button>
          </div>
        </EmptyHeader>
      </Empty>
    </>
  );
}

export const Route = createFileRoute("/notes/")({
  component: NotesIndexRoute,
});
