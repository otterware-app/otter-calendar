/**
 * What an agent thread's provider session gets from the app: the app's MCP server (with a
 * credential scoped to that session) and the app's instructions. The agent service sets it before
 * it opens a session; the Claude and Codex adapters read it when they configure the provider.
 */
import type { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { BRAND } from "@t3tools/shared/brand";

/** The MCP server's name as providers see it: tools show up as `mcp__<name>__<tool>`. */
export const MCP_SERVER_NAME = BRAND.slug;

export interface McpProviderSessionConfig {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  /** The credential's id; revoking it ends this session's access to the app tools. */
  readonly providerSessionId: string;
  readonly providerInstanceId: ProviderInstanceId;
  /** Always `MCP_SERVER_NAME`; carried so adapters need no import of their own. */
  readonly serverName: string;
  readonly endpoint: string;
  readonly authorizationHeader: string;
  /**
   * App tools that only read. Providers may run them without asking; in `approval-required`
   * mode every other app tool goes through the provider's approval flow.
   */
  readonly readOnlyToolNames: ReadonlyArray<string>;
  /** The app's instructions, appended to the provider's system or developer prompt. */
  readonly instructions: string;
}

const sessionsByThread = new Map<ThreadId, McpProviderSessionConfig>();

export function setMcpProviderSession(config: McpProviderSessionConfig): void {
  sessionsByThread.set(config.threadId, config);
}

export function readMcpProviderSession(threadId: ThreadId): McpProviderSessionConfig | undefined {
  return sessionsByThread.get(threadId);
}

/** Clears the thread's config, but only while it still holds the given credential. */
export function clearMcpProviderSession(threadId: ThreadId, providerSessionId: string): void {
  if (sessionsByThread.get(threadId)?.providerSessionId === providerSessionId) {
    sessionsByThread.delete(threadId);
  }
}
