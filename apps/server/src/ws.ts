import {
  AuthAccessStreamError,
  type AuthAccessStreamEvent,
  type AuthEnvironmentScope,
  type AuthSessionId,
  ClientConnectionMethod,
  ClientDeviceType,
  ClientOs,
  ClientSurface,
  ClientWebDeployment,
  EnvironmentAuthorizationError,
  ORCHESTRATION_PROTOCOL_QUERY_PARAM,
  ORCHESTRATION_PROTOCOL_VERSION,
  type ProviderInstanceId,
  ProviderSetupError,
  RelayClientInstallFailedError,
  type RelayClientInstallProgressEvent,
  RpcClientId,
  ServerSelfUpdateError,
  type ServerLifecycleStreamEvent,
  type ServerSelfUpdateProgressEvent,
  WS_METHODS,
  WsRpcGroup,
} from "@t3tools/contracts";
import * as RelayClient from "@t3tools/shared/relayClient";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerRespondable,
  HttpServerResponse,
} from "effect/unstable/http";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";

import { AgentService } from "./agent/AgentService.ts";
import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import { failEnvironmentAuthInvalid, failEnvironmentInternal } from "./auth/http.ts";
import * as PairingGrantStore from "./auth/PairingGrantStore.ts";
import { requiredScopeForRpcMethod } from "./auth/RpcAuthorization.ts";
import * as SessionStore from "./auth/SessionStore.ts";
import * as BackgroundPolicy from "./background/BackgroundPolicy.ts";
import * as ServerSelfUpdate from "./cloud/selfUpdate.ts";
import * as ServerConfig from "./config.ts";
import * as ProcessDiagnostics from "./diagnostics/ProcessDiagnostics.ts";
import * as TraceDiagnostics from "./diagnostics/TraceDiagnostics.ts";
import * as ServerEnvironment from "./environment/ServerEnvironment.ts";
import * as EnvironmentTheme from "./environmentTheme.ts";
import * as Keybindings from "./keybindings.ts";
import { NotesService } from "./notes/NotesService.ts";
import {
  observeRpcEffect as instrumentRpcEffect,
  observeRpcStream as instrumentRpcStream,
  observeRpcStreamEffect as instrumentRpcStreamEffect,
} from "./observability/RpcInstrumentation.ts";
import { subscribeCodexAuthCallback } from "./provider/CodexAuthCallback.ts";
import { subscribeChatGptHandoff } from "./provider/CodexChatGptHandoff.ts";
import * as ModelManifest from "./provider/ModelManifest.ts";
import { makeProviderInstallation } from "./provider/providerInstallation.ts";
import * as ProviderMaintenance from "./provider/providerMaintenance.ts";
import * as ProviderMaintenanceRunner from "./provider/providerMaintenanceRunner.ts";
import { ProviderAuthService } from "./provider/Services/ProviderAuthService.ts";
import * as ProviderInstanceRegistry from "./provider/Services/ProviderInstanceRegistry.ts";
import * as ProviderRegistry from "./provider/Services/ProviderRegistry.ts";
import { rpcInitialItems } from "./rpcInitialItems.ts";
import * as ServerLifecycleEvents from "./serverLifecycleEvents.ts";
import * as ServerSettings from "./serverSettings.ts";
import * as AnalyticsService from "./telemetry/AnalyticsService.ts";

const PROVIDER_STATUS_DEBOUNCE_MS = 200;

function toAuthAccessStreamEvent(
  change: PairingGrantStore.BootstrapCredentialChange | SessionStore.SessionCredentialChange,
  revision: number,
  currentSessionId: AuthSessionId,
): AuthAccessStreamEvent {
  switch (change.type) {
    case "pairingLinkUpserted":
      return {
        version: 1,
        revision,
        type: "pairingLinkUpserted",
        payload: change.pairingLink,
      };
    case "pairingLinkRemoved":
      return {
        version: 1,
        revision,
        type: "pairingLinkRemoved",
        payload: { id: change.id },
      };
    case "clientUpserted":
      return {
        version: 1,
        revision,
        type: "clientUpserted",
        payload: {
          ...change.clientSession,
          current: change.clientSession.sessionId === currentSessionId,
        },
      };
    case "clientRemoved":
      return {
        version: 1,
        revision,
        type: "clientRemoved",
        payload: { sessionId: change.sessionId },
      };
  }
}

