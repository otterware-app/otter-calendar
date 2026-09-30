import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import {
  AgentCreateThreadInput,
  AgentError,
  AgentRespondToRequestInput,
  AgentSendMessageInput,
  AgentThreadEvent,
  AgentThreadListEvent,
  AgentThreadRefInput,
  AgentThreadSummary,
  AgentTurn,
  AgentUpdateThreadInput,
} from "./agent.ts";
import {
  AuthAccessStreamError,
  AuthAccessStreamEvent,
  EnvironmentAuthorizationError,
} from "./auth.ts";
import {
  BackgroundPolicySnapshot,
  ClientActivityReportInput,
  HostPowerSnapshot,
} from "./background.ts";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import { KeybindingsConfigError } from "./keybindings.ts";
import {
  CalendarAccountRefInput,
  CalendarAddDemoInput,
  CalendarApplyChangesInput,
  CalendarCreateEventInput,
  CalendarDeleteEventInput,
  CalendarDirectory,
  CalendarError,
  CalendarEventDetails,
  CalendarEventRefInput,
  CalendarMutationResult,
  CalendarPreferencesPatch,
  CalendarRespondInput,
  CalendarRestoreEventInput,
  CalendarSearchInput,
  CalendarSearchResult,
  CalendarSyncInput,
  CalendarUpdateCalendarInput,
  CalendarUpdateEventInput,
  CalendarWeekEvent,
  CalendarWeekInput,
  GoogleClientInput,
  GoogleConnectCompleteInput,
  GoogleConnectInput,
  GoogleConnectState,
} from "./calendar.ts";
import { ProviderInstanceId, ProviderInstanceMutation } from "./providerInstance.ts";
import {
  ChatGptHandoffInput,
  ChatGptHandoffState,
  ChatGptImportProfileInput,
  ChatGptReconnectProfile,
  ChatGptReconnectProfileInput,
  CodexAuthCallbackInput,
  CodexAuthCallbackState,
  ProviderAuthCancelInput,
  ProviderAuthCompleteInput,
  ProviderAuthRespondInput,
  ProviderAuthStartInput,
  ProviderAuthState,
  ProviderInstallCancelInput,
  ProviderInstallState,
  ProviderSetupError,
  ProviderSetupInput,
} from "./providerSetup.ts";
import {
  RelayClientInstallFailedError,
  RelayClientInstallProgressEventSchema,
  RelayClientStatusSchema,
} from "./relayClient.ts";
import {
  ServerConfig,
  ServerConfigStreamEvent,
  ServerLifecycleStreamEvent,
  ServerProcessDiagnosticsResult,
  ServerProviderUpdatedPayload,
  ServerProviderUpdateError,
  ServerProviderUpdateInput,
  ServerRemoveKeybindingInput,
  ServerRemoveKeybindingResult,
  ServerSelfUpdateError,
  ServerSelfUpdateInput,
  ServerSelfUpdateProgressEvent,
  ServerSelfUpdateResult,
  ServerSignalProcessInput,
  ServerSignalProcessResult,
  ServerTraceDiagnosticsResult,
  ServerUpsertKeybindingInput,
  ServerUpsertKeybindingResult,
} from "./server.ts";
import { ServerSettings, ServerSettingsError, ServerSettingsPatch } from "./settings.ts";

/**
 * Every WebSocket RPC method, by name. Clients and servers are versioned independently, so a
 * name, once shipped, keeps its meaning.
 */
