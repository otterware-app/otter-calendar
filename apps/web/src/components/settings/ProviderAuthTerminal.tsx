import type { ProviderAuthResponse } from "@t3tools/contracts";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { ensureLocalApi } from "../../localApi";
import { Button } from "../ui/button";

const ANSI_PATTERN =
  // oxlint-disable-next-line no-control-regex -- terminal escape sequences are control characters
  /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;

/** Terminal output as plain text: escape sequences dropped, carriage returns resolved per line. */
function plainTerminalText(output: string): string {
  return output
    .replace(ANSI_PATTERN, "")
    .split("\n")
    .map((line) => line.split("\r").findLast((segment) => segment.length > 0) ?? "")
    .join("\n");
}

const KEYS: ReadonlyArray<{ readonly label: string; readonly data: string }> = [
  { label: "↑", data: "\u001b[A" },
  { label: "↓", data: "\u001b[B" },
  { label: "Enter", data: "\r" },
  { label: "Esc", data: "\u001b" },
];

/**
 * An interactive provider login (such as `claude /login`) shown as text, with a line input
 * and the few keys those prompts need. Loaded only for an interactive login; PTY input is
 * serialized by the parent.
 */
export default function ProviderAuthTerminal({
  output,
  onResponse,
}: {
  readonly output: string;
  readonly outputOffset?: number | undefined;
  readonly onResponse: (response: Extract<ProviderAuthResponse, { type: "terminal" }>) => void;
}) {
  const [line, setLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const outputRef = useRef<HTMLPreElement | null>(null);
  const text = plainTerminalText(output);

  // The prompt lays itself out for a terminal size; announce a roomy one once.
  const announcedSize = useRef(false);
  useEffect(() => {
    if (announcedSize.current) return;
    announcedSize.current = true;
    onResponse({ type: "terminal", data: "", size: { cols: 100, rows: 30 } });
  }, [onResponse]);

  useLayoutEffect(() => {
    const element = outputRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [text]);

  const parts: Array<string | { url: string }> = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    parts.push({ url: match[0] });
    last = index + match[0].length;
  }
  parts.push(text.slice(last));

  return (
    <div className="flex flex-col gap-2">
      <pre
        ref={outputRef}
        aria-label="Provider sign-in output"
        className="h-56 overflow-auto rounded-md border border-border bg-secondary px-3 py-2 font-mono text-xs break-words whitespace-pre-wrap text-foreground dark:bg-input/32"
      >
        {parts.map((part, index) =>
          typeof part === "string" ? (
            part
          ) : (
            <a
              key={index}
              href={part.url}
              className="underline"
              onClick={(event) => {
                event.preventDefault();
                void ensureLocalApi()
                  .shell.openExternal(part.url)
                  .catch(() => setError("Could not open the provider link."));
              }}
            >
              {part.url}
            </a>
          ),
        )}
      </pre>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          onResponse({ type: "terminal", data: `${line}\r` });
          setLine("");
        }}
      >
        <input
          aria-label="Send to the sign-in prompt"
          className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-xs outline-none focus-visible:border-ring"
          placeholder="Type a reply or paste a code, then Enter"
          value={line}
          onChange={(event) => setLine(event.target.value)}
        />
        {KEYS.map((key) => (
          <Button
            key={key.label}
            type="button"
            size="xs"
            variant="outline"
            onClick={() => onResponse({ type: "terminal", data: key.data })}
          >
            {key.label}
          </Button>
        ))}
      </form>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
