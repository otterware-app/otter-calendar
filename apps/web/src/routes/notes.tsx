import { Outlet, createFileRoute, redirect, useParams } from "@tanstack/react-router";

import { AppPage, NoEnvironmentState } from "../components/AppPage";
import { NotesList } from "../components/notes/NotesList";
import { useActiveEnvironmentId } from "../state/activeEnvironment";
import { useNotes } from "../state/notes";

function NotesRouteLayout() {
  const environmentId = useActiveEnvironmentId();
  const { notes, isLoading } = useNotes(environmentId);
  const selectedNoteId = useParams({ strict: false, select: (params) => params.noteId ?? null });
  return (
    <AppPage title="Notes">
      {environmentId === null ? (
        <NoEnvironmentState />
      ) : (
        <>
          <div className="flex w-72 shrink-0 flex-col border-e border-border pt-1 max-md:hidden">
            <NotesList notes={notes} selectedNoteId={selectedNoteId} isLoading={isLoading} />
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <Outlet />
          </div>
        </>
      )}
    </AppPage>
  );
}

export const Route = createFileRoute("/notes")({
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: NotesRouteLayout,
});
