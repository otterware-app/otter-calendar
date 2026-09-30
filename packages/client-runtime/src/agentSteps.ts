/**
 * How an agent conversation reads in every client: each turn is the user's prompt, then what
 * the agent did as one-line steps ("Ran `ls`", "Read plan.md", "Created event"), then its answer.
 * Steps from one integration that follow each other form a group, and once a turn finishes,
 * everything before the answer folds behind "Worked for 12s".
 *
 * Providers describe tool calls differently (Claude's tool_use names, Codex's thread items); the
 * adapters normalize them into turn items, and this module turns those items into steps, so web
 * and mobile render the same thing.
 */
import type {
  AgentThreadDetail,
  AgentTurn,
  OrchestrationV2RuntimeRequest,
  OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import { BRAND } from "@t3tools/shared/brand";

export type AgentStepKind = "command" | "read" | "edit" | "search" | "web" | "tool" | "agent";

export type AgentStepStatus = "running" | "completed" | "failed";

export interface AgentStep {
  /** The turn item the step comes from. */
  readonly id: string;
  readonly kind: AgentStepKind;
  /** What it did, in words: "Created event", "Ran `git status`", "Read plan.md". */
  readonly title: string;
  /** The integration (MCP server) it used: the app itself, or another server by name. */
  readonly source?: string;
  /** Its input: the command, the path, or the arguments as JSON. */
  readonly detail?: string;
  /** The start of what came back. */
  readonly output?: string;
  readonly status: AgentStepStatus;
}

export type AgentTurnBlock =
  | {
      readonly type: "text";
      readonly id: string;
      readonly text: string;
      readonly streaming: boolean;
    }
  /** A message the user sent while the turn was running. */
  | { readonly type: "user"; readonly id: string; readonly text: string }
  | { readonly type: "step"; readonly step: AgentStep }
  /** Consecutive steps from one integration: "Used Otter Scaffold". */
  | {
      readonly type: "group";
      readonly id: string;
      readonly source: string;
      readonly steps: ReadonlyArray<AgentStep>;
    }
  | { readonly type: "error"; readonly id: string; readonly message: string };

export interface AgentTurnView {
  readonly turn: AgentTurn;
  /** The message that started the turn. */
  readonly prompt: { readonly id: string; readonly text: string } | null;
  /** Commentary and steps up to the last step: what folds away once the turn is done. */
  readonly work: ReadonlyArray<AgentTurnBlock>;
  /** What follows the last step: the answer, and any failure. */
  readonly answer: ReadonlyArray<AgentTurnBlock>;
  readonly stepCount: number;
  /** A finished turn with steps folds them behind "Worked for …". */
  readonly foldable: boolean;
  /** The turn's failure when no error item already says it. */
  readonly error: string | null;
}

/** How much of a step's output clients keep, to show when the step opens. */
const AGENT_STEP_OUTPUT_CHARS = 4_000;
const DETAIL_CHARS = 2_000;

/** `free_time` / `getThread` → "Free time" / "Get thread". */
function sentenceCase(name: string): string {
  const words = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-.\s]+/g, " ")
    .trim()
    .toLowerCase();
  return words.length > 0 ? words[0]!.toUpperCase() + words.slice(1) : name;
}

/** `my-server` → "My Server". */
function titleCase(name: string): string {
  return sentenceCase(name).replace(/\b\w/g, (char) => char.toUpperCase());
}

const basename = (path: string) => path.replace(/\/+$/, "").split("/").pop() || path;

function firstLine(text: string, max = 80): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringField(value: unknown, keys: ReadonlyArray<string>): string {
  const record = asRecord(value);
  for (const key of keys) {
    const field = record?.[key];
    if (typeof field === "string" && field.trim().length > 0) return field.trim();
  }
  return "";
}

/** Arguments as compact JSON, or undefined when there are none. */
function argumentsDetail(input: unknown): string | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  if (typeof input === "string") return clip(input, DETAIL_CHARS);
  if (typeof input === "object" && Object.keys(input).length === 0) return undefined;
  const json = JSON.stringify(input);
  return json === undefined ? undefined : clip(json, DETAIL_CHARS);
}