const isClientSurface = Schema.is(ClientSurface);
const isClientConnectionMethod = Schema.is(ClientConnectionMethod);
const isClientDeviceType = Schema.is(ClientDeviceType);
const isClientOs = Schema.is(ClientOs);
const isClientWebDeployment = Schema.is(ClientWebDeployment);
const MAX_CLIENT_APP_VERSION_LENGTH = 64;
const MAX_CLIENT_BROWSER_LENGTH = 64;
const MAX_CLIENT_DEVICE_MODEL_LENGTH = 80;

/** Clients announce the wire protocol they speak on the `/ws` upgrade URL. */
export function hasCompatibleOrchestrationProtocol(url: URL): boolean {
  return (
    url.searchParams.get(ORCHESTRATION_PROTOCOL_QUERY_PARAM) ===
    String(ORCHESTRATION_PROTOCOL_VERSION)
  );
}

// Optional client identity announced on the /ws upgrade URL next to wsTicket.
// Lenient by design: absent or malformed values degrade to {} so a connection
// never fails over attribution metadata.
function readClientConnectionOrigin(request: HttpServerRequest.HttpServerRequest): {
  readonly surface?: ClientSurface;
  readonly appVersion?: string;
} {
  const url = HttpServerRequest.toURL(request);
  if (Option.isNone(url)) {
    return {};
  }
  const surface = url.value.searchParams.get("clientSurface");
  const appVersion = url.value.searchParams.get("clientAppVersion")?.trim() ?? "";
  return {
    ...(isClientSurface(surface) ? { surface } : {}),
    ...(appVersion !== "" && appVersion.length <= MAX_CLIENT_APP_VERSION_LENGTH
      ? { appVersion }
      : {}),
  };
}

// Client telemetry stays in this socket's RPC layer. It must not become a
// server-global "current client" because several client types can connect at once.
function readClientAnalyticsProps(request: HttpServerRequest.HttpServerRequest) {
  const url = HttpServerRequest.toURL(request);
  if (Option.isNone(url)) {
    return {};
  }

  const surface = url.value.searchParams.get("clientSurface");
  const appVersion = url.value.searchParams.get("clientAppVersion")?.trim() ?? "";
  const deviceType = url.value.searchParams.get("clientDeviceType");
  const os = url.value.searchParams.get("clientOs");
  const webDeployment = url.value.searchParams.get("clientWebDeployment");
  const browser = url.value.searchParams.get("clientBrowser")?.trim() ?? "";
  const connectionMethod = url.value.searchParams.get("connectionMethod");
  const rawOsMajorVersion = url.value.searchParams.get("clientOsMajorVersion") ?? "";
  const osMajorVersion = Number(rawOsMajorVersion);
  const deviceModel = url.value.searchParams.get("clientDeviceModel")?.trim() ?? "";
  const isMobile = surface === "mobile";
  const hasOsMajorVersion =
    isMobile && rawOsMajorVersion !== "" && Number.isInteger(osMajorVersion) && osMajorVersion > 0;
  const hasDeviceModel =
    isMobile && deviceModel !== "" && deviceModel.length <= MAX_CLIENT_DEVICE_MODEL_LENGTH;

  return {
    ...(isClientSurface(surface) ? { surface } : {}),
    ...(appVersion !== "" && appVersion.length <= MAX_CLIENT_APP_VERSION_LENGTH
      ? { appVersion, clientAppVersion: appVersion }
      : {}),
    ...(isClientOs(os)
      ? {
          clientOs: os,
          ...(isMobile && (os === "iOS" || os === "Android") ? { os } : {}),
        }
      : {}),
    ...(isClientDeviceType(deviceType) ? { clientDeviceType: deviceType } : {}),
    ...(surface === "web" && isClientWebDeployment(webDeployment) ? { webDeployment } : {}),
    ...(surface === "web" && browser !== "" && browser.length <= MAX_CLIENT_BROWSER_LENGTH
      ? { clientBrowser: browser }
      : {}),
    ...(hasOsMajorVersion ? { osMajorVersion, clientOsMajorVersion: osMajorVersion } : {}),
    ...(hasDeviceModel ? { deviceModel, clientDeviceModel: deviceModel } : {}),
    ...(isClientConnectionMethod(connectionMethod) ? { connectionMethod } : {}),
  };
}

