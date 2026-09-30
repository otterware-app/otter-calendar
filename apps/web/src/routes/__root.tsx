import {
  Outlet,
  Link,
  createRootRoute,
  type ErrorComponentProps,
  useLocation,
  useRouter,
} from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { APP_BASE_NAME, APP_DISPLAY_NAME, APP_STAGE_LABEL, APP_VERSION } from "../branding";
import { resolveServerBackedAppDisplayName } from "../branding.logic";
import { AppSidebarLayout } from "../components/AppSidebarLayout";
import { CommandPalette } from "../components/CommandPalette";
import { ConfirmDialogHost } from "../components/ConfirmDialogHost";
import { ConnectOnboardingDialog } from "../components/cloud/ConnectOnboardingDialog";
import { RelayClientInstallDialog } from "../components/cloud/RelayClientInstallDialog";
import { SshPasswordPromptDialog } from "../components/desktop/SshPasswordPromptDialog";
import { ProviderUpdateLaunchNotification } from "../components/ProviderUpdateLaunchNotification";
import { SlowRpcRequestToastCoordinator } from "../components/SlowRpcRequestToastCoordinator";
import { ProviderAuthCallbackCoordinator } from "../components/settings/ProviderAuthCallbackCoordinator";
import { ThemeEditorHost } from "../components/settings/ThemeEditorHost";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { useDefaultThemeAdoption } from "../hooks/useDefaultTheme";
import { useEnvironmentThemeSync } from "../hooks/useEnvironmentTheme";
import { Button } from "../components/ui/button";
import { StandalonePage, StandalonePageHeader } from "../components/ui/standalone-page";
import {
  AnchoredToastProvider,
  stackedThreadToast,
  ToastProvider,
  toastManager,
} from "../components/ui/toast";
import { applyAppearanceFontVariables } from "~/appearanceFonts";
import { applyAppearanceContrast } from "~/appearanceContrast";
import { useClientSettings } from "../hooks/useSettings";
import { syncBrowserChromeTheme } from "../hooks/useTheme";
import { configureClientTracing } from "../observability/clientTracing";
import { resolveInitialServerAuthGateState } from "../environments/primary";
import { hasHostedPairingRequest, isHostedStaticApp } from "../hostedPairing";
import { isLocalEnvironmentDisabled } from "../localEnvironment";
import { primaryServerConfigAtom, primaryServerConfigEventAtom } from "../state/server";
import {
  createKeybindingsUpdateToastController,
  type KeybindingsUpdateToastController,
} from "../components/KeybindingsUpdateToast.logic";

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    if (location.pathname === "/pair" && hasHostedPairingRequest(new URL(window.location.href))) {
      return {
        authGateState: {
          status: "hosted-pairing",
        } as const,
      };
    }

    if (isLocalEnvironmentDisabled() || isHostedStaticApp(new URL(window.location.href))) {
      return {
        authGateState: {
          status: "hosted-static",
        } as const,
      };
    }

    return {
      authGateState: await resolveInitialServerAuthGateState(),
    };
  },
  component: RootRouteView,
  errorComponent: RootRouteErrorView,
  notFoundComponent: RootRouteNotFoundView,
  head: () => ({
    meta: [{ name: "title", content: APP_DISPLAY_NAME }],
  }),
});

function RootRouteNotFoundView() {
  return (
    <main className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <h1 className="text-lg font-medium text-foreground">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          This link doesn't point to a page in {APP_DISPLAY_NAME}.
        </p>
        <Button render={<Link to="/" replace />}>Go home</Button>
      </div>
    </main>
  );
}