function outputText(output: unknown): string | undefined {
  if (output === undefined || output === null) return undefined;
  if (typeof output === "string") return clip(output, AGENT_STEP_OUTPUT_CHARS);
  // MCP results arrive as content blocks; their text is what the tool said.
  if (Array.isArray(output)) {
    const texts = output.flatMap((block) => {
      const text = asRecord(block)?.text;
      return typeof text === "string" ? [text] : [];
    });
    if (texts.length === output.length && texts.length > 0) {
      return clip(texts.join("\n"), AGENT_STEP_OUTPUT_CHARS);
    }
  }
  const json = JSON.stringify(output);
  return json === undefined ? undefined : clip(json, AGENT_STEP_OUTPUT_CHARS);
}

const withDetail = (detail: string | undefined) => (detail ? { detail } : {});
const withOutput = (output: string | undefined) => (output ? { output } : {});

/** The command a shell wrapper runs: `/bin/zsh -lc 'echo hi'` → `echo hi`. */
function unwrapShell(command: string): string {
  return command.replace(/^\/bin\/\w+ -l?c '(.*)'$/s, "$1").trim();
}

const SINGLE_ITEM_VERBS: Readonly<Record<string, string>> = {
  create: "Create",
  add: "Add",
  update: "Update",
  edit: "Edit",
  delete: "Delete",
  remove: "Remove",
  get: "Read",
  read: "Read",
  pin: "Pin",
  unpin: "Unpin",
};
const COLLECTION_VERBS: Readonly<Record<string, string>> = {
  list: "List",
  search: "Search",
  find: "Find",
};

/** Calendar tools read as what they did: `calendar_list_events` → "Listed events". */
const CALENDAR_PAST_TENSE: Readonly<Record<string, string>> = {
  list: "Listed",
  get: "Read",
  read: "Read",
  create: "Created",
  add: "Added",
  update: "Updated",
  edit: "Edited",
  move: "Moved",
  reschedule: "Rescheduled",
  delete: "Deleted",
  remove: "Removed",
  cancel: "Cancelled",
  restore: "Restored",
  search: "Searched",
  find: "Found",
  check: "Checked",
  suggest: "Suggested",
  respond: "Responded to",
  rsvp: "Responded to",
  sync: "Synced",
  undo: "Undid",
  redo: "Redid",
  set: "Set",
  show: "Showed",
  hide: "Hid",
};

/** What a calendar verb acts on when the tool name does not say: `calendar_respond`. */
const CALENDAR_DEFAULT_OBJECT: Readonly<Record<string, string>> = {
  list: "calendars",
  respond: "invitation",
  rsvp: "invitation",
  sync: "calendars",
  undo: "last change",
  redo: "last change",
};

/**
 * `calendar_<verb>_<object>` (or `calendar_<object>_<verb>`) → "Listed events", "Found free
 * time"; null when the name has no known verb.
 */
function calendarToolTitle(words: ReadonlyArray<string>): string | null {
  const [first, ...rest] = words;
  const last = rest.at(-1);
  const verbFirst = first !== undefined && CALENDAR_PAST_TENSE[first] !== undefined;
  const verb = verbFirst ? first : last !== undefined && CALENDAR_PAST_TENSE[last] ? last : null;
  if (verb === null) return null;
  const past = CALENDAR_PAST_TENSE[verb]!;
  // `respond_to_invitation` → "Responded to invitation", not "Responded to to invitation".
  let object = (verbFirst ? rest : [first!, ...rest.slice(0, -1)]).join(" ");
  if (past.endsWith(" to")) object = object.replace(/^to /, "");
  const noun = object.length > 0 ? object : CALENDAR_DEFAULT_OBJECT[verb];
  return noun === undefined ? past : `${past} ${noun}`;
}

