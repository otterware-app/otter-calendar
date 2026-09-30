/**
 * The agent panel: a resizable column on the right with the open conversation, the approval or
 * question it waits on, and the composer. Its open state and conversation survive reloads.
 */
import { presentPendingRequests } from "@t3tools/client-runtime/agent-steps";
import { BRAND } from "@t3tools/shared/brand";
import {
  ChevronDownIcon,
  MessageSquarePlusIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useMemo } from "react";

import { useAgentPanelStore } from "../../agentPanelStore";
import { useResizableWidth } from "../../hooks/useResizableWidth";
import { useClientSettings } from "../../hooks/useSettings";
import { ensureLocalApi } from "../../localApi";
import { toastCommandFailure } from "../../lib/commandFailureToast";
import { useActiveEnvironmentId } from "../../state/activeEnvironment";
import { agentEnvironment, useAgentThread, useAgentThreads } from "../../state/agent";
import { useAtomCommand } from "../../state/use-atom-command";
import { RightPanelResizeHandle } from "../RightPanelResizeHandle";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { AgentComposer } from "./AgentComposer";
import { AgentConversation } from "./AgentConversation";
import { AgentRequestBanner } from "./AgentRequestBanner";

const PANEL_WIDTH_STORAGE_KEY = "t3code:agent-panel-width:v1";

export function AgentPanel() {
  const environmentId = useActiveEnvironmentId();
  const storedThreadId = useAgentPanelStore((state) => state.threadId);
  const setOpen = useAgentPanelStore((state) => state.setOpen);
  const openThread = useAgentPanelStore((state) => state.openThread);
  const startNewChat = useAgentPanelStore((state) => state.startNewChat);
  const { threads, isLoading: threadsLoading } = useAgentThreads(environmentId);
  // A conversation deleted elsewhere (or on another environment) falls back to a new chat.
  const threadId =
    storedThreadId !== null &&
    (threadsLoading || threads.some((thread) => thread.threadId === storedThreadId))
      ? storedThreadId
      : null;
  const { detail } = useAgentThread(environmentId, threadId);
  const deleteThread = useAtomCommand(agentEnvironment.deleteThread);
  const confirmDelete = useClientSettings((settings) => settings.confirmThreadDelete);
  const { width, handlers } = useResizableWidth({
    storageKey: PANEL_WIDTH_STORAGE_KEY,
    defaultWidth: 420,
    minWidth: 320,
    maxWidth: 760,
    edge: "left",
  });
  const pending = useMemo(() => (detail ? presentPendingRequests(detail) : []), [detail]);
  const title = detail?.thread.title ?? (threadId === null ? "New chat" : "Chat");

  const removeThread = async () => {
    if (environmentId === null || detail === null) return;
    const confirmed =
      !confirmDelete ||
      (await ensureLocalApi().dialogs.confirm(`Delete the chat "${detail.thread.title}"?`, {
        variant: "destructive",
      }));
    if (!confirmed) return;
    const result = await deleteThread({
      environmentId,
      input: { threadId: detail.thread.threadId },
    });
    if (!toastCommandFailure("Could not delete the chat", result)) startNewChat();
  };

  return (
    <aside
      aria-label="Agent"
      className="relative flex h-dvh shrink-0 flex-col border-s border-border bg-background"
      style={{ width }}
    >
      <RightPanelResizeHandle handlers={handlers} />
      <header className="flex h-[var(--workspace-topbar-height)] shrink-0 items-center gap-1 px-2">
        <Menu>
          <MenuTrigger render={<Button size="sm" variant="ghost" className="min-w-0" />}>
            <span className="min-w-0 truncate">{title}</span>
            <ChevronDownIcon className="size-3.5 opacity-60" />
          </MenuTrigger>
          <MenuPopup align="start" className="max-h-96 w-72">
            <MenuItem onClick={startNewChat}>
              <MessageSquarePlusIcon />
              New chat
            </MenuItem>
            {threads.length > 0 ? <MenuSeparator /> : null}
            {threads.map((thread) => (
              <MenuItem key={thread.threadId} onClick={() => openThread(thread.threadId)}>
                <span className="min-w-0 truncate">{thread.title}</span>
                {thread.pendingRequestCount > 0 ? (
                  <span className="ms-auto size-1.5 shrink-0 rounded-full bg-warning" />
                ) : null}
              </MenuItem>
            ))}
          </MenuPopup>
        </Menu>
        <div className="ms-auto flex items-center">
          {detail ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost-destructive"
                    aria-label="Delete chat"
                    onClick={() => void removeThread()}
                  />
                }
              >
                <Trash2Icon />
              </TooltipTrigger>
              <TooltipPopup side="bottom">Delete chat</TooltipPopup>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost-muted"
                  aria-label="New chat"
                  onClick={startNewChat}
                />
              }
            >
              <MessageSquarePlusIcon />
            </TooltipTrigger>
            <TooltipPopup side="bottom">New chat</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost-muted"
                  aria-label="Close agent"
                  onClick={() => setOpen(false)}
                />
              }
            >
              <XIcon />
            </TooltipTrigger>
            <TooltipPopup side="bottom">Close</TooltipPopup>
          </Tooltip>
        </div>
      </header>
      {environmentId === null ? (
        <p className="p-4 text-sm text-muted-foreground">
          Connect an environment to talk to the agent.
        </p>
      ) : (
        <>
          {detail ? (
            <AgentConversation detail={detail} />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <SparklesIcon className="size-6 text-muted-foreground" aria-hidden />
              <p className="max-w-64 text-sm text-muted-foreground">
                {threadId === null
                  ? `Ask the ${BRAND.displayName} agent to find, write, or change things for you.`
                  : "Loading the chat…"}
              </p>
            </div>
          )}
          {detail && pending[0] ? (
            <AgentRequestBanner
              key={pending[0].request.id}
              environmentId={environmentId}
              threadId={detail.thread.threadId}
              pending={pending[0]}
            />
          ) : null}
          <AgentComposer environmentId={environmentId} thread={detail?.thread ?? null} />
        </>
      )}
    </aside>
  );
}
