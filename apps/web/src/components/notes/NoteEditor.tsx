import type { EnvironmentId, Note } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { PinIcon, PinOffIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAgentPageContext } from "../../agentPanelStore";
import { useClientSettings } from "../../hooks/useSettings";
import { ensureLocalApi } from "../../localApi";
import { toastCommandFailure } from "../../lib/commandFailureToast";
import { notesEnvironment } from "../../state/notes";
import { useAtomCommand } from "../../state/use-atom-command";
import { formatTimestamp } from "../../timestampFormat";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { NEW_NOTE_TITLE } from "./useCreateNote";

const SAVE_DELAY_MS = 600;

interface NotePatch {
  title?: string;
  body?: string;
}

/**
 * Edits one note, saving a moment after typing stops and when leaving it. Changes made
 * elsewhere (another client, the agent) show up live while nothing local is unsaved.
 */
export function NoteEditor({
  environmentId,
  note,
  autoFocusTitle,
}: {
  environmentId: EnvironmentId;
  note: Note;
  autoFocusTitle: boolean;
}) {
  const navigate = useNavigate();
  const updateNote = useAtomCommand(notesEnvironment.updateNote);
  const deleteNote = useAtomCommand(notesEnvironment.deleteNote);
  const timestampFormat = useClientSettings((settings) => settings.timestampFormat);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const pending = useRef<NotePatch | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  useAgentPageContext(`Open note: ${note.noteId} ${JSON.stringify(note.title)}`);

  useEffect(() => {
    if (pending.current !== null) return;
    setTitle(note.title);
    setBody(note.body);
  }, [note.title, note.body]);

  // The editor is keyed by note, so this runs once per opened note.
  useEffect(() => {
    if (autoFocusTitle) titleRef.current?.select();
  }, [autoFocusTitle]);

  const flush = useCallback(async () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    if (patch === null) return;
    pending.current = null;
    const result = await updateNote({ environmentId, input: { noteId: note.noteId, ...patch } });
    toastCommandFailure("Could not save the note", result);
  }, [environmentId, note.noteId, updateNote]);

  // Leaving the note (or the page) saves what is left.
  useEffect(() => () => void flush(), [flush]);

  const schedule = (patch: NotePatch) => {
    pending.current = { ...pending.current, ...patch };
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  };

  const togglePin = async () => {
    const result = await updateNote({
      environmentId,
      input: { noteId: note.noteId, pinned: !note.pinned },
    });
    toastCommandFailure(
      note.pinned ? "Could not unpin the note" : "Could not pin the note",
      result,
    );
  };

  const remove = async () => {
    const confirmed = await ensureLocalApi().dialogs.confirm(`Delete the note "${note.title}"?`, {
      variant: "destructive",
    });
    if (!confirmed) return;
    pending.current = null;
    const result = await deleteNote({ environmentId, input: { noteId: note.noteId } });
    if (!toastCommandFailure("Could not delete the note", result)) {
      await navigate({ to: "/notes" });
    }
  };

  return (
    <article className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 px-6 pt-2">
        <span className="text-xs text-muted-foreground">
          Edited {formatTimestamp(note.updatedAt, timestampFormat)}
        </span>
        <div className="ms-auto flex items-center">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost-muted"
                  aria-label={note.pinned ? "Unpin" : "Pin"}
                  aria-pressed={note.pinned}
                  onClick={() => void togglePin()}
                />
              }
            >
              {note.pinned ? <PinOffIcon /> : <PinIcon />}
            </TooltipTrigger>
            <TooltipPopup side="bottom">{note.pinned ? "Unpin" : "Pin to top"}</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost-destructive"
                  aria-label="Delete note"
                  onClick={() => void remove()}
                />
              }
            >
              <Trash2Icon />
            </TooltipTrigger>
            <TooltipPopup side="bottom">Delete</TooltipPopup>
          </Tooltip>
        </div>
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 px-6 pt-2 pb-8">
        <input
          ref={titleRef}
          value={title}
          aria-label="Title"
          placeholder={NEW_NOTE_TITLE}
          className="w-full bg-transparent text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground"
          onChange={(event) => {
            setTitle(event.target.value);
            if (event.target.value.trim()) schedule({ title: event.target.value.trim() });
          }}
          onBlur={() => {
            if (!title.trim()) {
              setTitle(NEW_NOTE_TITLE);
              schedule({ title: NEW_NOTE_TITLE });
            }
            void flush();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.parentElement?.querySelector("textarea")?.focus();
            }
          }}
        />
        <textarea
          value={body}
          aria-label="Note"
          placeholder="Write something…"
          className="min-h-0 w-full flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
          onChange={(event) => {
            setBody(event.target.value);
            schedule({ body: event.target.value });
          }}
          onBlur={() => void flush()}
        />
      </div>
    </article>
  );
}