export const WS_METHODS = {
  // Provider setup
  providerAuthStart: "provider.auth.start",
  providerAuthComplete: "provider.auth.complete",
  chatGptReconnectProfile: "provider.chatgpt.reconnect-profile",
  chatGptImportProfile: "provider.chatgpt.import-profile",
  chatGptHandoffSubscribe: "provider.chatgpt.handoff.subscribe",
  codexAuthCallbackSubscribe: "provider.codex.auth-callback.subscribe",
  providerAuthRespond: "provider.auth.respond",
  providerAuthCancel: "provider.auth.cancel",
  providerAuthLogout: "provider.auth.logout",
  providerAuthSubscribe: "provider.auth.subscribe",
  providerInstallStart: "provider.install.start",
  providerInstallCancel: "provider.install.cancel",
  providerInstallSubscribe: "provider.install.subscribe",
  providerInstallRemove: "provider.install.remove",

  // Server meta
  serverProbe: "server.probe",
  serverGetConfig: "server.getConfig",
  serverRefreshProviders: "server.refreshProviders",
  serverUpdateProvider: "server.updateProvider",
  serverUpdateServer: "server.updateServer",
  serverUpdateServerWithProgress: "server.updateServerWithProgress",
  serverUpsertKeybinding: "server.upsertKeybinding",
  serverRemoveKeybinding: "server.removeKeybinding",
  serverGetSettings: "server.getSettings",
  serverUpdateSettings: "server.updateSettings",
  serverGetTraceDiagnostics: "server.getTraceDiagnostics",
  serverGetProcessDiagnostics: "server.getProcessDiagnostics",
  serverSignalProcess: "server.signalProcess",
  serverReportClientActivity: "server.reportClientActivity",
  serverReportHostPowerState: "server.reportHostPowerState",
  serverGetBackgroundPolicy: "server.getBackgroundPolicy",

  // Cloud environment methods
  cloudGetRelayClientStatus: "cloud.getRelayClientStatus",
  cloudInstallRelayClient: "cloud.installRelayClient",

  // Agent
  agentCreateThread: "agent.createThread",
  agentUpdateThread: "agent.updateThread",
  agentDeleteThread: "agent.deleteThread",
  agentSendMessage: "agent.sendMessage",
  agentInterrupt: "agent.interrupt",
  agentRespondToRequest: "agent.respondToRequest",
  agentSubscribeThreads: "agent.subscribeThreads",
  agentSubscribeThread: "agent.subscribeThread",

  // Calendar
  calendarSubscribeDirectory: "calendar.subscribeDirectory",
  calendarSubscribeWeek: "calendar.subscribeWeek",
  calendarGetEvent: "calendar.getEvent",
  calendarSearch: "calendar.search",
  calendarCreateEvent: "calendar.createEvent",
  calendarUpdateEvent: "calendar.updateEvent",
  calendarDeleteEvent: "calendar.deleteEvent",
  calendarRespond: "calendar.respond",
  calendarRestoreEvent: "calendar.restoreEvent",
  calendarApplyChanges: "calendar.applyChanges",
  calendarUpdateCalendar: "calendar.updateCalendar",
  calendarUpdatePreferences: "calendar.updatePreferences",
  calendarSync: "calendar.sync",
  calendarRemoveAccount: "calendar.removeAccount",
  calendarAddDemo: "calendar.addDemo",
  calendarGoogleConnect: "calendar.google.connect",
  calendarGoogleConnectComplete: "calendar.google.connectComplete",
  calendarGoogleSetClient: "calendar.google.setClient",
  calendarGoogleClearClient: "calendar.google.clearClient",

  // Streaming subscriptions
  subscribeServerConfig: "subscribeServerConfig",
  subscribeServerLifecycle: "subscribeServerLifecycle",
  subscribeAuthAccess: "subscribeAuthAccess",
  subscribeBackgroundPolicy: "subscribeBackgroundPolicy",
} as const;

// ── Server meta ──────────────────────────────────────────────────────

const WsServerUpsertKeybindingRpc = Rpc.make(WS_METHODS.serverUpsertKeybinding, {
  payload: ServerUpsertKeybindingInput,
  success: ServerUpsertKeybindingResult,
  error: Schema.Union([KeybindingsConfigError, EnvironmentAuthorizationError]),
});

const WsServerRemoveKeybindingRpc = Rpc.make(WS_METHODS.serverRemoveKeybinding, {
  payload: ServerRemoveKeybindingInput,
  success: ServerRemoveKeybindingResult,
  error: Schema.Union([KeybindingsConfigError, EnvironmentAuthorizationError]),
});

