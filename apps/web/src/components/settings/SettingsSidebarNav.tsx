import { useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { lazy, Suspense } from "react";

import { useNavigateToMainApp } from "../sidebar/mainAppLocation";
import { SidebarUpdatePill } from "../sidebar/SidebarUpdatePill";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";
import { SETTINGS_SECTIONS } from "./settingsSections";

const T3ConnectSidebarSignIn = lazy(() =>
  import("../clerk/T3ConnectSidebarSignIn").then((module) => ({
    default: module.T3ConnectSidebarSignIn,
  })),
);
const T3ConnectSidebarAvatar = lazy(() =>
  import("../clerk/T3ConnectSidebarSignIn").then((module) => ({
    default: module.T3ConnectSidebarAvatar,
  })),
);

export function SettingsSidebarNav({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  const navigateToMainApp = useNavigateToMainApp();
  const { isMobile, setOpenMobile } = useSidebar();
  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {SETTINGS_SECTIONS.map((section) => (
              <SidebarMenuItem key={section.to}>
                <SidebarMenuButton
                  isActive={pathname === section.to || pathname.startsWith(`${section.to}/`)}
                  onClick={() => {
                    closeMobileSidebar();
                    void navigate({ to: section.to });
                  }}
                >
                  <section.icon />
                  <span className="truncate">{section.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Suspense fallback={null}>
          <T3ConnectSidebarSignIn />
        </Suspense>
        <SidebarMenu className="flex-row items-center">
          <SidebarMenuItem className="min-w-0 flex-1">
            <SidebarMenuButton
              onClick={() => {
                closeMobileSidebar();
                void navigateToMainApp();
              }}
            >
              <ArrowLeftIcon />
              <span>Back</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarUpdatePill />
          <Suspense fallback={null}>
            <T3ConnectSidebarAvatar />
          </Suspense>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}