function RootRouteView() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const { authGateState } = Route.useRouteContext();
  const primaryEnvironmentAuthenticated = authGateState.status === "authenticated";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      syncBrowserChromeTheme();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  if (
    pathname === "/pair" ||
    pathname === "/connect" ||
    (authGateState.status !== "authenticated" && authGateState.status !== "hosted-static")
  ) {
    return (
      <>
        <DocumentTitleSync />
        <Outlet />
      </>
    );
  }

  return (
    <ToastProvider>
      <AnchoredToastProvider>
        <DocumentTitleSync />
        <ContrastAppearanceSync />
        <EnvironmentThemeSync />
        <GlassAppearanceSync />
        <FontAppearanceSync />
        <ProviderAuthCallbackCoordinator />
        {primaryEnvironmentAuthenticated ? <AuthenticatedTracingBootstrap /> : null}
        <RelayClientInstallDialog />
        <ConnectOnboardingDialog />
        <SshPasswordPromptDialog />
        <ConfirmDialogHost />
        <SlowRpcRequestToastCoordinator />
        {primaryEnvironmentAuthenticated ? <KeybindingsUpdateToasts /> : null}
        {primaryEnvironmentAuthenticated ? <ProviderUpdateLaunchNotification /> : null}
        <CommandPalette>
          <AppSidebarLayout>
            <Outlet />
          </AppSidebarLayout>
        </CommandPalette>
        {/* Above the router: a theme draft is judged by walking the app, so the
            editor has to survive navigation away from settings. */}
        <ThemeEditorHost />
      </AnchoredToastProvider>
    </ToastProvider>
  );
}

/** Follows the palette the primary environment's machine publishes, if any. */
function EnvironmentThemeSync() {
  useEnvironmentThemeSync();
  // Ordered after the palette sync so a first-run client adopting the
  // environment's own theme finds it already in the library.
  useDefaultThemeAdoption();
  return null;
}

function ContrastAppearanceSync() {
  const appearanceContrast = useClientSettings((settings) => settings.appearanceContrast);

  useEffect(() => {
    applyAppearanceContrast(document.documentElement, appearanceContrast);
  }, [appearanceContrast]);

  return null;
}

function GlassAppearanceSync() {
  const glassOpacity = useClientSettings((settings) => settings.glassOpacity);

  useEffect(() => {
    const style = document.documentElement.style;
    style.setProperty("--glass-opacity", `${glassOpacity}%`);
    if (glassOpacity === 100) {
      style.setProperty("--glass-blur", "0px");
    } else {
      style.removeProperty("--glass-blur");
    }
  }, [glassOpacity]);

  return null;
}

function FontAppearanceSync() {
  const fontFamilySans = useClientSettings((settings) => settings.fontFamilySans);
  const fontFamilyCode = useClientSettings((settings) => settings.fontFamilyCode);
  const fontFamilyComposer = useClientSettings((settings) => settings.fontFamilyComposer);
  const fontSizeInterface = useClientSettings((settings) => settings.fontSizeInterface);
  const fontSizePrompt = useClientSettings((settings) => settings.fontSizePrompt);
  const fontSizeCode = useClientSettings((settings) => settings.fontSizeCode);
  const fontSmoothing = useClientSettings((settings) => settings.fontSmoothing);

  useEffect(() => {
    applyAppearanceFontVariables(document.documentElement, {
      sans: fontFamilySans,
      code: fontFamilyCode,
      composer: fontFamilyComposer,
      sizeInterface: fontSizeInterface,
      sizePrompt: fontSizePrompt,
      sizeCode: fontSizeCode,
      smoothing: fontSmoothing,
    });
  }, [
    fontFamilyCode,
    fontFamilyComposer,
    fontFamilySans,
    fontSizeCode,
    fontSizeInterface,
    fontSizePrompt,
    fontSmoothing,
  ]);

  return null;
}

function DocumentTitleSync() {
  const primaryServerVersion =
    useAtomValue(primaryServerConfigAtom)?.environment.serverVersion ?? null;
  const title = resolveServerBackedAppDisplayName({
    baseName: APP_BASE_NAME,
    fallbackDisplayName: APP_DISPLAY_NAME,
    fallbackStageLabel: APP_STAGE_LABEL,
    primaryServerVersion,
  });

  useEffect(() => {
    document.title = title;
  }, [title]);

  return null;
}