const WsServerProbeRpc = Rpc.make(WS_METHODS.serverProbe, {
  payload: Schema.Struct({}),
  success: Schema.Struct({}),
  error: EnvironmentAuthorizationError,
});

const WsServerGetConfigRpc = Rpc.make(WS_METHODS.serverGetConfig, {
  payload: Schema.Struct({}),
  success: ServerConfig,
  error: Schema.Union([KeybindingsConfigError, ServerSettingsError, EnvironmentAuthorizationError]),
});

const WsServerRefreshProvidersRpc = Rpc.make(WS_METHODS.serverRefreshProviders, {
  payload: Schema.Struct({
    /**
     * When supplied, only refresh this specific provider instance. When
     * omitted, refresh all configured instances.
     */
    instanceId: Schema.optional(ProviderInstanceId),
    cwd: Schema.optional(TrimmedNonEmptyString),
    /** Explicit user request: bypass caches and rediscover models.
     * Background status refreshes must not open agent sessions. */
    refreshModels: Schema.optional(Schema.Boolean),
  }),
  success: ServerProviderUpdatedPayload,
  error: Schema.Union([EnvironmentAuthorizationError, ProviderSetupError]),
});

const WsServerUpdateProviderRpc = Rpc.make(WS_METHODS.serverUpdateProvider, {
  payload: ServerProviderUpdateInput,
  success: ServerProviderUpdatedPayload,
  error: Schema.Union([ServerProviderUpdateError, EnvironmentAuthorizationError]),
});

const WsServerUpdateServerRpc = Rpc.make(WS_METHODS.serverUpdateServer, {
  payload: ServerSelfUpdateInput,
  success: ServerSelfUpdateResult,
  error: Schema.Union([ServerSelfUpdateError, EnvironmentAuthorizationError]),
});

const WsServerUpdateServerWithProgressRpc = Rpc.make(WS_METHODS.serverUpdateServerWithProgress, {
  payload: ServerSelfUpdateInput,
  success: ServerSelfUpdateProgressEvent,
  error: Schema.Union([ServerSelfUpdateError, EnvironmentAuthorizationError]),
  stream: true,
});

const WsServerGetSettingsRpc = Rpc.make(WS_METHODS.serverGetSettings, {
  payload: Schema.Struct({}),
  success: ServerSettings,
  error: Schema.Union([ServerSettingsError, EnvironmentAuthorizationError]),
});

const WsServerUpdateSettingsRpc = Rpc.make(WS_METHODS.serverUpdateSettings, {
  payload: Schema.Struct({
    patch: ServerSettingsPatch,
    providerInstanceMutation: Schema.optionalKey(ProviderInstanceMutation),
  }),
  success: ServerSettings,
  error: Schema.Union([ServerSettingsError, EnvironmentAuthorizationError]),
});

const WsServerGetTraceDiagnosticsRpc = Rpc.make(WS_METHODS.serverGetTraceDiagnostics, {
  payload: Schema.Struct({}),
  success: ServerTraceDiagnosticsResult,
  error: EnvironmentAuthorizationError,
});

const WsServerGetProcessDiagnosticsRpc = Rpc.make(WS_METHODS.serverGetProcessDiagnostics, {
  payload: Schema.Struct({}),
  success: ServerProcessDiagnosticsResult,
  error: EnvironmentAuthorizationError,
});

const WsServerSignalProcessRpc = Rpc.make(WS_METHODS.serverSignalProcess, {
  payload: ServerSignalProcessInput,
  success: ServerSignalProcessResult,
  error: EnvironmentAuthorizationError,
});

const WsServerReportClientActivityRpc = Rpc.make(WS_METHODS.serverReportClientActivity, {
  payload: ClientActivityReportInput,
  error: EnvironmentAuthorizationError,
});

