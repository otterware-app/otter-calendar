import type { RelayManagedEndpointRuntimeConfig } from "@t3tools/contracts/relay";
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeHttp from "node:http";

import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { EnvironmentHttpApi } from "@t3tools/contracts";
import * as NetService from "@t3tools/shared/Net";
import * as RelayClient from "@t3tools/shared/relayClient";
import { disableTailscaleServe, ensureTailscaleServe } from "@t3tools/tailscale";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Random from "effect/Random";
import * as Schedule from "effect/Schedule";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import * as AgentServiceLive from "./agent/AgentServiceLive.ts";
import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import { authHttpApiLayer, environmentAuthenticatedAuthLayer } from "./auth/http.ts";
import * as ReplayMarkers from "./auth/replayMarkers.ts";
import * as ServerSecretStore from "./auth/ServerSecretStore.ts";
import * as BackgroundPolicy from "./background/BackgroundPolicy.ts";
import * as HostPowerMonitor from "./background/HostPowerMonitor.ts";
import * as CalendarServiceLive from "./calendar/CalendarServiceLive.ts";
import * as GoogleAuthLive from "./calendar/google/GoogleAuthLive.ts";
import * as CloudCliState from "./cloud/CliState.ts";
import * as CloudCliTokenManager from "./cloud/CliTokenManager.ts";
import {
  connectHttpApiLayer,
  pendingServiceUpdateExists,
  reconcileDesiredCloudLinkIfStillDesired,
  recoverManagedCloudTunnel,
  registerManagedCloudTunnelRecovery,
  releaseManagedTunnelOnShutdown,
  startManagedCloudTunnelIfOriginConfirmed,
} from "./cloud/http.ts";
import * as CloudManagedEndpointRuntime from "./cloud/ManagedEndpointRuntime.ts";
import {
  MANAGED_TUNNEL_FIRST_REGISTRATION_JITTER,
  MANAGED_TUNNEL_RECOVERY_COOLDOWN,
  managedTunnelStartupAction,
  retryManagedTunnelRegistration,
} from "./cloud/managedTunnelStartup.ts";
import { hasCloudPublicConfig } from "./cloud/publicConfig.ts";
import { shouldRetryCloudLink } from "./cloud/relayResponse.ts";
import { serverRelayBrokerTracingLayer } from "./cloud/relayTracing.ts";
import * as ServerSelfUpdate from "./cloud/selfUpdate.ts";
import * as ServiceLauncherClient from "./cloud/serviceLauncherClient.ts";
import * as ServerConfig from "./config.ts";
import * as ProcessDiagnostics from "./diagnostics/ProcessDiagnostics.ts";
import * as TraceDiagnostics from "./diagnostics/TraceDiagnostics.ts";
import * as ServerEnvironment from "./environment/ServerEnvironment.ts";
import * as EnvironmentTheme from "./environmentTheme.ts";
import {
  browserApiCorsLayer,
  httpCompressionLayer,
  otlpTracesProxyRouteLayer,
  serverEnvironmentHttpApiLayer,
  staticAndDevRouteLayer,
  untracedRequestsLayer,
} from "./http.ts";
import { guardHttpResponseWriteErrors } from "./httpResponseErrorGuard.ts";
import * as Keybindings from "./keybindings.ts";
import * as McpHttpServer from "./mcp/McpHttpServer.ts";
import * as McpSessionRegistry from "./mcp/McpSessionRegistry.ts";
import * as EventLoopMonitor from "./observability/EventLoopMonitor.ts";
import * as HeapSnapshot from "./observability/HeapSnapshot.ts";
import { ObservabilityLive } from "./observability/Layers/Observability.ts";
import { fixPath } from "./os-jank.ts";
import { layerConfig as SqlitePersistenceLayerLive } from "./persistence/Layers/Sqlite.ts";
import * as ExternalLauncher from "./process/externalLauncher.ts";
import { layerFromProviderInstanceRegistry as ProviderAdapterRegistryLive } from "./provider/adapters/ProviderAdapterRegistry.ts";
import { CodexInstallation } from "./provider/CodexInstallation.ts";
import { ProviderAuthServiceLive } from "./provider/Layers/ProviderAuthService.ts";
import * as ProviderEventLoggers from "./provider/Layers/ProviderEventLoggers.ts";
import { ProviderInstanceRegistryHydrationLive } from "./provider/Layers/ProviderInstanceRegistryHydration.ts";
import { ProviderOrchestrationAdapterInfrastructureLive } from "./provider/Layers/ProviderOrchestrationAdapterInfrastructure.ts";
import { ProviderRegistryLive } from "./provider/Layers/ProviderRegistry.ts";
import * as ModelManifest from "./provider/ModelManifest.ts";
import * as ProviderSessionRelease from "./provider/ProviderSessionRelease.ts";
import { ProviderInstanceRegistry } from "./provider/Services/ProviderInstanceRegistry.ts";
import { ProviderRegistry } from "./provider/Services/ProviderRegistry.ts";
import { forkParked, ServerActivation } from "./serverActivation.ts";
import * as ServerLifecycleEvents from "./serverLifecycleEvents.ts";
import * as ServerRuntimeStartup from "./serverRuntimeStartup.ts";
import {
  clearPersistedServerRuntimeState,
  makePersistedServerRuntimeState,
  persistServerRuntimeState,
} from "./serverRuntimeState.ts";
import * as ServerSettings from "./serverSettings.ts";
import * as AnalyticsService from "./telemetry/AnalyticsService.ts";
import { websocketRpcRouteLayer } from "./ws.ts";

