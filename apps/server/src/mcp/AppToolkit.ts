/**
 * Every app tool the agent gets over MCP. An app built from the scaffold adds its own toolkits
 * here, next to (or instead of) the Notes example: `AppToolkit` is what `/mcp` serves, and its
 * read-only annotations decide which tools providers may run without asking.
 */
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import { Tool, Toolkit } from "effect/unstable/ai";

import { NotesHandlersLive } from "./toolkits/notes/handlers.ts";
import { NotesToolkit } from "./toolkits/notes/tools.ts";

export const AppToolkit = Toolkit.merge(NotesToolkit);

export const AppToolkitHandlersLive = Layer.mergeAll(NotesHandlersLive);

export const APP_READ_ONLY_TOOL_NAMES: ReadonlyArray<string> = Object.values(AppToolkit.tools)
  .filter((tool) => Context.get(tool.annotations, Tool.Readonly))
  .map((tool) => tool.name);