function RootRouteErrorView({ error }: ErrorComponentProps) {
  const router = useRouter();
  const message = errorMessage(error);
  // Router pathname rather than window.location: desktop uses hash history, where the window path is always "/".
  const pathname = useLocation({ select: (location) => location.pathname });
  const report = useMemo(() => errorReport(error, pathname), [error, pathname]);

  return (
    <StandalonePage tone="error">
      <StandalonePageHeader
        eyebrow={APP_DISPLAY_NAME}
        title="Something went wrong."
        description={message}
      />

      <div className="mt-5 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void router.invalidate()}>
          Try again
        </Button>
        <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
          Reload app
        </Button>
        <CopyErrorButton report={report} />
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-border/70 bg-background/55">
        <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">Error report</p>
        <pre className="max-h-64 overflow-auto border-t border-border/70 bg-background/80 px-3 py-2 text-xs whitespace-pre-wrap text-foreground/85">
          {report}
        </pre>
      </div>
    </StandalonePage>
  );
}

/** Copies the full error report and swaps to a check mark for a moment as confirmation. */
function CopyErrorButton({ report }: { report: string }) {
  const { copyToClipboard, isCopied } = useCopyToClipboard({ target: "error-report" });

  return (
    <Button size="sm" variant="outline" onClick={() => copyToClipboard(report)}>
      {isCopied ? <CheckIcon className="text-success" /> : <CopyIcon />}
      {isCopied ? "Copied" : "Copy error"}
    </Button>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "An unexpected router error occurred.";
}

function errorDetails(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return "No additional error details are available.";
  }
}

const MAX_ERROR_CAUSE_DEPTH = 5;

/**
 * Full error text for bug reports: app build, page path, time, then the stack
 * and any cause chain. Takes the pathname only so tokens in the query never
 * land on the clipboard.
 */
function errorReport(error: unknown, pathname: string): string {
  const lines = [
    `${APP_DISPLAY_NAME} ${APP_VERSION}`,
    `Path: ${pathname}`,
    `Time: ${new Date().toISOString()}`,
    "",
    errorDetails(error),
  ];
  let cause = error instanceof Error ? error.cause : undefined;
  for (let depth = 0; cause !== undefined && depth < MAX_ERROR_CAUSE_DEPTH; depth += 1) {
    lines.push("", "Caused by:", errorDetails(cause));
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  return lines.join("\n");
}

function AuthenticatedTracingBootstrap() {
  useEffect(() => {
    void configureClientTracing();
  }, []);

  return null;
}

/** Tells the user when the environment reloads keybindings.json, or rejects it. */
function KeybindingsUpdateToasts() {
  const serverConfigEvent = useAtomValue(primaryServerConfigEventAtom);
  const handledConfigEventRef = useRef(serverConfigEvent);
  const [keybindingsToastController] = useState<KeybindingsUpdateToastController>(() =>
    createKeybindingsUpdateToastController({}),
  );

  const handleServerConfigUpdated = useEffectEvent(() => {
    const decision = keybindingsToastController.handle(serverConfigEvent);
    if (!decision) {
      return;
    }
    if (decision._tag === "Success") {
      toastManager.add({
        type: "success",
        title: "Keybindings updated",
        description: "Keybindings configuration reloaded successfully.",
      });
      return;
    }
    toastManager.add(
      stackedThreadToast({
        type: "warning",
        title: "Invalid keybindings configuration",
        description: decision.message,
      }),
    );
  });

  useEffect(() => {
    if (serverConfigEvent === null || handledConfigEventRef.current === serverConfigEvent) {
      return;
    }
    handledConfigEventRef.current = serverConfigEvent;
    handleServerConfigUpdated();
  }, [serverConfigEvent]);

  return null;
}