// Effect's default preemptive shutdown waits 20s before finalizing request scopes.
// The primary transport is long-lived WebSocket RPC, whose Effect scope finalizer
// already closes the websocket gracefully. Do not add an artificial drain before
// those finalizers get a chance to run.
const HTTP_PREEMPTIVE_SHUTDOWN_GRACE_MS = 0;

const ApplicationObservabilityLive = EventLoopMonitor.layer.pipe(
  Layer.provideMerge(ObservabilityLive),
);

const RelayClientLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    return RelayClient.layerCloudflared({ baseDir: config.baseDir });
  }),
);

const HttpServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    return NodeHttpServer.layer(() => guardHttpResponseWriteErrors(NodeHttp.createServer()), {
      host: config.host ?? "127.0.0.1",
      port: config.port,
      gracefulShutdownTimeout: HTTP_PREEMPTIVE_SHUTDOWN_GRACE_MS,
      // Negotiate permessage-deflate with clients that offer it; clients
      // that don't still get uncompressed frames on their connection.
      // Context takeover stays enabled (ws default) so the compression
      // window is shared across frames — that also makes small frames cheap
      // to compress, so no size threshold is set (ws only honors
      // `threshold` when context takeover is disabled).
      websocket: { perMessageDeflate: true },
    });
  }),
);

/** SQLite (migrated), settings, and the secret store every other layer builds on. */
const StorageLayerLive = ServerSettings.layer.pipe(
  Layer.provideMerge(ServerSecretStore.layer),
  Layer.provideMerge(SqlitePersistenceLayerLive),
);

const ServerEnvironmentLayerLive = ServerEnvironment.layer;

const AuthLayerLive = EnvironmentAuth.layer.pipe(Layer.provide(ServerEnvironmentLayerLive));

const CloudLayerLive = Layer.mergeAll(
  RelayClientLive,
  CloudManagedEndpointRuntime.layer.pipe(Layer.provide(RelayClientLive)),
  CloudCliTokenManager.layer,
);

const BackgroundLayerLive = BackgroundPolicy.layer.pipe(Layer.provide(HostPowerMonitor.layer));

// A new Codex install changes what every Codex instance can run, so re-probe them.
const ProviderInstallationRefreshLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const codex = yield* CodexInstallation;
    const instances = yield* ProviderInstanceRegistry;
    const providers = yield* ProviderRegistry;
    yield* codex.changes.pipe(
      Stream.changesWith((a, b) => a.installedVersion === b.installedVersion),
      Stream.drop(1),
      Stream.runForEach((state) =>
        instances.listInstances.pipe(
          Effect.flatMap((entries) =>
            Effect.forEach(
              entries.filter((instance) => instance.driverKind === state.driver),
              (instance) => providers.refreshInstance(instance.instanceId),
              { discard: true },
            ),
          ),
        ),
      ),
      Effect.forkScoped,
    );
  }),
);

