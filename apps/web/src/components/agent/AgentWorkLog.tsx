/**
 * What the agent did during a turn: its commentary and one-line steps in order, an
 * integration's consecutive steps grouped ("Used Otter Scaffold"), each step opening to its
 * input and result. The shared presentation (`@t3tools/client-runtime/agent-steps`) decides
 * what the steps say; this only draws them.
 */
import type { AgentStep, AgentTurnBlock } from "@t3tools/client-runtime/agent-steps";
import {
  BotIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CommandIcon,
  FilePenLineIcon,
  FileTextIcon,
  GlobeIcon,
  MessageSquareIcon,
  SearchIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react";
import { useState } from "react";

import { cn } from "../../lib/utils";
import ChatMarkdown from "../ChatMarkdown";

const STEP_ICONS: Record<AgentStep["kind"], typeof WrenchIcon> = {
  command: TerminalIcon,
  read: FileTextIcon,
  edit: FilePenLineIcon,
  search: SearchIcon,
  web: GlobeIcon,
  tool: WrenchIcon,
  agent: BotIcon,
};

/** An integration's steps wear its mark; the others, what they do. */
const stepIcon = (step: AgentStep) => (step.source ? CommandIcon : STEP_ICONS[step.kind]);

function RowHead({
  icon: Icon,
  title,
  open,
  expandable,
  running,
  failed,
  onToggle,
}: {
  icon: typeof WrenchIcon;
  title: string;
  open: boolean;
  expandable: boolean;
  running: boolean;
  failed?: boolean;
  onToggle: () => void;
}) {
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      disabled={!expandable}
      aria-expanded={expandable ? open : undefined}
      onClick={onToggle}
      className={cn(
        "group/step flex max-w-full min-w-0 items-center gap-1.5 self-start rounded-md px-0.5 py-0.5 text-left select-none",
        expandable
          ? "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          : "cursor-default",
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span
        className={cn(
          "min-w-0 truncate text-sm leading-relaxed text-muted-foreground",
          expandable && "group-hover/step:text-foreground",
          open && "text-foreground",
          running && "italic",
          failed && "text-destructive",
        )}
      >
        {title}
      </span>
      {expandable ? (
        <Chevron
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground",
            !open && "opacity-0 group-hover/step:opacity-70",
          )}
          aria-hidden
        />
      ) : null}
    </button>
  );
}

function prettyJson(text: string | undefined): string | null {
  if (!text || !/^\s*[[{]/.test(text)) return null;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

function StepResult({ step }: { step: AgentStep }) {
  const detail = prettyJson(step.detail) ?? step.detail;
  const output = prettyJson(step.output) ?? step.output;
  return (
    <div className="mt-1 mb-2 ms-6 flex min-w-0 flex-col overflow-hidden rounded-lg bg-secondary text-xs dark:bg-input/32">
      {detail && detail !== output ? (
        <pre className="max-h-24 overflow-auto border-b border-border/40 px-3 py-2 font-mono break-all whitespace-pre-wrap text-muted-foreground select-text">
          {detail}
        </pre>
      ) : null}
      {output !== undefined ? (
        <pre className="max-h-72 overflow-auto px-3 py-2 font-mono break-words whitespace-pre-wrap text-foreground select-text">
          {output}
        </pre>
      ) : (
        <p className="px-3 py-2 text-muted-foreground">
          {step.status === "running" ? "Running…" : "No output."}
        </p>
      )}
    </div>
  );
}

function StepRow({ step }: { step: AgentStep }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col">
      <RowHead
        icon={stepIcon(step)}
        title={step.title}
        open={open}
        expandable={Boolean(step.output || step.detail)}
        running={step.status === "running"}
        failed={step.status === "failed"}
        onToggle={() => setOpen((value) => !value)}
      />
      {open ? <StepResult step={step} /> : null}
    </div>
  );
}

function StepGroup({ source, steps }: { source: string; steps: ReadonlyArray<AgentStep> }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex flex-col">
      <RowHead
        icon={CommandIcon}
        title={`Used ${source}`}
        open={open}
        expandable
        running={steps.some((step) => step.status === "running")}
        onToggle={() => setOpen((value) => !value)}
      />
      {open ? (
        <div className="ms-3 flex flex-col border-s border-border/60 ps-2">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AgentTurnBlocks({ blocks }: { blocks: ReadonlyArray<AgentTurnBlock> }) {
  return (
    <div className="flex flex-col gap-0.5">
      {blocks.map((block) => {
        switch (block.type) {
          case "text":
            return (
              <div key={block.id} className="min-w-0 py-1">
                <ChatMarkdown text={block.text} isStreaming={block.streaming} />
              </div>
            );
          case "user":
            return (
              <div key={block.id} className="flex items-start gap-1.5 py-1 text-sm">
                <MessageSquareIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                <p className="min-w-0 whitespace-pre-wrap text-foreground">{block.text}</p>
              </div>
            );
          case "step":
            return <StepRow key={block.step.id} step={block.step} />;
          case "group":
            return <StepGroup key={block.id} source={block.source} steps={block.steps} />;
          case "error":
            return <AgentErrorRow key={block.id} message={block.message} />;
        }
      })}
    </div>
  );
}

export function AgentErrorRow({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-1.5 py-1 text-sm">
      <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      <p className="min-w-0 whitespace-pre-wrap text-destructive">{message}</p>
    </div>
  );
}
