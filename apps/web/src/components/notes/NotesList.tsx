import type { Note, NoteId } from "@t3tools/contracts";
import { Link, useNavigate } from "@tanstack/react-router";
import { PinIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { useClientSettings } from "../../hooks/useSettings";
import { cn, normalizeSearchText } from "../../lib/utils";
import { formatShortTimestamp } from "../../timestampFormat";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useCreateNote } from "./useCreateNote";

function snippet(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Notes, pinned first, filterable; arrow keys move through the list. */
export function NotesList({
  notes,
  selectedNoteId,
  isLoading,
}: {
  notes: ReadonlyArray<Note>;
  selectedNoteId: NoteId | null;
  isLoading: boolean;
}) {
  const navigate = useNavigate();
  const createNote = useCreateNote();
  const timestampFormat = useClientSettings((settings) => settings.timestampFormat);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLUListElement | null>(null);
  const visible = useMemo(() => {
    const needle = normalizeSearchText(query);
    return needle.length === 0
      ? notes
      : notes.filter((note) => normalizeSearchText(`${note.title} ${note.body}`).includes(needle));
  }, [notes, query]);

  const move = (delta: number) => {
    if (visible.length === 0) return;
    const index = visible.findIndex((note) => note.noteId === selectedNoteId);
    const next = visible[Math.min(visible.length - 1, Math.max(0, index + delta))] ?? visible[0];
    if (!next) return;
    void navigate({ to: "/notes/$noteId", params: { noteId: next.noteId } });
    listRef.current
      ?.querySelector<HTMLElement>(`[data-note-id="${CSS.escape(next.noteId)}"]`)
      ?.focus();
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 pb-2">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-sm focus-within:border-ring dark:bg-input/32">
          <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            placeholder="Search notes"
            aria-label="Search notes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                move(selectedNoteId === null ? 0 : 1);
              }
            }}
          />
        </label>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="New note"
                onClick={() => void createNote()}
              />
            }
          >
            <PlusIcon />
          </TooltipTrigger>
          <TooltipPopup side="bottom">New note</TooltipPopup>
        </Tooltip>
      </div>
      {visible.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {isLoading ? "Loading notes…" : query ? "No notes match." : "No notes yet."}
        </p>
      ) : (
        <ul
          ref={listRef}
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3"
          aria-label="Notes"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              move(event.key === "ArrowDown" ? 1 : -1);
            }
          }}
        >
          {visible.map((note) => {
            const selected = note.noteId === selectedNoteId;
            return (
              <li key={note.noteId}>
                <Link
                  to="/notes/$noteId"
                  params={{ noteId: note.noteId }}
                  data-note-id={note.noteId}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-lg px-2.5 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {note.pinned ? (
                      <PinIcon
                        className="size-3 shrink-0 text-muted-foreground"
                        aria-label="Pinned"
                      />
                    ) : null}
                    <span className="min-w-0 truncate text-sm font-medium text-foreground">
                      {note.title}
                    </span>
                    <span className="ms-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatShortTimestamp(note.updatedAt, timestampFormat)}
                    </span>
                  </span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {snippet(note.body) || "No text"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