/**
 * The provider layer: Claude and Codex instances hydrated from settings, their
 * status snapshots, sign-in, installation, and the adapter registry the agent
 * opens sessions through. `ProviderOrchestrationAdapterInfrastructureLive` is
 * merged into the output so the agent drains the same continuation queue the
 * adapters fill.
 */
const ProviderLayerLive = Layer.mergeAll(
  ProviderAuthServiceLive,
  ProviderAdapterRegistryLive,
  ProviderInstallationRefreshLive,
).pipe(
  Layer.provideMerge(ProviderRegistryLive),
  Layer.provideMerge(ProviderInstanceRegistryHydrationLive),
  Layer.provideMerge(ProviderSessionRelease.layer),
  Layer.provideMerge(ProviderOrchestrationAdapterInfrastructureLive),
  Layer.provideMerge(CodexInstallation.layer),
  Layer.provideMerge(Layer.mergeAll(ProviderEventLoggers.layer, ModelManifest.layer)),
);

/**
 * The app's features. They may use anything below them: `SqlClient`,
 * `ServerConfig`, `ServerSettingsService`, the provider layer
 * (`ProviderInstanceRegistry`, `ProviderAdapterRegistryV2`,
 * `ProviderSessionRelease`, …), and `McpSessionRegistry`.
 */
const CalendarLayerLive = CalendarServiceLive.layer.pipe(Layer.provide(GoogleAuthLive.layer));

const FeaturesLayerLive = Layer.mergeAll(AgentServiceLive.layer, CalendarLayerLive);

const RuntimeDependenciesLive = FeaturesLayerLive.pipe(
  Layer.provideMerge(ProviderLayerLive),
  Layer.provideMerge(
    Layer.mergeAll(
      Keybindings.layer,
      EnvironmentTheme.layer,
      BackgroundLayerLive,
      ReplayMarkers.layer,
      ProcessDiagnostics.layer,
      TraceDiagnostics.layer,
      AnalyticsService.layer,
      ServerLifecycleEvents.layer,
      ServerSelfUpdate.layer,
    ),
  ),
  Layer.provideMerge(CloudLayerLive),
  Layer.provideMerge(AuthLayerLive),
  Layer.provideMerge(ServerEnvironmentLayerLive),
  Layer.provideMerge(McpSessionRegistry.layer.pipe(Layer.provide(ServerEnvironmentLayerLive))),
  Layer.provideMerge(StorageLayerLive),
  Layer.provideMerge(ExternalLauncher.layer),
  Layer.provide(NetService.layer),
);

const commandReadinessLayer = HttpRouter.middleware(
  (httpEffect) =>
    Effect.flatMap(ServerRuntimeStartup.ServerRuntimeStartup, (startup) =>
      startup.awaitCommandReady.pipe(Effect.orDie, Effect.andThen(httpEffect)),
    ),
  { global: true },
);

const makeRoutesLayer = Layer.mergeAll(
  HttpApiBuilder.layer(EnvironmentHttpApi).pipe(
    Layer.provide(authHttpApiLayer),
    Layer.provide(connectHttpApiLayer),
    Layer.provide(serverEnvironmentHttpApiLayer),
    Layer.provide(environmentAuthenticatedAuthLayer),
  ),
  otlpTracesProxyRouteLayer,
  staticAndDevRouteLayer,
  websocketRpcRouteLayer,
  // The app's tools, served to provider sessions at `/mcp`.
  McpHttpServer.layer,
  // Last, so no route layer can replace the server's one TracerDisabledWhen.
  untracedRequestsLayer,
).pipe(
  Layer.provide(commandReadinessLayer),
  Layer.provide(browserApiCorsLayer),
  Layer.provide(httpCompressionLayer),
);

const makeServerLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const activation = yield* Deferred.make<void>();
    const awaitActivation = Deferred.await(activation);
    const activationLayer = Layer.succeed(ServerActivation, awaitActivation);
    const runtimeStateParked = yield* Deferred.make<void>();
    const tailscaleParked = yield* Deferred.make<void>();
    const cloudLinkParked = yield* Deferred.make<void>();
    const routesReady = yield* Deferred.make<void>();
    const launcherLayer = ServiceLauncherClient.layer;

    yield* fixPath();

    const httpListeningLayer = Layer.effectDiscard(
      Effect.gen(function* () {
        yield* HttpServer.HttpServer;
        const startup = yield* ServerRuntimeStartup.ServerRuntimeStartup;
        yield* startup.markHttpListening;
      }),
    );
    const runtimeStateLayer = Layer.effectDiscard(
      Effect.acquireRelease(
        Effect.gen(function* () {
          yield* Deferred.succeed(runtimeStateParked, undefined).pipe(Effect.orDie);
          yield* awaitActivation;
          const server = yield* HttpServer.HttpServer;
          const address = server.address;
          if (typeof address === "string" || !("port" in address)) {
            return;
          }

          const launcher = yield* ServiceLauncherClient.ServiceLauncherClient;
          const state = yield* makePersistedServerRuntimeState({
            config,
            port: address.port,
            serviceManaged: launcher.managed,
          });
          yield* persistServerRuntimeState({
            path: config.serverRuntimeStatePath,
            state,
          }).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("Failed to persist server runtime state", { cause }),
            ),
          );
        }),
        () =>
          clearPersistedServerRuntimeState(config.serverRuntimeStatePath).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("Failed to clear server runtime state", { cause }),
            ),
          ),
      ),
    );
    const tailscaleServeLayer = config.tailscaleServeEnabled
      ? Layer.effectDiscard(
          Effect.acquireRelease(
            Effect.gen(function* () {
              yield* Deferred.succeed(tailscaleParked, undefined).pipe(Effect.orDie);
              yield* awaitActivation;
              const server = yield* HttpServer.HttpServer;
              const address = server.address;
              if (typeof address === "string" || !("port" in address)) {
                return null;
              }

              const localPort = address.port;
              return yield* ensureTailscaleServe({
                localPort,
                servePort: config.tailscaleServePort,
                localHost: "127.0.0.1",
              }).pipe(
                Effect.as({ localPort, servePort: config.tailscaleServePort }),
                Effect.tap(() =>
                  Effect.logInfo("Tailscale Serve configured", {
                    localPort,
                    servePort: config.tailscaleServePort,
                  }),
                ),
                Effect.catch((cause) =>
                  Effect.logWarning("Failed to configure Tailscale Serve", {
                    cause,
                    localPort,
                    servePort: config.tailscaleServePort,
                  }).pipe(Effect.as(null)),
                ),
              );
            }),
            (configured) =>
              configured
                ? disableTailscaleServe({ servePort: configured.servePort }).pipe(
                    Effect.tap(() =>
                      Effect.logInfo("Tailscale Serve disabled", {
                        servePort: configured.servePort,
                      }),
                    ),
                    Effect.catch((cause) =>
                      Effect.logWarning("Failed to disable Tailscale Serve", {
                        cause,
                        servePort: configured.servePort,
                      }),
                    ),
                  )
                : Effect.void,
          ),
        )
      : Layer.empty;
    const cloudDesiredLinkReconcileLayer = Layer.effectDiscard(
      Effect.gen(function* () {
        const releaseManagedTunnel = releaseManagedTunnelOnShutdown().pipe(
          Effect.timeout("10 seconds"),
          Effect.tap((released) =>
            released ? Effect.logInfo("Released the managed tunnel on shutdown") : Effect.void,
          ),
          Effect.catchCause((cause) =>
            Effect.logWarning(
              "Failed to release the managed tunnel on shutdown; the next link reuses it",
              { errors: Cause.prettyErrors(cause).map((error) => error.message) },
            ),
          ),
          Effect.asVoid,
        );
        // A launcher trial can be stopped before activation. The previous
        // server is already gone, so the trial owns cleanup immediately; the
        // pending-state check keeps the tunnel for normal commit or rollback,
        // while the launcher's explicit-stop marker allows it to be released.
        // Other runtimes wait for activation so a failed standby cannot tear
        // down the active runtime's tunnel.
        const cleanupBeforeActivation = yield* pendingServiceUpdateExists;
        if (cleanupBeforeActivation) {
          yield* Effect.addFinalizer(() => releaseManagedTunnel);
        }
        yield* forkParked(
          Effect.gen(function* () {
            if (!cleanupBeforeActivation) {
              yield* Effect.addFinalizer(() => releaseManagedTunnel);
            }
            const server = yield* HttpServer.HttpServer;
            const address = server.address;
            if (typeof address === "string" || !("port" in address)) return;
            const localOrigin = `http://127.0.0.1:${address.port}`;
            const endpointRuntime = yield* CloudManagedEndpointRuntime.CloudManagedEndpointRuntime;
            const recoveryLock = yield* Semaphore.make(1);
            let lastRecoveryAtMillis = 0;
            const recoverManagedTunnel = (config: RelayManagedEndpointRuntimeConfig) =>
              recoveryLock.withPermits(1)(
                Effect.gen(function* () {
                  const elapsed = (yield* Clock.currentTimeMillis) - lastRecoveryAtMillis;
                  const wait = Duration.toMillis(MANAGED_TUNNEL_RECOVERY_COOLDOWN) - elapsed;
                  if (wait > 0) yield* Effect.sleep(Duration.millis(wait));
                  lastRecoveryAtMillis = yield* Clock.currentTimeMillis;
                }).pipe(
                  Effect.andThen(
                    recoverManagedCloudTunnel(localOrigin, config, {
                      retryRuntimeFailures: true,
                    }),
                  ),
                  Effect.retry({
                    while: (error) =>
                      shouldRetryCloudLink(error) &&
                      error._tag !== "EnvironmentCloudEndpointUnavailableError",
                    schedule: Schedule.exponential("1 second").pipe(
                      Schedule.modifyDelay(({ duration }) =>
                        Effect.succeed(Duration.min(duration, Duration.seconds(30))),
                      ),
                      Schedule.jittered,
                    ),
                  }),
                  Effect.tap((recovered) =>
                    recovered ? Effect.logInfo("T3 Connect managed tunnel recovered") : Effect.void,
                  ),
                  Effect.catchCause((cause) =>
                    Cause.hasInterrupts(cause)
                      ? Effect.interrupt
                      : Effect.logWarning("Failed to recover the T3 Connect managed tunnel", {
                          cause,
                        }),
                  ),
                ),
              );
            yield* endpointRuntime.recoveryRequests.pipe(
              Stream.runForEach(recoverManagedTunnel),
              Effect.forkScoped,
            );
            // No settling delay before the first attempt: routes are already
            // serving by the time activation opens this gate (the startup
            // sequence awaits routesReady), and the retry schedule below
            // covers anything this sleep used to hedge against. Every
            // millisecond here is dead time on the path to remote
            // reachability after a restart.
            const wantsCliLink = hasCloudPublicConfig
              ? yield* CloudCliState.readCliDesiredCloudLink.pipe(
                  Effect.catch((cause) =>
                    Effect.logWarning("Failed to read the desired T3 Connect link", { cause }).pipe(
                      Effect.as(false),
                    ),
                  ),
                )
              : false;
            const startedConfirmed = yield* startManagedCloudTunnelIfOriginConfirmed(
              localOrigin,
            ).pipe(
              Effect.catch((cause) =>
                Effect.logWarning("Failed to start the confirmed T3 Connect tunnel", {
                  cause,
                }).pipe(Effect.as(false)),
              ),
            );
            const startStoredManagedTunnel = startManagedCloudTunnelIfOriginConfirmed(localOrigin, {
              requireConfirmedOrigin: false,
            }).pipe(
              Effect.tap((started) =>
                started
                  ? Effect.logWarning(
                      "T3 Connect started the stored tunnel without relay confirmation",
                    )
                  : Effect.void,
              ),
              Effect.catch((cause) =>
                Effect.logWarning("Failed to start the stored T3 Connect tunnel", { cause }),
              ),
              Effect.asVoid,
            );
            const registerManagedTunnel = retryManagedTunnelRegistration(
              registerManagedCloudTunnelRecovery(localOrigin, {
                retryRuntimeFailures: true,
              }),
              (error) =>
                shouldRetryCloudLink(error) &&
                error._tag !== "EnvironmentCloudEndpointUnavailableError",
              startedConfirmed ? Effect.void : startStoredManagedTunnel,
            ).pipe(
              Effect.tap((result) =>
                result.status === "ready"
                  ? Effect.logInfo("T3 Connect managed tunnel recovery registered")
                  : Effect.void,
              ),
              Effect.catchCause((cause) =>
                Cause.hasInterrupts(cause)
                  ? Effect.interrupt
                  : Effect.logWarning("Failed to register T3 Connect managed tunnel recovery", {
                      cause,
                    }).pipe(Effect.as({ status: "unavailable" as const })),
              ),
            );
            // A host without a confirmed marker is on its first boot after the
            // upgrade. Spread those registrations so an auto-update wave does
            // not hit the relay all at once.
            if (!startedConfirmed) {
              const jitter = yield* Random.nextIntBetween(
                0,
                Duration.toMillis(MANAGED_TUNNEL_FIRST_REGISTRATION_JITTER),
              );
              yield* Effect.sleep(Duration.millis(jitter));
            }
            const registration = yield* registerManagedTunnel;
            // A terminal registration failure also allows the stored config
            // to start. Transient outages use the fallback above and keep
            // registration retrying in this scoped startup fiber.
            if (registration.status === "unavailable" && !startedConfirmed) {
              yield* startStoredManagedTunnel;
            }
            const startupAction = managedTunnelStartupAction({ wantsCliLink, registration });
            if (startupAction.action === "request_recovery") {
              yield* endpointRuntime.requestRecovery(startupAction.config);
            }
            if (startupAction.action === "reconcile_link") {
              const reconciled = yield* reconcileDesiredCloudLinkIfStillDesired(localOrigin).pipe(
                Effect.retry({
                  while: shouldRetryCloudLink,
                  schedule: Schedule.exponential("1 second").pipe(
                    Schedule.modifyDelay(({ duration }) =>
                      Effect.succeed(Duration.min(duration, Duration.seconds(30))),
                    ),
                    Schedule.upTo({ duration: "10 minutes" }),
                  ),
                }),
                Effect.tap((linked) =>
                  linked
                    ? Effect.logInfo("T3 Connect desired link reconciled on startup")
                    : Effect.void,
                ),
                Effect.catch((cause) =>
                  Effect.logWarning("Failed to reconcile T3 Connect desired link on startup", {
                    cause,
                  }).pipe(Effect.as(false)),
                ),
              );
              if (reconciled) {
                const afterReconcile = yield* registerManagedTunnel;
                if (afterReconcile.status === "recovery_required") {
                  yield* endpointRuntime.requestRecovery(afterReconcile.config);
                }
              }
            }
          }),
        );
        yield* Deferred.succeed(cloudLinkParked, undefined).pipe(Effect.orDie);
      }),
    );

    const runtimeServicesLive = ServerRuntimeStartup.layerWithOptions({
      activate: Deferred.succeed(activation, undefined).pipe(Effect.asVoid),
      abort: (error) => Deferred.die(activation, error).pipe(Effect.asVoid),
      awaitAuxiliaryParked: Effect.all(
        [
          Deferred.await(runtimeStateParked),
          Deferred.await(cloudLinkParked),
          Deferred.await(routesReady),
          ...(config.tailscaleServeEnabled ? [Deferred.await(tailscaleParked)] : []),
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.asVoid),
    }).pipe(Layer.provideMerge(RuntimeDependenciesLive), Layer.provide(launcherLayer));

    const routesLayer = HttpRouter.serve(makeRoutesLayer.pipe(Layer.provide(launcherLayer)), {
      disableLogger: !config.logWebSocketEvents,
    }).pipe(Layer.tap(() => Deferred.succeed(routesReady, undefined).pipe(Effect.orDie)));
    const serverApplicationLayer = Layer.mergeAll(
      routesLayer,
      httpListeningLayer,
      runtimeStateLayer.pipe(Layer.provide(launcherLayer)),
      tailscaleServeLayer,
      cloudDesiredLinkReconcileLayer,
      HeapSnapshot.layer,
    );

    return serverApplicationLayer.pipe(
      Layer.provideMerge(runtimeServicesLive),
      Layer.provide(activationLayer),
      Layer.provideMerge(serverRelayBrokerTracingLayer),
      Layer.provideMerge(HttpServerLive),
      Layer.provide(ApplicationObservabilityLive),
      Layer.provideMerge(FetchHttpClient.layer),
      Layer.provideMerge(NodeServices.layer),
    );
  }),
);

// The CLI supplies configuration.
export const runServer = Layer.launch(makeServerLayer);