const makeWsRpcLayer = (currentSession: EnvironmentAuth.AuthenticatedSession) =>
  WsRpcGroup.toLayer(
    Effect.gen(function* () {
      const currentSessionId = currentSession.sessionId;
      const config = yield* ServerConfig.ServerConfig;
      const keybindings = yield* Keybindings.Keybindings;
      const environmentTheme = yield* EnvironmentTheme.EnvironmentThemeService;
      const providerRegistry = yield* ProviderRegistry.ProviderRegistry;
      const providerInstances = yield* ProviderInstanceRegistry.ProviderInstanceRegistry;
      const modelManifest = yield* ModelManifest.ModelManifest;
      const providerVersionCache = yield* ProviderMaintenance.ProviderVersionCache;
      const providerMaintenanceRunner = yield* ProviderMaintenanceRunner.ProviderMaintenanceRunner;
      const providerAuth = yield* ProviderAuthService;
      const providerInstallation = yield* makeProviderInstallation();
      const serverSelfUpdate = yield* ServerSelfUpdate.ServerSelfUpdate;
      const lifecycleEvents = yield* ServerLifecycleEvents.ServerLifecycleEvents;
      const serverSettings = yield* ServerSettings.ServerSettingsService;
      const serverEnvironment = yield* ServerEnvironment.ServerEnvironment;
      const backgroundPolicy = yield* BackgroundPolicy.BackgroundPolicy;
      const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
      const bootstrapCredentials = yield* PairingGrantStore.PairingGrantStore;
      const sessions = yield* SessionStore.SessionStore;
      const processDiagnostics = yield* ProcessDiagnostics.ProcessDiagnostics;
      const relayClient = yield* RelayClient.RelayClient;
      const agent = yield* AgentService;
      const notes = yield* NotesService;
      // Handoff and callback streams need the connection's platform services.
      const handoffContext =
        yield* Effect.context<Effect.Services<ReturnType<typeof subscribeChatGptHandoff>>>();

      const rpcClientIds = yield* Ref.make(new Set<RpcClientId>());
      yield* Effect.addFinalizer(() =>
        Ref.get(rpcClientIds).pipe(
          Effect.flatMap((clientIds) =>
            Effect.forEach(
              clientIds,
              (clientId) => backgroundPolicy.removeRpcClient(currentSessionId, clientId),
              { discard: true },
            ),
          ),
          Effect.ignore,
        ),
      );

      const authorizationError = (requiredScope: AuthEnvironmentScope) =>
        new EnvironmentAuthorizationError({
          message: `The authenticated token is missing required scope: ${requiredScope}.`,
          requiredScope,
        });
      const authorizeEffect = <A, E, R>(
        requiredScope: AuthEnvironmentScope,
        effect: Effect.Effect<A, E, R>,
      ): Effect.Effect<A, E | EnvironmentAuthorizationError, R> =>
        currentSession.scopes.includes(requiredScope)
          ? effect
          : Effect.fail(authorizationError(requiredScope));
      const authorizeStream = <A, E, R>(
        requiredScope: AuthEnvironmentScope,
        stream: Stream.Stream<A, E, R>,
      ): Stream.Stream<A, E | EnvironmentAuthorizationError, R> =>
        currentSession.scopes.includes(requiredScope)
          ? stream
          : Stream.fail(authorizationError(requiredScope));

      // Every handler goes through one of these, so each method is authorized
      // against `RPC_REQUIRED_SCOPES` and traced.
      const observeRpcEffect = <A, E, R>(
        method: string,
        effect: Effect.Effect<A, E, R>,
        traceAttributes?: Readonly<Record<string, unknown>>,
      ) =>
        instrumentRpcEffect(
          method,
          authorizeEffect(requiredScopeForRpcMethod(method), effect),
          traceAttributes,
        );
      const observeRpcStream = <A, E, R>(
        method: string,
        stream: Stream.Stream<A, E, R>,
        traceAttributes?: Readonly<Record<string, unknown>>,
      ) =>
        instrumentRpcStream(
          method,
          authorizeStream(requiredScopeForRpcMethod(method), stream),
          traceAttributes,
        );
      const observeRpcStreamEffect = <A, StreamError, StreamContext, EffectError, EffectContext>(
        method: string,
        effect: Effect.Effect<
          Stream.Stream<A, StreamError, StreamContext>,
          EffectError,
          EffectContext
        >,
        traceAttributes?: Readonly<Record<string, unknown>>,
      ) =>
        instrumentRpcStreamEffect(
          method,
          authorizeEffect(requiredScopeForRpcMethod(method), effect),
          traceAttributes,
        );

      const loadAuthAccessSnapshot = () =>
        Effect.all({
          pairingLinks: serverAuth.listPairingLinks(),
          clientSessions: serverAuth.listClientSessions(currentSessionId),
        }).pipe(Effect.mapError((error) => new AuthAccessStreamError({ message: error.message })));

      const loadServerConfig = Effect.gen(function* () {
        const keybindingsConfig = yield* keybindings.loadConfigState;
        return {
          environment: yield* serverEnvironment.getDescriptor,
          auth: yield* serverAuth.getDescriptor(),
          cwd: config.cwd,
          keybindingsConfigPath: config.keybindingsConfigPath,
          keybindings: keybindingsConfig.keybindings,
          issues: keybindingsConfig.issues,
          providers: yield* providerRegistry.getProviders,
          observability: {
            logsDirectoryPath: config.logsDir,
            localTracingEnabled: true,
            ...(config.otlpTracesUrl !== undefined ? { otlpTracesUrl: config.otlpTracesUrl } : {}),
            otlpTracesEnabled: config.otlpTracesUrl !== undefined,
            ...(config.otlpMetricsUrl !== undefined
              ? { otlpMetricsUrl: config.otlpMetricsUrl }
              : {}),
            otlpMetricsEnabled: config.otlpMetricsUrl !== undefined,
            ...(config.otlpLogsUrl !== undefined ? { otlpLogsUrl: config.otlpLogsUrl } : {}),
            otlpLogsEnabled: config.otlpLogsUrl !== undefined,
          },
          settings: ServerSettings.redactServerSettingsForClient(yield* serverSettings.getSettings),
        };
      });

      const refreshProviders = Effect.fn("ws.server.refreshProviders")(function* (input: {
        readonly instanceId?: ProviderInstanceId | undefined;
        readonly cwd?: string | undefined;
        readonly refreshModels?: boolean | undefined;
      }) {
        const targets = (yield* providerInstances.listInstances).filter(
          (instance) => input.instanceId === undefined || input.instanceId === instance.instanceId,
        );
        // Only explicit catalog refreshes bypass the caches; background status
        // checks keep their timers.
        if (input.refreshModels) {
          yield* modelManifest.forceRefresh;
          yield* Effect.forEach(
            targets,
            (instance) =>
              Effect.gen(function* () {
                yield* instance.invalidateCaches ?? Effect.void;
                const maintenance = yield* instance.snapshot.resolveMaintenance({ fresh: true });
                if (maintenance.packageName) providerVersionCache.delete(maintenance.packageName);
              }),
            { concurrency: "unbounded", discard: true },
          );
        }
        let providers = yield* input.cwd !== undefined && input.instanceId !== undefined
          ? providerRegistry.refreshWorkspaceSnapshot({
              instanceId: input.instanceId,
              cwd: input.cwd,
            })
          : input.instanceId !== undefined
            ? providerRegistry.refreshInstance(input.instanceId)
            : providerRegistry.refresh();
        if (input.refreshModels) {
          for (const instance of targets) {
            const ready = providers.some(
              (provider) =>
                provider.instanceId === instance.instanceId &&
                provider.enabled &&
                provider.installed,
            );
            if (!instance.refreshModels || !ready) continue;
            yield* instance.refreshModels().pipe(
              Effect.mapError(
                (error) =>
                  new ProviderSetupError({
                    instanceId: instance.instanceId,
                    operation: "refresh-models",
                    detail: error.detail,
                  }),
              ),
            );
            providers = yield* providerRegistry.refreshInstance(instance.instanceId);
          }
        }
        return { providers };
      });

      const subscribeServerConfig = (input: { readonly environmentThemes?: boolean | undefined }) =>
        Effect.gen(function* () {
          const current = yield* loadServerConfig;
          const keybindingsUpdates = keybindings.streamChanges.pipe(
            Stream.map((event) => ({
              version: 1 as const,
              type: "keybindingsUpdated" as const,
              payload: { keybindings: event.keybindings, issues: event.issues },
            })),
          );
          const providerStatuses = providerRegistry.streamChanges.pipe(
            // The registry replays nothing, but a refresh can land between the
            // snapshot and the subscription; compare against the snapshot the
            // client already holds rather than dropping blindly.
            (updates) => Stream.concat(rpcInitialItems([current.providers]), updates),
            Stream.changesWith(
              (previous, next) => JSON.stringify(previous) === JSON.stringify(next),
            ),
            Stream.drop(1),
            Stream.map((providers) => ({
              version: 1 as const,
              type: "providerStatuses" as const,
              payload: { providers },
            })),
            Stream.debounce(Duration.millis(PROVIDER_STATUS_DEBOUNCE_MS)),
          );
          // Themes are never in the snapshot: the stream emits the current set
          // first. Gated on the subscriber's flag because a client that does
          // not know the event would fail its whole config subscription.
          const environmentThemeUpdates =
            input.environmentThemes === true
              ? environmentTheme.streamChanges.pipe(
                  Stream.map((themes) => ({
                    version: 1 as const,
                    type: "environmentThemesUpdated" as const,
                    payload: { themes },
                  })),
                )
              : Stream.empty;
          const settingsUpdates = serverSettings.streamChanges.pipe(
            Stream.map((settings) => ({
              version: 1 as const,
              type: "settingsUpdated" as const,
              payload: { settings: ServerSettings.redactServerSettingsForClient(settings) },
            })),
          );

          return Stream.concat(
            rpcInitialItems([{ version: 1 as const, type: "snapshot" as const, config: current }]),
            keybindingsUpdates.pipe(
              Stream.merge(providerStatuses),
              Stream.merge(settingsUpdates),
              Stream.merge(environmentThemeUpdates),
            ),
          );
        });

      const subscribeServerLifecycle = Effect.gen(function* () {
        const liveBuffer = yield* Queue.unbounded<ServerLifecycleStreamEvent>();
        yield* Effect.forkScoped(
          lifecycleEvents.stream.pipe(Stream.runForEach((event) => Queue.offer(liveBuffer, event))),
          { startImmediately: true },
        );
        const snapshot = yield* lifecycleEvents.snapshot;
        const snapshotEvents = Array.from(snapshot.events).toSorted(
          (left, right) => left.sequence - right.sequence,
        );
        const liveEvents = Stream.fromQueue(liveBuffer).pipe(
          Stream.filter((event) => event.sequence > snapshot.sequence),
        );
        return Stream.concat(rpcInitialItems(snapshotEvents), liveEvents);
      });

      const subscribeAuthAccess = Effect.gen(function* () {
        const initialSnapshot = yield* loadAuthAccessSnapshot();
        const revisionRef = yield* Ref.make(1);
        const accessChanges: Stream.Stream<
          PairingGrantStore.BootstrapCredentialChange | SessionStore.SessionCredentialChange
        > = Stream.merge(bootstrapCredentials.streamChanges, sessions.streamChanges);
        const liveEvents: Stream.Stream<AuthAccessStreamEvent> = accessChanges.pipe(
          Stream.mapEffect((change) =>
            Ref.updateAndGet(revisionRef, (revision) => revision + 1).pipe(
              Effect.map((revision) => toAuthAccessStreamEvent(change, revision, currentSessionId)),
            ),
          ),
        );
        return Stream.concat(
          rpcInitialItems([
            {
              version: 1 as const,
              revision: 1,
              type: "snapshot" as const,
              payload: initialSnapshot,
            },
          ]),
          liveEvents,
        );
      });

      const updateServerWithProgress = (input: Parameters<typeof serverSelfUpdate.update>[0]) =>
        Stream.callback<ServerSelfUpdateProgressEvent, ServerSelfUpdateError>((queue) =>
          serverSelfUpdate
            .update(input, (stage) =>
              Queue.offer(queue, { type: "progress", stage }).pipe(Effect.asVoid),
            )
            .pipe(
              Effect.flatMap((result) => Queue.offer(queue, { type: "complete", result })),
              Effect.catchTags({ ServerSelfUpdateError: (error) => Queue.fail(queue, error) }),
              Effect.andThen(Queue.end(queue)),
              Effect.forkScoped,
            ),
        );

      const installRelayClient = Stream.callback<
        RelayClientInstallProgressEvent,
        RelayClientInstallFailedError
      >((queue) =>
        relayClient
          .installWithProgress((event) => Queue.offer(queue, event).pipe(Effect.asVoid))
          .pipe(
            Effect.flatMap((status) => Queue.offer(queue, { type: "complete", status })),
            Effect.catchTag("RelayClientInstallError", (error) =>
              Queue.fail(
                queue,
                new RelayClientInstallFailedError({ reason: error.reason, message: error.message }),
              ),
            ),
            Effect.andThen(Queue.end(queue)),
            Effect.forkScoped,
          ),
      );

      const server = { "rpc.aggregate": "server" } as const;
      const provider = { "rpc.aggregate": "provider" } as const;
      const cloud = { "rpc.aggregate": "cloud" } as const;
      const agentAggregate = { "rpc.aggregate": "agent" } as const;
      const notesAggregate = { "rpc.aggregate": "notes" } as const;

      return WsRpcGroup.of({
        // Server meta
        [WS_METHODS.serverProbe]: () =>
          observeRpcEffect(WS_METHODS.serverProbe, Effect.succeed({}), server),
        [WS_METHODS.serverGetConfig]: () =>
          observeRpcEffect(WS_METHODS.serverGetConfig, loadServerConfig, server),
        [WS_METHODS.serverRefreshProviders]: (input) =>
          observeRpcEffect(WS_METHODS.serverRefreshProviders, refreshProviders(input), server),
        [WS_METHODS.serverUpdateProvider]: (input) =>
          observeRpcEffect(
            WS_METHODS.serverUpdateProvider,
            providerMaintenanceRunner.updateProvider(input),
            server,
          ),
        [WS_METHODS.serverUpdateServer]: (input) =>
          observeRpcEffect(WS_METHODS.serverUpdateServer, serverSelfUpdate.update(input), server),
        [WS_METHODS.serverUpdateServerWithProgress]: (input) =>
          observeRpcStream(
            WS_METHODS.serverUpdateServerWithProgress,
            updateServerWithProgress(input),
            server,
          ),
        [WS_METHODS.serverUpsertKeybinding]: (rule) =>
          observeRpcEffect(
            WS_METHODS.serverUpsertKeybinding,
            keybindings
              .upsertKeybindingRule(rule)
              .pipe(Effect.map((resolved) => ({ keybindings: resolved, issues: [] }))),
            server,
          ),
        [WS_METHODS.serverRemoveKeybinding]: (rule) =>
          observeRpcEffect(
            WS_METHODS.serverRemoveKeybinding,
            keybindings
              .removeKeybindingRule(rule)
              .pipe(Effect.map((resolved) => ({ keybindings: resolved, issues: [] }))),
            server,
          ),
        [WS_METHODS.serverGetSettings]: () =>
          observeRpcEffect(
            WS_METHODS.serverGetSettings,
            serverSettings.getSettings.pipe(
              Effect.map(ServerSettings.redactServerSettingsForClient),
            ),
            server,
          ),
        [WS_METHODS.serverUpdateSettings]: ({ patch, providerInstanceMutation }) =>
          observeRpcEffect(
            WS_METHODS.serverUpdateSettings,
            (providerInstanceMutation === undefined
              ? serverSettings.updateSettings(patch)
              : serverSettings.updateProviderInstance(providerInstanceMutation, patch)
            ).pipe(Effect.map(ServerSettings.redactServerSettingsForClient)),
            server,
          ),
        [WS_METHODS.serverGetTraceDiagnostics]: () =>
          observeRpcEffect(
            WS_METHODS.serverGetTraceDiagnostics,
            TraceDiagnostics.readTraceDiagnostics({
              traceFilePath: config.serverTracePath,
              maxFiles: config.traceMaxFiles,
            }),
            server,
          ),
        [WS_METHODS.serverGetProcessDiagnostics]: () =>
          observeRpcEffect(WS_METHODS.serverGetProcessDiagnostics, processDiagnostics.read, server),
        [WS_METHODS.serverSignalProcess]: (input) =>
          observeRpcEffect(
            WS_METHODS.serverSignalProcess,
            processDiagnostics.signal(input),
            server,
          ),
        [WS_METHODS.serverReportClientActivity]: (input, metadata) =>
          Ref.update(rpcClientIds, (clientIds) =>
            new Set(clientIds).add(RpcClientId.make(metadata.client.id)),
          ).pipe(
            Effect.andThen(
              observeRpcEffect(
                WS_METHODS.serverReportClientActivity,
                backgroundPolicy.reportClientActivity(
                  currentSessionId,
                  RpcClientId.make(metadata.client.id),
                  input,
                ),
                server,
              ),
            ),
          ),
        [WS_METHODS.serverReportHostPowerState]: (input) =>
          observeRpcEffect(
            WS_METHODS.serverReportHostPowerState,
            backgroundPolicy.reportHostPowerState(input),
            server,
          ),
        [WS_METHODS.serverGetBackgroundPolicy]: () =>
          observeRpcEffect(WS_METHODS.serverGetBackgroundPolicy, backgroundPolicy.snapshot, server),

        // Provider setup
        [WS_METHODS.providerAuthStart]: (input) =>
          observeRpcEffect(
            WS_METHODS.providerAuthStart,
            providerAuth.start(input, currentSessionId),
            provider,
          ),
        [WS_METHODS.providerAuthRespond]: (input) =>
          observeRpcEffect(
            WS_METHODS.providerAuthRespond,
            providerAuth.respond(input, currentSessionId),
            provider,
          ),
        [WS_METHODS.providerAuthComplete]: (input) =>
          observeRpcEffect(
            WS_METHODS.providerAuthComplete,
            providerAuth.complete(input, currentSessionId),
            provider,
          ),
        [WS_METHODS.chatGptReconnectProfile]: (input) =>
          observeRpcEffect(
            WS_METHODS.chatGptReconnectProfile,
            providerAuth.reconnectProfile(input),
            provider,
          ),
        [WS_METHODS.chatGptImportProfile]: (input) =>
          observeRpcEffect(
            WS_METHODS.chatGptImportProfile,
            providerAuth.importProfile(input),
            provider,
          ),
        [WS_METHODS.chatGptHandoffSubscribe]: (input) =>
          observeRpcStream(
            WS_METHODS.chatGptHandoffSubscribe,
            subscribeChatGptHandoff(input, currentSessionId).pipe(
              Stream.provideContext(handoffContext),
            ),
            provider,
          ),
        [WS_METHODS.codexAuthCallbackSubscribe]: (input) =>
          observeRpcStream(
            WS_METHODS.codexAuthCallbackSubscribe,
            subscribeCodexAuthCallback(input),
            provider,
          ),
        [WS_METHODS.providerAuthCancel]: (input) =>
          observeRpcEffect(
            WS_METHODS.providerAuthCancel,
            providerAuth.cancel(input, currentSessionId),
            provider,
          ),
        [WS_METHODS.providerAuthLogout]: (input) =>
          observeRpcEffect(WS_METHODS.providerAuthLogout, providerAuth.logout(input), provider),
        [WS_METHODS.providerAuthSubscribe]: (input) =>
          observeRpcStream(
            WS_METHODS.providerAuthSubscribe,
            providerAuth.subscribe(input, currentSessionId),
            provider,
          ),
        [WS_METHODS.providerInstallStart]: (input) =>
          observeRpcEffect(
            WS_METHODS.providerInstallStart,
            providerInstallation.start(input),
            provider,
          ),
        [WS_METHODS.providerInstallCancel]: (input) =>
          observeRpcEffect(
            WS_METHODS.providerInstallCancel,
            providerInstallation.cancel(input),
            provider,
          ),
        [WS_METHODS.providerInstallSubscribe]: (input) =>
          observeRpcStream(
            WS_METHODS.providerInstallSubscribe,
            providerInstallation.subscribe(input),
            provider,
          ),
        [WS_METHODS.providerInstallRemove]: (input) =>
          observeRpcEffect(
            WS_METHODS.providerInstallRemove,
            providerInstallation.remove(input),
            provider,
          ),

        // Cloud
        [WS_METHODS.cloudGetRelayClientStatus]: () =>
          observeRpcEffect(WS_METHODS.cloudGetRelayClientStatus, relayClient.resolve, cloud),
        [WS_METHODS.cloudInstallRelayClient]: () =>
          observeRpcStream(WS_METHODS.cloudInstallRelayClient, installRelayClient, cloud),

        // Agent
        [WS_METHODS.agentCreateThread]: (input) =>
          observeRpcEffect(WS_METHODS.agentCreateThread, agent.createThread(input), agentAggregate),
        [WS_METHODS.agentUpdateThread]: (input) =>
          observeRpcEffect(WS_METHODS.agentUpdateThread, agent.updateThread(input), {
            ...agentAggregate,
            "agent.thread_id": input.threadId,
          }),
        [WS_METHODS.agentDeleteThread]: (input) =>
          observeRpcEffect(WS_METHODS.agentDeleteThread, agent.deleteThread(input.threadId), {
            ...agentAggregate,
            "agent.thread_id": input.threadId,
          }),
        [WS_METHODS.agentSendMessage]: (input) =>
          observeRpcEffect(WS_METHODS.agentSendMessage, agent.sendMessage(input), {
            ...agentAggregate,
            "agent.thread_id": input.threadId,
          }),
        [WS_METHODS.agentInterrupt]: (input) =>
          observeRpcEffect(WS_METHODS.agentInterrupt, agent.interrupt(input.threadId), {
            ...agentAggregate,
            "agent.thread_id": input.threadId,
          }),
        [WS_METHODS.agentRespondToRequest]: (input) =>
          observeRpcEffect(WS_METHODS.agentRespondToRequest, agent.respondToRequest(input), {
            ...agentAggregate,
            "agent.thread_id": input.threadId,
          }),
        [WS_METHODS.agentSubscribeThreads]: () =>
          observeRpcStream(WS_METHODS.agentSubscribeThreads, agent.streamThreads, agentAggregate),
        [WS_METHODS.agentSubscribeThread]: (input) =>
          observeRpcStream(WS_METHODS.agentSubscribeThread, agent.streamThread(input.threadId), {
            ...agentAggregate,
            "agent.thread_id": input.threadId,
          }),

        // Notes
        [WS_METHODS.notesCreate]: (input) =>
          observeRpcEffect(WS_METHODS.notesCreate, notes.create(input), notesAggregate),
        [WS_METHODS.notesUpdate]: (input) =>
          observeRpcEffect(WS_METHODS.notesUpdate, notes.update(input), notesAggregate),
        [WS_METHODS.notesDelete]: (input) =>
          observeRpcEffect(WS_METHODS.notesDelete, notes.remove(input.noteId), notesAggregate),
        [WS_METHODS.notesSubscribe]: () =>
          observeRpcStream(WS_METHODS.notesSubscribe, notes.stream, notesAggregate),

        // Subscriptions
        [WS_METHODS.subscribeServerConfig]: (input) =>
          observeRpcStreamEffect(
            WS_METHODS.subscribeServerConfig,
            subscribeServerConfig(input),
            server,
          ),
        [WS_METHODS.subscribeServerLifecycle]: () =>
          observeRpcStreamEffect(
            WS_METHODS.subscribeServerLifecycle,
            subscribeServerLifecycle,
            server,
          ),
        [WS_METHODS.subscribeAuthAccess]: () =>
          observeRpcStreamEffect(WS_METHODS.subscribeAuthAccess, subscribeAuthAccess, {
            "rpc.aggregate": "auth",
          }),
        [WS_METHODS.subscribeBackgroundPolicy]: () =>
          observeRpcStream(
            WS_METHODS.subscribeBackgroundPolicy,
            Stream.unwrap(
              Effect.map(backgroundPolicy.subscribe, ({ latest, changes }) =>
                Stream.concat(Stream.make(latest), changes),
              ),
            ),
            server,
          ),
      });
    }),
  );

