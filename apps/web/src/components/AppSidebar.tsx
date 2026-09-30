/**
 * The main sidebar: the app's pages, recent agent chats (they open the agent panel), the
 * environment switcher once more than one environment is connected, and settings, account,
 * and connection status at the bottom.
 */
import { connectionStatusText } from "@t3tools/client-runtime/connection";
import type { EnvironmentId } from "@t3tools/contracts";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  ChevronsUpDownIcon,
  MessageSquarePlusIcon,
  NotebookPenIcon,
  SettingsIcon,
} from "lucide-react";
import { lazy, Suspense, useCallback } from "react";

import { useAgentPanelStore } from "../agentPanelStore";
import { isElectron } from "../env";
import { useActiveEnvironmentId, setActiveEnvironmentId } from "../state/activeEnvironment";
import { useAgentThreads } from "../state/agent";
import { useEnvironments } from "../state/environments";
import { ConnectionStatusDot, connectionPhaseDotClassName } from "./ConnectionStatusDot";
import { SidebarChromeHeader } from "./sidebar/SidebarChrome";
import { SidebarProviderUpdatePill } from "./sidebar/SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./sidebar/SidebarUpdatePill";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "./ui/menu";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "./ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const T3ConnectSidebarSignIn = lazy(() =>
  import("./clerk/T3ConnectSidebarSignIn").then((module) => ({
    default: module.T3ConnectSidebarSignIn,
  })),
);
const T3ConnectSidebarAvatar = lazy(() =>
  import("./clerk/T3ConnectSidebarSignIn").then((module) => ({
    default: module.T3ConnectSidebarAvatar,
  })),
);

const RECENT_CHAT_COUNT = 8;

const NAV_ITEMS = [{ to: "/notes", label: "Notes", icon: NotebookPenIcon }] as const;

function useCloseMobileSidebar() {
  const { isMobile, setOpenMobile } = useSidebar();
  return useCallback(() => {
    if (isMobile) setOpenMobile(false);
  }, [isMobile, setOpenMobile]);
}

function EnvironmentSwitcher() {
  const { environments } = useEnvironments();
  const activeEnvironmentId = useActiveEnvironmentId();
  const enabled = environments.filter((environment) => environment.entry.enabled);
  if (enabled.length < 2) return null;
  const active = enabled.find((environment) => environment.environmentId === activeEnvironmentId);
  return (
    <SidebarGroup>
      <Menu>
        <MenuTrigger render={<SidebarMenuButton aria-label="Environment" />}>
          <ConnectionStatusDot
            dotClassName={connectionPhaseDotClassName(active?.connection.phase ?? "offline")}
          />
          <span className="min-w-0 flex-1 truncate">{active?.label ?? "Choose environment"}</span>
          <ChevronsUpDownIcon className="size-3.5 opacity-60" />
        </MenuTrigger>
        <MenuPopup align="start">
          <MenuRadioGroup
            value={activeEnvironmentId ?? ""}
            onValueChange={(value) => setActiveEnvironmentId(value as EnvironmentId)}
          >
            {enabled.map((environment) => (
              <MenuRadioItem
                key={environment.environmentId}
                value={environment.environmentId}
                closeOnClick
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ConnectionStatusDot
                    dotClassName={connectionPhaseDotClassName(environment.connection.phase)}
                  />
                  <span className="min-w-0 truncate">{environment.label}</span>
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuPopup>
      </Menu>
    </SidebarGroup>
  );
}

function RecentChats() {
  const environmentId = useActiveEnvironmentId();
  const { threads } = useAgentThreads(environmentId);
  const panelOpen = useAgentPanelStore((state) => state.open);
  const openThreadId = useAgentPanelStore((state) => state.threadId);
  const openThread = useAgentPanelStore((state) => state.openThread);
  const startNewChat = useAgentPanelStore((state) => state.startNewChat);
  const closeMobileSidebar = useCloseMobileSidebar();
  if (environmentId === null) return null;
  return (
    <SidebarGroup>
      <div className="flex h-7 items-center px-2 text-xs font-medium text-sidebar-muted-foreground">
        Agent
      </div>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => {
              closeMobileSidebar();
              startNewChat();
            }}
          >
            <MessageSquarePlusIcon />
            <span>New chat</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {threads.slice(0, RECENT_CHAT_COUNT).map((thread) => (
          <SidebarMenuItem key={thread.threadId}>
            <SidebarMenuButton
              isActive={panelOpen && openThreadId === thread.threadId}
              onClick={() => {
                closeMobileSidebar();
                openThread(thread.threadId);
              }}
            >
              <span className="min-w-0 flex-1 truncate">{thread.title}</span>
              {thread.pendingRequestCount > 0 ? (
                <span
                  className="size-1.5 shrink-0 rounded-full bg-warning"
                  aria-label="Needs you"
                />
              ) : thread.status !== "idle" ? (
                <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Working" />
              ) : null}
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function ConnectionStatus() {
  const { environments } = useEnvironments();
  const activeEnvironmentId = useActiveEnvironmentId();
  const active = environments.find(
    (environment) => environment.environmentId === activeEnvironmentId,
  );
  if (!active) return null;
  return (
    <ConnectionStatusDot
      tooltipText={`${active.label}: ${connectionStatusText(active.connection)}`}
      dotClassName={connectionPhaseDotClassName(active.connection.phase)}
    />
  );
}

export function AppSidebar() {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const closeMobileSidebar = useCloseMobileSidebar();
  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {NAV_ITEMS.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  isActive={pathname === item.to || pathname.startsWith(`${item.to}/`)}
                  render={<Link to={item.to} onClick={closeMobileSidebar} />}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <RecentChats />
        <EnvironmentSwitcher />
      </SidebarContent>
      <SidebarFooter>
        <SidebarProviderUpdatePill />
        <SidebarUpdateArchitectureWarning />
        <Suspense fallback={null}>
          <T3ConnectSidebarSignIn />
        </Suspense>
        <SidebarMenu className="flex-row items-center">
          <SidebarMenuItem className="shrink-0">
            <Tooltip>
              <TooltipTrigger
                render={
                  <SidebarMenuButton
                    aria-label="Settings"
                    size="icon"
                    onClick={() => {
                      closeMobileSidebar();
                      void navigate({ to: "/settings" });
                    }}
                  />
                }
              >
                <SettingsIcon />
              </TooltipTrigger>
              <TooltipPopup side="top">Settings</TooltipPopup>
            </Tooltip>
          </SidebarMenuItem>
          <SidebarUpdatePill />
          <div className="ms-auto flex items-center gap-1.5 pe-1">
            <ConnectionStatus />
            <Suspense fallback={null}>
              <T3ConnectSidebarAvatar />
            </Suspense>
          </div>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}