const WsServerReportHostPowerStateRpc = Rpc.make(WS_METHODS.serverReportHostPowerState, {
  payload: HostPowerSnapshot,
  error: EnvironmentAuthorizationError,
});

const WsServerGetBackgroundPolicyRpc = Rpc.make(WS_METHODS.serverGetBackgroundPolicy, {
  payload: Schema.Struct({}),
  success: BackgroundPolicySnapshot,
  error: EnvironmentAuthorizationError,
});

// ── Provider setup ───────────────────────────────────────────────────

const ProviderSetupRpcError = Schema.Union([ProviderSetupError, EnvironmentAuthorizationError]);

const WsProviderAuthStartRpc = Rpc.make(WS_METHODS.providerAuthStart, {
  payload: ProviderAuthStartInput,
  success: ProviderAuthState,
  error: ProviderSetupRpcError,
});

const WsProviderAuthRespondRpc = Rpc.make(WS_METHODS.providerAuthRespond, {
  payload: ProviderAuthRespondInput,
  success: ProviderAuthState,
  error: ProviderSetupRpcError,
});

const WsProviderAuthCompleteRpc = Rpc.make(WS_METHODS.providerAuthComplete, {
  payload: ProviderAuthCompleteInput,
  success: ProviderAuthState,
  error: ProviderSetupRpcError,
});

const WsChatGptReconnectProfileRpc = Rpc.make(WS_METHODS.chatGptReconnectProfile, {
  payload: ChatGptReconnectProfileInput,
  success: Schema.NullOr(ChatGptReconnectProfile),
  error: ProviderSetupRpcError,
});

const WsChatGptImportProfileRpc = Rpc.make(WS_METHODS.chatGptImportProfile, {
  payload: ChatGptImportProfileInput,
  success: ProviderAuthState,
  error: ProviderSetupRpcError,
});

const WsChatGptHandoffSubscribeRpc = Rpc.make(WS_METHODS.chatGptHandoffSubscribe, {
  payload: ChatGptHandoffInput,
  success: ChatGptHandoffState,
  error: ProviderSetupRpcError,
  stream: true,
});

const WsCodexAuthCallbackSubscribeRpc = Rpc.make(WS_METHODS.codexAuthCallbackSubscribe, {
  payload: CodexAuthCallbackInput,
  success: CodexAuthCallbackState,
  error: ProviderSetupRpcError,
  stream: true,
});

const WsProviderAuthCancelRpc = Rpc.make(WS_METHODS.providerAuthCancel, {
  payload: ProviderAuthCancelInput,
  success: ProviderAuthState,
  error: ProviderSetupRpcError,
});

const WsProviderAuthLogoutRpc = Rpc.make(WS_METHODS.providerAuthLogout, {
  payload: ProviderSetupInput,
  success: ProviderAuthState,
  error: ProviderSetupRpcError,
});

const WsProviderAuthSubscribeRpc = Rpc.make(WS_METHODS.providerAuthSubscribe, {
  payload: ProviderSetupInput,
  success: ProviderAuthState,
  error: ProviderSetupRpcError,
  stream: true,
});

const WsProviderInstallStartRpc = Rpc.make(WS_METHODS.providerInstallStart, {
  payload: ProviderSetupInput,
  success: ProviderInstallState,
  error: ProviderSetupRpcError,
});

const WsProviderInstallCancelRpc = Rpc.make(WS_METHODS.providerInstallCancel, {
  payload: ProviderInstallCancelInput,
  success: ProviderInstallState,
  error: ProviderSetupRpcError,
});

const WsProviderInstallSubscribeRpc = Rpc.make(WS_METHODS.providerInstallSubscribe, {
  payload: ProviderSetupInput,
  success: ProviderInstallState,
  error: ProviderSetupRpcError,
  stream: true,
});

const WsProviderInstallRemoveRpc = Rpc.make(WS_METHODS.providerInstallRemove, {
  payload: ProviderSetupInput,
  success: ProviderInstallState,
  error: ProviderSetupRpcError,
});

