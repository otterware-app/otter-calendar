import { NoteId } from "@t3tools/contracts";
import { Link, createFileRoute } from "@tanstack/react-router";

import { NoteEditor } from "../components/notes/NoteEditor";
import { Button } from "../components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../components/ui/empty";
import { useActiveEnvironmentId } from "../state/activeEnvironment";
import { useNotes } from "../state/notes";

function NoteRoute() {
  const { noteId } = Route.useParams();
  const { focus } = Route.useSearch();
  const environmentId = useActiveEnvironmentId();
  const { notes, isLoading } = useNotes(environmentId);
  const note = notes.find((candidate) => candidate.noteId === noteId);
  if (environmentId === null) return null;
  if (!note) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyTitle>{isLoading ? "Loading…" : "This note is gone"}</EmptyTitle>
          {isLoading ? null : (
            <>
              <EmptyDescription>
                It was deleted, or it lives in another environment.
              </EmptyDescription>
              <div className="mt-5 flex justify-center">
                <Button size="sm" variant="outline" render={<Link to="/notes" />}>
                  All notes
                </Button>
              </div>
            </>
          )}
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <NoteEditor
      key={note.noteId}
      environmentId={environmentId}
      note={note}
      autoFocusTitle={focus === "title"}
    />
  );
}

export const Route = createFileRoute("/notes/$noteId")({
  params: {
    parse: (params) => ({ noteId: NoteId.make(params.noteId) }),
    stringify: (params) => ({ noteId: params.noteId }),
  },
  validateSearch: (search: Record<string, unknown>): { focus?: "title" } =>
    search.focus === "title" ? { focus: "title" } : {},
  component: NoteRoute,
});
