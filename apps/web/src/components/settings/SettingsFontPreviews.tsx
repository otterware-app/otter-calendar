// Small samples under the typography rows. They use the same appearance font tokens as the
// surfaces they stand for (the agent composer, markdown code blocks), so a choice shows as it
// will render.

const PROMPT_PREVIEW_TEXT =
  "Summarize my notes from this week and pin the one about the launch plan.";

/** Editable, so the family and size can be felt while typing. */
export function PromptFontPreview() {
  return (
    <textarea
      aria-label="Prompt font preview"
      defaultValue={PROMPT_PREVIEW_TEXT}
      rows={2}
      className="mt-1 mb-2 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 font-(family-name:--font-composer,var(--font-sans)) text-(length:--font-size-prompt,var(--text-sm)) text-foreground outline-none"
    />
  );
}

const CODE_PREVIEW = [
  "export function formatNote(note: Note) {",
  "  return `${note.title} (${note.updatedAt})`; // 0O 1lI",
  "}",
].join("\n");

export function CodeFontPreview() {
  return (
    <pre className="mt-1 mb-2 overflow-x-auto rounded-lg bg-secondary px-3 py-2 font-mono text-(length:--font-size-code,var(--text-xs)) text-foreground dark:bg-input/32">
      {CODE_PREVIEW}
    </pre>
  );
}