// ── Cloud ────────────────────────────────────────────────────────────

const WsCloudGetRelayClientStatusRpc = Rpc.make(WS_METHODS.cloudGetRelayClientStatus, {
  payload: Schema.Struct({}),
  success: RelayClientStatusSchema,
  error: EnvironmentAuthorizationError,
});

const WsCloudInstallRelayClientRpc = Rpc.make(WS_METHODS.cloudInstallRelayClient, {
  payload: Schema.Struct({}),
  success: RelayClientInstallProgressEventSchema,
  error: Schema.Union([RelayClientInstallFailedError, EnvironmentAuthorizationError]),
  stream: true,
});

// ── Agent ────────────────────────────────────────────────────────────

const AgentRpcError = Schema.Union([AgentError, EnvironmentAuthorizationError]);

const WsAgentCreateThreadRpc = Rpc.make(WS_METHODS.agentCreateThread, {
  payload: AgentCreateThreadInput,
  success: AgentThreadSummary,
  error: AgentRpcError,
});

const WsAgentUpdateThreadRpc = Rpc.make(WS_METHODS.agentUpdateThread, {
  payload: AgentUpdateThreadInput,
  success: AgentThreadSummary,
  error: AgentRpcError,
});

const WsAgentDeleteThreadRpc = Rpc.make(WS_METHODS.agentDeleteThread, {
  payload: AgentThreadRefInput,
  error: AgentRpcError,
});

/** Starts a turn, or steers the running one when the provider supports it. */
const WsAgentSendMessageRpc = Rpc.make(WS_METHODS.agentSendMessage, {
  payload: AgentSendMessageInput,
  success: AgentTurn,
  error: AgentRpcError,
});

const WsAgentInterruptRpc = Rpc.make(WS_METHODS.agentInterrupt, {
  payload: AgentThreadRefInput,
  error: AgentRpcError,
});

const WsAgentRespondToRequestRpc = Rpc.make(WS_METHODS.agentRespondToRequest, {
  payload: AgentRespondToRequestInput,
  error: AgentRpcError,
});

/** A snapshot of every thread's summary, then changes. */
const WsAgentSubscribeThreadsRpc = Rpc.make(WS_METHODS.agentSubscribeThreads, {
  payload: Schema.Struct({}),
  success: AgentThreadListEvent,
  error: AgentRpcError,
  stream: true,
});

/** A snapshot of one thread's detail, then changes. Ends after a `removed` event. */
const WsAgentSubscribeThreadRpc = Rpc.make(WS_METHODS.agentSubscribeThread, {
  payload: AgentThreadRefInput,
  success: AgentThreadEvent,
  error: AgentRpcError,
  stream: true,
});

// ── Calendar ─────────────────────────────────────────────────────────

const CalendarRpcError = Schema.Union([CalendarError, EnvironmentAuthorizationError]);

/** Accounts, calendars, preferences and the Google client state: a snapshot on every change. */
const WsCalendarSubscribeDirectoryRpc = Rpc.make(WS_METHODS.calendarSubscribeDirectory, {
  payload: Schema.Struct({}),
  success: CalendarDirectory,
  error: CalendarRpcError,
  stream: true,
});

/** One week chunk of visible instances: a snapshot, then changes. */
const WsCalendarSubscribeWeekRpc = Rpc.make(WS_METHODS.calendarSubscribeWeek, {
  payload: CalendarWeekInput,
  success: CalendarWeekEvent,
  error: CalendarRpcError,
  stream: true,
});

const WsCalendarGetEventRpc = Rpc.make(WS_METHODS.calendarGetEvent, {
  payload: CalendarEventRefInput,
  success: CalendarEventDetails,
  error: CalendarRpcError,
});

const WsCalendarSearchRpc = Rpc.make(WS_METHODS.calendarSearch, {
  payload: CalendarSearchInput,
  success: CalendarSearchResult,
  error: CalendarRpcError,
});