/**
 * The app's tools are named `<domain>_<verb>` (`accounts_list`); they read as "List accounts",
 * "Read account". Calendar tools (`calendar_*`) read in the past tense: "Created event".
 * Anything else reads as a sentence of its name.
 */
export function appToolTitle(tool: string): string {
  const words = tool
    .split(/[_\-.]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());
  if (words[0] === "calendar" && words.length > 1) {
    const title = calendarToolTitle(words.slice(1));
    if (title !== null) return title;
  }
  const verb = words.at(-1);
  const noun = words.slice(0, -1).join(" ");
  if (verb !== undefined && noun.length > 0) {
    const single = SINGLE_ITEM_VERBS[verb];
    if (single !== undefined) return `${single} ${noun.replace(/s$/, "")}`;
    const collection = COLLECTION_VERBS[verb];
    if (collection !== undefined) return `${collection} ${noun}`;
  }
  return sentenceCase(tool);
}

function isAppServer(server: string): boolean {
  return server.replace(/_/g, "-").toLowerCase() === BRAND.slug;
}

/** A tool of an MCP server. The app's own tools read by their titles. */
function mcpStep(
  base: Pick<AgentStep, "id" | "status">,
  server: string,
  tool: string,
  input: unknown,
  output: unknown,
): AgentStep {
  const app = isAppServer(server);
  return {
    ...base,
    kind: "tool",
    title: app ? appToolTitle(tool) : sentenceCase(tool),
    source: app ? BRAND.displayName : titleCase(server),
    ...withDetail(argumentsDetail(input)),
    ...withOutput(outputText(output)),
  };
}

/** `mcp__server__tool` (Claude) or `server.tool` (Codex). */
function parseMcpToolName(
  toolName: string,
): { readonly server: string; readonly tool: string } | null {
  const claude = toolName.match(/^mcp__(.+?)__(.+)$/);
  if (claude) return { server: claude[1]!, tool: claude[2]! };
  const codex = toolName.match(/^([^.\s]+)\.([^.\s]+)$/);
  return codex ? { server: codex[1]!, tool: codex[2]! } : null;
}

function stepStatus(item: OrchestrationV2TurnItem): AgentStepStatus {
  switch (item.status) {
    case "completed":
      return item.type === "command_execution" &&
        (item.outputIndicatesFailure === true || (item.exitCode ?? 0) !== 0)
        ? "failed"
        : "completed";
    case "failed":
    case "cancelled":
    case "interrupted":
      return "failed";
    case "idle":
    case "pending":
    case "running":
    case "waiting":
      return "running";
  }
}

/** A provider's built-in tool, reported as a dynamic tool item; null for its bookkeeping. */
function builtInToolStep(
  base: Pick<AgentStep, "id" | "status">,
  toolName: string,
  input: unknown,
  output: unknown,
): AgentStep | null {
  const normalized = toolName.toLowerCase().replace(/[\s_-]/g, "");
  const out = withOutput(outputText(output));
  switch (normalized) {
    case "read": {
      const path = stringField(input, ["file_path", "path"]);
      return {
        ...base,
        kind: "read",
        title: path ? `Read ${basename(path)}` : "Read a file",
        ...withDetail(path),
        ...out,
      };
    }
    case "glob":
    case "grep":
    case "ls": {
      const pattern = stringField(input, ["pattern", "path"]);
      return {
        ...base,
        kind: "search",
        title: pattern ? `Searched for ${firstLine(pattern, 60)}` : "Searched files",
        ...withDetail(pattern),
        ...out,
      };
    }
    case "task":
    case "agent":
      return {
        ...base,
        kind: "agent",
        title: "Ran a subagent",
        ...withDetail(stringField(input, ["description", "prompt"])),
        ...out,
      };
    case "todowrite":
      return { ...base, kind: "tool", title: "Updated the plan" };
    case "skill": {
      const skill = stringField(input, ["skill", "command"]);
      return {
        ...base,
        kind: "tool",
        title: skill ? `Used ${titleCase(skill)} skill` : "Used a skill",
      };
    }
    default:
      return null;
  }
}

