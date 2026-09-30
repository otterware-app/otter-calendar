/**
 * Every app tool the agent gets over MCP. `AppToolkit` is what `/mcp` serves, and its read-only
 * annotations decide which tools providers may run without asking.
 */
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import { Tool, Toolkit } from "effect/unstable/ai";

import { CalendarHandlersLive } from "./toolkits/calendar/handlers.ts";
import { CalendarToolkit } from "./toolkits/calendar/tools.ts";

export const AppToolkit = Toolkit.merge(CalendarToolkit);

export const AppToolkitHandlersLive = Layer.mergeAll(CalendarHandlersLive);

export const APP_READ_ONLY_TOOL_NAMES: ReadonlyArray<string> = Object.values(AppToolkit.tools)
  .filter((tool) => Context.get(tool.annotations, Tool.Readonly))
  .map((tool) => tool.name);