export const websocketRpcRouteLayer = HttpRouter.add(
  "GET",
  "/ws",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const requestUrl = HttpServerRequest.toURL(request);
    if (Option.isNone(requestUrl) || !hasCompatibleOrchestrationProtocol(requestUrl.value)) {
      return HttpServerResponse.jsonUnsafe(
        {
          code: "orchestration_protocol_incompatible",
          message: `Update this client to one that supports orchestration protocol ${ORCHESTRATION_PROTOCOL_VERSION}.`,
          orchestrationProtocolVersion: ORCHESTRATION_PROTOCOL_VERSION,
        },
        { status: 426 },
      );
    }
    const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
    const sessions = yield* SessionStore.SessionStore;
    const analytics = yield* AnalyticsService.AnalyticsService;
    const session = yield* serverAuth.authenticateWebSocketUpgrade(request).pipe(
      Effect.catchIf(EnvironmentAuth.isServerAuthCredentialError, (error) =>
        failEnvironmentAuthInvalid(
          EnvironmentAuth.serverAuthCredentialReason(error),
          EnvironmentAuth.serverAuthDpopFailureReason(error),
        ),
      ),
      Effect.catchIf(EnvironmentAuth.isServerAuthInternalError, (error) =>
        failEnvironmentInternal("internal_error", error),
      ),
    );
    yield* sessions.recordClientConnection(session.sessionId, readClientConnectionOrigin(request));
    yield* analytics.record("client.connected", readClientAnalyticsProps(request));
    const rpcWebSocketHttpEffect = yield* Effect.gen(function* () {
      const { protocol, httpEffect } = yield* RpcServer.makeProtocolWithHttpEffectWebsocket;
      yield* RpcServer.make(WsRpcGroup, { disableTracing: true }).pipe(
        Effect.provideService(RpcServer.Protocol, protocol),
        Effect.forkScoped,
      );
      // @effect-diagnostics-next-line returnEffectInGen:off
      return httpEffect;
    }).pipe(
      Effect.provide(
        makeWsRpcLayer(session).pipe(
          Layer.provideMerge(RpcSerialization.layerJson),
          Layer.provide(ProviderMaintenanceRunner.layer),
        ),
      ),
    );
    return yield* Effect.acquireUseRelease(
      sessions.markConnected(session.sessionId),
      () => rpcWebSocketHttpEffect,
      () => sessions.markDisconnected(session.sessionId),
    );
  }).pipe(
    Effect.catchTags({
      EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
      EnvironmentInternalError: HttpServerRespondable.toResponse,
    }),
  ),
);