/** The step a turn item shows as, or null when the item is not a step. */
export function describeAgentStep(item: OrchestrationV2TurnItem): AgentStep | null {
  const base = { id: item.id, status: stepStatus(item) };
  switch (item.type) {
    case "command_execution": {
      const command = unwrapShell(item.input);
      return {
        ...base,
        kind: "command",
        title: `Ran \`${firstLine(command)}\``,
        detail: clip(command, DETAIL_CHARS),
        ...withOutput(item.output === undefined ? undefined : outputText(item.output)),
      };
    }
    case "file_change": {
      const paths = item.changes?.map((change) => change.path) ?? [item.fileName];
      return {
        ...base,
        kind: "edit",
        title:
          paths.length === 1 ? `Edited ${basename(paths[0]!)}` : `Edited ${paths.length} files`,
        detail: paths.join("\n"),
      };
    }
    case "file_search":
      return {
        ...base,
        kind: "search",
        title: item.pattern ? `Searched for ${firstLine(item.pattern, 60)}` : "Searched files",
        ...withDetail(item.pattern),
      };
    case "web_search": {
      const query = item.patterns?.join("\n") ?? "";
      const url = /^https?:\/\//.test(query) ? query : null;
      let host: string | null = null;
      if (url !== null) {
        try {
          host = new URL(url).host;
        } catch {
          host = null;
        }
      }
      return {
        ...base,
        kind: "web",
        title: host === null ? "Searched the web" : `Read ${host}`,
        ...withDetail(query),
      };
    }
    case "todo_list":
      return { ...base, kind: "tool", title: "Updated the plan" };
    case "subagent":
      return {
        ...base,
        kind: "agent",
        title: "Ran a subagent",
        detail: clip(item.prompt, DETAIL_CHARS),
        ...withOutput(item.result ?? undefined),
      };
    case "dynamic_tool": {
      const toolName = item.toolName ?? item.title ?? "tool";
      const mcp = parseMcpToolName(toolName);
      if (mcp !== null) return mcpStep(base, mcp.server, mcp.tool, item.input, item.output);
      // Loading deferred tool definitions is the provider's own bookkeeping.
      if (toolName.toLowerCase().replace(/[\s_-]/g, "") === "toolsearch") return null;
      return (
        builtInToolStep(base, toolName, item.input, item.output) ?? {
          ...base,
          kind: "tool",
          title: item.title ?? sentenceCase(toolName),
          ...withDetail(argumentsDetail(item.input)),
          ...withOutput(outputText(item.output)),
        }
      );
    }
    default:
      return null;
  }
}

/** Runs of two or more steps from the same integration become one group. */
function groupAgentSteps(blocks: ReadonlyArray<AgentTurnBlock>): ReadonlyArray<AgentTurnBlock> {
  const grouped: AgentTurnBlock[] = [];
  for (const block of blocks) {
    const last = grouped.at(-1);
    const source = block.type === "step" ? block.step.source : undefined;
    if (block.type !== "step" || source === undefined) {
      grouped.push(block);
    } else if (last?.type === "group" && last.source === source) {
      grouped[grouped.length - 1] = { ...last, steps: [...last.steps, block.step] };
    } else if (last?.type === "step" && last.step.source === source) {
      grouped[grouped.length - 1] = {
        type: "group",
        id: last.step.id,
        source,
        steps: [last.step, block.step],
      };
    } else {
      grouped.push(block);
    }
  }
  return grouped;
}

function blockOf(item: OrchestrationV2TurnItem): AgentTurnBlock | null {
  switch (item.type) {
    case "assistant_message":
      return item.text.trim().length > 0
        ? { type: "text", id: item.id, text: item.text, streaming: item.streaming }
        : null;
    case "proposed_plan":
      return item.markdown.trim().length > 0
        ? { type: "text", id: item.id, text: item.markdown, streaming: item.streaming }
        : null;
    case "user_message":
      return { type: "user", id: item.id, text: item.text };
    // A provider retrying on its own is not a failure yet.
    case "error":
      return item.retry === undefined
        ? { type: "error", id: item.id, message: item.failure.message }
        : null;
    default: {
      const step = describeAgentStep(item);
      return step === null ? null : { type: "step", step };
    }
  }
}