const WsCalendarCreateEventRpc = Rpc.make(WS_METHODS.calendarCreateEvent, {
  payload: CalendarCreateEventInput,
  success: CalendarMutationResult,
  error: CalendarRpcError,
});

const WsCalendarUpdateEventRpc = Rpc.make(WS_METHODS.calendarUpdateEvent, {
  payload: CalendarUpdateEventInput,
  success: CalendarMutationResult,
  error: CalendarRpcError,
});

const WsCalendarDeleteEventRpc = Rpc.make(WS_METHODS.calendarDeleteEvent, {
  payload: CalendarDeleteEventInput,
  success: CalendarMutationResult,
  error: CalendarRpcError,
});

const WsCalendarRespondRpc = Rpc.make(WS_METHODS.calendarRespond, {
  payload: CalendarRespondInput,
  success: CalendarMutationResult,
  error: CalendarRpcError,
});

const WsCalendarRestoreEventRpc = Rpc.make(WS_METHODS.calendarRestoreEvent, {
  payload: CalendarRestoreEventInput,
  success: CalendarMutationResult,
  error: CalendarRpcError,
});

/** Runs undo (or redo) steps in order; answers with the steps that revert them. */
const WsCalendarApplyChangesRpc = Rpc.make(WS_METHODS.calendarApplyChanges, {
  payload: CalendarApplyChangesInput,
  success: CalendarMutationResult,
  error: CalendarRpcError,
});

const WsCalendarUpdateCalendarRpc = Rpc.make(WS_METHODS.calendarUpdateCalendar, {
  payload: CalendarUpdateCalendarInput,
  error: CalendarRpcError,
});

const WsCalendarUpdatePreferencesRpc = Rpc.make(WS_METHODS.calendarUpdatePreferences, {
  payload: CalendarPreferencesPatch,
  error: CalendarRpcError,
});

const WsCalendarSyncRpc = Rpc.make(WS_METHODS.calendarSync, {
  payload: CalendarSyncInput,
  error: CalendarRpcError,
});

const WsCalendarRemoveAccountRpc = Rpc.make(WS_METHODS.calendarRemoveAccount, {
  payload: CalendarAccountRefInput,
  error: CalendarRpcError,
});

const WsCalendarAddDemoRpc = Rpc.make(WS_METHODS.calendarAddDemo, {
  payload: CalendarAddDemoInput,
  error: CalendarRpcError,
});

/** Starts a Google sign-in and streams its state; ending the stream cancels an open flow. */
const WsCalendarGoogleConnectRpc = Rpc.make(WS_METHODS.calendarGoogleConnect, {
  payload: GoogleConnectInput,
  success: GoogleConnectState,
  error: CalendarRpcError,
  stream: true,
});

/** Hands the environment the redirect URL a client caught or the user pasted. */
const WsCalendarGoogleConnectCompleteRpc = Rpc.make(WS_METHODS.calendarGoogleConnectComplete, {
  payload: GoogleConnectCompleteInput,
  error: CalendarRpcError,
});

const WsCalendarGoogleSetClientRpc = Rpc.make(WS_METHODS.calendarGoogleSetClient, {
  payload: GoogleClientInput,
  error: CalendarRpcError,
});

const WsCalendarGoogleClearClientRpc = Rpc.make(WS_METHODS.calendarGoogleClearClient, {
  payload: Schema.Struct({}),
  error: CalendarRpcError,
});

// ── Subscriptions ────────────────────────────────────────────────────

export const WsSubscribeServerConfigRpc = Rpc.make(WS_METHODS.subscribeServerConfig, {
  payload: Schema.Struct({
    /**
     * Whether this client understands `environmentThemesUpdated` events.
     * Clients decode the stream against their own event union and would die on
     * an unknown member, so the server emits the theme stream only to
     * subscribers that ask for it.
     */
    environmentThemes: Schema.optional(Schema.Boolean),
  }),
  success: ServerConfigStreamEvent,
  error: Schema.Union([KeybindingsConfigError, ServerSettingsError, EnvironmentAuthorizationError]),
  stream: true,
});

