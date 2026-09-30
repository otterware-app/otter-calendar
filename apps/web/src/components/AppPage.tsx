import { useAtomValue } from "@effect/atom-react";
import { BRAND } from "@t3tools/shared/brand";
import { Link } from "@tanstack/react-router";
import { LinkIcon, PlusIcon, SparklesIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useAgentPanelStore } from "../agentPanelStore";
import { hasCloudPublicConfig } from "../cloud/publicConfig";
import { isElectron } from "../env";
import { shortcutLabelForCommand } from "../keybindings";
import { isLocalEnvironmentDisabled } from "../localEnvironment";
import { primaryServerKeybindingsAtom } from "../state/server";
import { Button } from "./ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { SidebarInset } from "./ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { WorkspacePageHeader } from "./WorkspacePageHeader";

function AgentToggleButton() {
  const open = useAgentPanelStore((state) => state.open);
  const toggle = useAgentPanelStore((state) => state.toggle);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const shortcut = shortcutLabelForCommand(keybindings, "agent.toggle");
  if (open) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button size="sm" variant="ghost" aria-label="Open agent" onClick={toggle} />}
      >
        <SparklesIcon />
        Agent
      </TooltipTrigger>
      <TooltipPopup side="bottom">Open agent{shortcut ? ` (${shortcut})` : ""}</TooltipPopup>
    </Tooltip>
  );
}

/** A main page: the title bar (with the agent toggle) above the page's content. */
export function AppPage({
  title,
  actions,
  children,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <WorkspacePageHeader electron={isElectron}>
        <h1 className="min-w-0 truncate text-sm font-medium text-foreground">{title}</h1>
        <div className="ms-auto flex items-center gap-1">
          {actions}
          <AgentToggleButton />
        </div>
      </WorkspacePageHeader>
      <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
    </SidebarInset>
  );
}

/** Shown in place of a page's data while no environment is connected. */
export function NoEnvironmentState() {
  const description = isLocalEnvironmentDisabled()
    ? "The local environment is turned off. Connect a remote environment, or turn the local environment back on in Connections."
    : hasCloudPublicConfig()
      ? `Enable ${BRAND.connectName} on the machine that runs it, then sign in here with the same account. You can also add the machine with a pairing link.`
      : "Open Connections and add the machine that runs it with its pairing link.";
  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <LinkIcon className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden />
        <EmptyTitle>Connect to {BRAND.displayName}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
        <div className="mt-5 flex justify-center">
          <Button render={<Link to="/settings/connections" />} size="sm">
            <PlusIcon />
            Open Connections
          </Button>
        </div>
      </EmptyHeader>
    </Empty>
  );
}
