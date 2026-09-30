// The desktop's local backends. Today that is the bundled primary backend;
// callers (bootstrap IPC, updates, local auth, shutdown) go through `list` so
// they stay independent of how many backends run.

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as DesktopBackendConfiguration from "./DesktopBackendConfiguration.ts";
import * as DesktopBackendManager from "./DesktopBackendManager.ts";
import * as DesktopObservability from "../app/DesktopObservability.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";

const { logWarning: logBackendPoolWarning } =
  DesktopObservability.makeComponentLogger("desktop-backend-pool");

export type BackendInstanceId = DesktopBackendManager.BackendInstanceId;
export const BackendInstanceId = DesktopBackendManager.BackendInstanceId;
export const PRIMARY_INSTANCE_ID = DesktopBackendManager.PRIMARY_INSTANCE_ID;
export type DesktopBackendInstance = DesktopBackendManager.DesktopBackendInstance;

const PRIMARY_LABEL = "Local environment";

export class DesktopBackendPool extends Context.Service<
  DesktopBackendPool,
  {
    // Snapshot of all running backend instances.
    readonly list: Effect.Effect<readonly DesktopBackendInstance[]>;
    // The bundled backend, registered for the pool's lifetime.
    readonly primary: Effect.Effect<DesktopBackendInstance>;
  }
>()("@t3tools/desktop/backend/DesktopBackendPool") {}

export const layer = Layer.effect(
  DesktopBackendPool,
  Effect.gen(function* () {
    const configuration = yield* DesktopBackendConfiguration.DesktopBackendConfiguration;
    const desktopWindow = yield* DesktopWindow.DesktopWindow;

    const primary = yield* DesktopBackendManager.makeBackendInstance({
      id: DesktopBackendManager.PRIMARY_INSTANCE_ID,
      label: Effect.succeed(PRIMARY_LABEL),
      configResolve: configuration.resolvePrimary,
      // Window creation errors propagating out of handleBackendReady must
      // not block the readiness callback (that would prevent restartAttempt
      // from being reset), so we absorb them here. The window service only
      // logs on success, so log the failure here before swallowing it —
      // otherwise a post-readiness window-open failure vanishes silently and
      // is near-impossible to diagnose in production.
      onReady: (httpBaseUrl) =>
        desktopWindow.handleBackendReady(httpBaseUrl).pipe(
          Effect.catch((error) =>
            logBackendPoolWarning("failed to open main window after backend readiness", {
              error: error.message,
            }),
          ),
        ),
      onShutdown: () => desktopWindow.handleBackendNotReady,
    });

    return DesktopBackendPool.of({
      list: Effect.succeed([primary]),
      primary: Effect.succeed(primary),
    });
  }),
);

// Test layer backed by a known instance, without standing up the manager.
export const layerTest = (primary: DesktopBackendInstance): Layer.Layer<DesktopBackendPool> =>
  Layer.succeed(
    DesktopBackendPool,
    DesktopBackendPool.of({
      list: Effect.succeed([primary]),
      primary: Effect.succeed(primary),
    }),
  );