const WsSubscribeServerLifecycleRpc = Rpc.make(WS_METHODS.subscribeServerLifecycle, {
  payload: Schema.Struct({}),
  success: ServerLifecycleStreamEvent,
  error: EnvironmentAuthorizationError,
  stream: true,
});

const WsSubscribeAuthAccessRpc = Rpc.make(WS_METHODS.subscribeAuthAccess, {
  payload: Schema.Struct({}),
  success: AuthAccessStreamEvent,
  error: Schema.Union([AuthAccessStreamError, EnvironmentAuthorizationError]),
  stream: true,
});

const WsSubscribeBackgroundPolicyRpc = Rpc.make(WS_METHODS.subscribeBackgroundPolicy, {
  payload: Schema.Struct({}),
  success: BackgroundPolicySnapshot,
  error: EnvironmentAuthorizationError,
  stream: true,
});

export const WsRpcGroup = RpcGroup.make(
  WsServerProbeRpc,
  WsServerGetConfigRpc,
  WsServerRefreshProvidersRpc,
  WsServerUpdateProviderRpc,
  WsProviderAuthStartRpc,
  WsProviderAuthCompleteRpc,
  WsChatGptReconnectProfileRpc,
  WsChatGptImportProfileRpc,
  WsChatGptHandoffSubscribeRpc,
  WsCodexAuthCallbackSubscribeRpc,
  WsProviderAuthRespondRpc,
  WsProviderAuthCancelRpc,
  WsProviderAuthLogoutRpc,
  WsProviderAuthSubscribeRpc,
  WsProviderInstallStartRpc,
  WsProviderInstallCancelRpc,
  WsProviderInstallSubscribeRpc,
  WsProviderInstallRemoveRpc,
  WsServerUpdateServerRpc,
  WsServerUpdateServerWithProgressRpc,
  WsServerUpsertKeybindingRpc,
  WsServerRemoveKeybindingRpc,
  WsServerGetSettingsRpc,
  WsServerUpdateSettingsRpc,
  WsServerGetTraceDiagnosticsRpc,
  WsServerGetProcessDiagnosticsRpc,
  WsServerSignalProcessRpc,
  WsServerReportClientActivityRpc,
  WsServerReportHostPowerStateRpc,
  WsServerGetBackgroundPolicyRpc,
  WsCloudGetRelayClientStatusRpc,
  WsCloudInstallRelayClientRpc,
  WsAgentCreateThreadRpc,
  WsAgentUpdateThreadRpc,
  WsAgentDeleteThreadRpc,
  WsAgentSendMessageRpc,
  WsAgentInterruptRpc,
  WsAgentRespondToRequestRpc,
  WsAgentSubscribeThreadsRpc,
  WsAgentSubscribeThreadRpc,
  WsCalendarSubscribeDirectoryRpc,
  WsCalendarSubscribeWeekRpc,
  WsCalendarGetEventRpc,
  WsCalendarSearchRpc,
  WsCalendarCreateEventRpc,
  WsCalendarUpdateEventRpc,
  WsCalendarDeleteEventRpc,
  WsCalendarRespondRpc,
  WsCalendarRestoreEventRpc,
  WsCalendarApplyChangesRpc,
  WsCalendarUpdateCalendarRpc,
  WsCalendarUpdatePreferencesRpc,
  WsCalendarSyncRpc,
  WsCalendarRemoveAccountRpc,
  WsCalendarAddDemoRpc,
  WsCalendarGoogleConnectRpc,
  WsCalendarGoogleConnectCompleteRpc,
  WsCalendarGoogleSetClientRpc,
  WsCalendarGoogleClearClientRpc,
  WsSubscribeServerConfigRpc,
  WsSubscribeServerLifecycleRpc,
  WsSubscribeAuthAccessRpc,
  WsSubscribeBackgroundPolicyRpc,
);
