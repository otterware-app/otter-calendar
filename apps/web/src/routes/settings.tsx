import { Outlet, createFileRoute, redirect, useLocation } from "@tanstack/react-router";
import { RotateCcwIcon } from "lucide-react";
import { useState } from "react";

import { useSettingsRestore } from "../components/settings/SettingsPanels";
import { SettingsBreadcrumb } from "../components/settings/SettingsBreadcrumb";
import { useNavigateToMainApp } from "../components/sidebar/mainAppLocation";
import { Button } from "../components/ui/button";
import { SidebarInset } from "../components/ui/sidebar";
import { WorkspacePageHeader } from "../components/WorkspacePageHeader";
import { isElectron } from "../env";
import { useEscapeToGoBack } from "../hooks/useNavigateBack";

function RestoreDeviceDefaultsButton({ onRestored }: { onRestored: () => void }) {
  const { changedSettingLabels, restoreDefaults } = useSettingsRestore(onRestored);
  return (
    <Button
      size="xs"
      variant="ghost"
      disabled={changedSettingLabels.length === 0}
      onClick={() => void restoreDefaults()}
    >
      <RotateCcwIcon className="mx-1 size-3.5" />
      Restore device defaults
    </Button>
  );
}

function SettingsRouteLayout() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigateToMainApp = useNavigateToMainApp();
  useEscapeToGoBack(navigateToMainApp);
  const [restoreSignal, setRestoreSignal] = useState(0);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        <WorkspacePageHeader electron={isElectron}>
          <div className="flex w-full items-center gap-3">
            <SettingsBreadcrumb pathname={pathname} />
            {pathname === "/settings/general" ? (
              <div className="ms-auto flex shrink-0 items-center">
                <RestoreDeviceDefaultsButton
                  onRestored={() => setRestoreSignal((value) => value + 1)}
                />
              </div>
            ) : null}
          </div>
        </WorkspacePageHeader>
        <div key={restoreSignal} className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/settings")({
  beforeLoad: async ({ context, location }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }

    if (location.pathname === "/settings") {
      throw redirect({ to: "/settings/general", replace: true });
    }
  },
  component: SettingsRouteLayout,
});
