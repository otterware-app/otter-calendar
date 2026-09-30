import {
  agentTurnWorkLabel,
  presentAgentTurns,
  type AgentTurnView,
} from "@t3tools/client-runtime/agent-steps";
import type { AgentThreadDetail } from "@t3tools/contracts";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { AgentErrorRow, AgentTurnBlocks } from "./AgentWorkLog";

/** Re-renders once a second while a turn runs; only this label repaints. */
function WorkingLabel({ turn }: { turn: AgentTurnView["turn"] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{agentTurnWorkLabel(turn, now)}</>;
}

function FoldRow({
  label,
  expanded,
  onToggle,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = expanded ? ChevronDownIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className="flex w-fit cursor-pointer items-center gap-1 rounded-md px-0.5 py-0.5 text-sm text-muted-foreground tabular-nums select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span>{label}</span>
      <Icon className="size-3.5 opacity-70" aria-hidden />
    </button>
  );
}

function AgentTurn({ view }: { view: AgentTurnView }) {
  const [expanded, setExpanded] = useState(false);
  const running = view.turn.status === "running";
  const showWork = view.work.length > 0 && (!view.foldable || expanded);
  return (
    <div className="flex flex-col gap-2">
      {view.prompt ? (
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-2xl bg-secondary px-3 py-2 text-sm whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
            {view.prompt.text}
          </p>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col">
        {view.foldable ? (
          <FoldRow
            label={agentTurnWorkLabel(view.turn)}
            expanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
          />
        ) : null}
        {showWork ? <AgentTurnBlocks blocks={view.work} /> : null}
        {view.answer.length > 0 ? <AgentTurnBlocks blocks={view.answer} /> : null}
        {running ? (
          <p className="px-0.5 py-1 text-sm text-muted-foreground tabular-nums">
            <WorkingLabel turn={view.turn} />
          </p>
        ) : null}
        {view.turn.status === "interrupted" ? (
          <p className="px-0.5 py-1 text-sm text-muted-foreground">Stopped.</p>
        ) : null}
        {view.error ? <AgentErrorRow message={view.error} /> : null}
      </div>
    </div>
  );
}

const STICK_TO_BOTTOM_THRESHOLD_PX = 48;

/** The conversation, scrolled to the latest turn unless the user scrolled up to read. */
export function AgentConversation({ detail }: { detail: AgentThreadDetail }) {
  const turns = useMemo(() => presentAgentTurns(detail), [detail]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);

  // Each new or growing turn scrolls into view, unless the user scrolled up.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || !stickToBottom.current || turns.length === 0) return;
    element.scrollTop = element.scrollHeight;
  }, [turns]);

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      onScroll={(event) => {
        const element = event.currentTarget;
        stickToBottom.current =
          element.scrollHeight - element.scrollTop - element.clientHeight <
          STICK_TO_BOTTOM_THRESHOLD_PX;
      }}
    >
      <div className="flex flex-col gap-5">
        {turns.map((view) => (
          <AgentTurn key={view.turn.turnId} view={view} />
        ))}
      </div>
    </div>
  );
}
