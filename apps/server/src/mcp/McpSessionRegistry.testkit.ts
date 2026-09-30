import { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { APP_READ_ONLY_TOOL_NAMES } from "./AppToolkit.ts";
import { McpSessionRegistry } from "./McpSessionRegistry.ts";
import { MCP_SERVER_NAME } from "./McpProviderSession.ts";

/** Issues fixed, unresolvable credentials; for tests of code that opens provider sessions. */
export const layer = Layer.succeed(
  McpSessionRegistry,
  McpSessionRegistry.of({
    issue: ({ threadId, providerInstanceId, instructions }) =>
      Effect.succeed({
        config: {
          environmentId: EnvironmentId.make("environment:mcp-test"),
          threadId,
          providerSessionId: `mcp-test:${threadId}`,
          providerInstanceId,
          serverName: MCP_SERVER_NAME,
          endpoint: "http://127.0.0.1/mcp",
          authorizationHeader: `Bearer mcp-test:${threadId}`,
          readOnlyToolNames: APP_READ_ONLY_TOOL_NAMES,
          instructions,
        },
      }),
    resolve: () => Effect.undefined,
    touch: () => Effect.void,
    revokeProviderSession: () => Effect.void,
    revokeThread: () => Effect.void,
  }),
);
