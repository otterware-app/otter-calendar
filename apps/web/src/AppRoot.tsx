import { RouterProvider } from "@tanstack/react-router";

import { QuitHoldOverlay } from "./components/QuitHoldOverlay";
import { AppAtomRegistryProvider } from "./rpc/atomRegistry";
import type { AppRouter } from "./router";

/** Owns renderer-wide providers. */
export function AppRoot({ router }: { readonly router: AppRouter }) {
  return (
    <AppAtomRegistryProvider>
      <RouterProvider router={router} />
      <QuitHoldOverlay />
    </AppAtomRegistryProvider>
  );
}
