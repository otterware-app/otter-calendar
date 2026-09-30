import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";

// Settings replaces the sidebar's pages with its own sections and a Back button. Everything
// else is the main app.
export function isSettingsPage(pathname: string) {
  return pathname === "/settings" || pathname.startsWith("/settings/");
}

let mainAppHref: string | null = null;

// Mount once in the app shell. Records the latest main app URL so Back can
// return there no matter how many settings pages were visited since.
export function MainAppLocationTracker() {
  const href = useLocation({
    select: (location) => (isSettingsPage(location.pathname) ? null : location.href),
  });
  useEffect(() => {
    if (href !== null) mainAppHref = href;
  }, [href]);
  return null;
}

// Leaves settings for the last main app URL, or home when the app was opened on settings.
export function useNavigateToMainApp() {
  const navigate = useNavigate();
  return useCallback(() => navigate({ href: mainAppHref ?? "/" }), [navigate]);
}