function presentTurn(
  turn: AgentTurn,
  items: ReadonlyArray<OrchestrationV2TurnItem>,
): AgentTurnView {
  let prompt: AgentTurnView["prompt"] = null;
  const blocks: AgentTurnBlock[] = [];
  for (const item of items) {
    if (prompt === null && item.type === "user_message" && blocks.length === 0) {
      prompt = { id: item.id, text: item.text };
      continue;
    }
    const block = blockOf(item);
    if (block !== null) blocks.push(block);
  }
  let lastStep = -1;
  blocks.forEach((block, index) => {
    if (block.type === "step") lastStep = index;
  });
  const stepCount = blocks.filter((block) => block.type === "step").length;
  const errorShown = blocks.some((block) => block.type === "error" && block.message === turn.error);
  return {
    turn,
    prompt,
    work: groupAgentSteps(blocks.slice(0, lastStep + 1)),
    answer: blocks.slice(lastStep + 1),
    stepCount,
    foldable: stepCount > 0 && turn.status !== "running",
    error: turn.status === "failed" && turn.error !== null && !errorShown ? turn.error : null,
  };
}

/** Every turn of a thread, oldest first, as the chat renders it. */
export function presentAgentTurns(
  detail: Pick<AgentThreadDetail, "turns" | "items">,
): ReadonlyArray<AgentTurnView> {
  const itemsByTurn = new Map<string, OrchestrationV2TurnItem[]>();
  for (const item of detail.items) {
    if (item.runId === null) continue;
    const items = itemsByTurn.get(item.runId);
    if (items === undefined) itemsByTurn.set(item.runId, [item]);
    else items.push(item);
  }
  return [...detail.turns]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((turn) =>
      presentTurn(
        turn,
        [...(itemsByTurn.get(turn.turnId) ?? [])].sort(
          (left, right) => left.ordinal - right.ordinal,
        ),
      ),
    );
}

export type AgentPendingRequestItem = Extract<
  OrchestrationV2TurnItem,
  { readonly type: "approval_request" | "user_input_request" }
>;

export interface AgentPendingRequest {
  readonly request: OrchestrationV2RuntimeRequest;
  /** The item carrying the prompt or the questions, once it has arrived. */
  readonly item: AgentPendingRequestItem | null;
}

/** Approvals and questions still waiting for the user, oldest first, with what they ask. */
export function presentPendingRequests(
  detail: Pick<AgentThreadDetail, "items" | "pendingRequests">,
): ReadonlyArray<AgentPendingRequest> {
  const itemsByRequest = new Map<string, AgentPendingRequestItem>();
  for (const item of detail.items) {
    if (item.type === "approval_request" || item.type === "user_input_request") {
      itemsByRequest.set(item.requestId, item);
    }
  }
  return detail.pendingRequests
    .filter((request) => request.status === "pending")
    .map((request) => ({ request, item: itemsByRequest.get(request.id) ?? null }));
}

/** `12s`, `3m 5s`, `1h 2m`. */
function formatAgentDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${total % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** "Working for 4s" while a turn runs (counted to `nowMs`), "Worked for 12s" once it settled. */
export function agentTurnWorkLabel(turn: AgentTurn, nowMs?: number): string {
  const startedAt = Date.parse(turn.startedAt);
  if (turn.status === "running") {
    return nowMs === undefined || Number.isNaN(startedAt)
      ? "Working…"
      : `Working for ${formatAgentDuration(nowMs - startedAt)}`;
  }
  if (turn.completedAt === null) return "Worked";
  const completedAt = Date.parse(turn.completedAt);
  return Number.isNaN(startedAt) || Number.isNaN(completedAt)
    ? "Worked"
    : `Worked for ${formatAgentDuration(completedAt - startedAt)}`;
}
