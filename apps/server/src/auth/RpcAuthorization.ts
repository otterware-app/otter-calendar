import {
  AuthAccessReadScope,
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  AuthRelayReadScope,
  AuthRelayWriteScope,
  type AuthEnvironmentScope,
  WS_METHODS,
  WsRpcGroup,
} from "@t3tools/contracts";
import type * as RpcGroup from "effect/unstable/rpc/RpcGroup";

type WsRpcMethod = RpcGroup.Rpcs<typeof WsRpcGroup>["_tag"];

/**
 * Keep authorization coverage coupled to the RPC group itself. Adding an RPC to
 * `WsRpcGroup` without choosing a scope is a type error instead of a production
 * runtime failure. Reads use the read scope; anything that changes state, starts
 * work, or spends provider credentials uses the operate scope.
 */
export const RPC_REQUIRED_SCOPES = {
  [WS_METHODS.serverProbe]: AuthOrchestrationReadScope,
  [WS_METHODS.serverGetConfig]: AuthOrchestrationReadScope,
  [WS_METHODS.serverRefreshProviders]: AuthOrchestrationOperateScope,
  [WS_METHODS.serverUpdateProvider]: AuthOrchestrationOperateScope,
  [WS_METHODS.serverUpdateServer]: AuthOrchestrationOperateScope,
  [WS_METHODS.serverUpdateServerWithProgress]: AuthOrchestrationOperateScope,
  [WS_METHODS.serverUpsertKeybinding]: AuthOrchestrationOperateScope,
  [WS_METHODS.serverRemoveKeybinding]: AuthOrchestrationOperateScope,
  [WS_METHODS.serverGetSettings]: AuthOrchestrationReadScope,
  [WS_METHODS.serverUpdateSettings]: AuthOrchestrationOperateScope,
  [WS_METHODS.serverGetTraceDiagnostics]: AuthOrchestrationReadScope,
  [WS_METHODS.serverGetProcessDiagnostics]: AuthOrchestrationReadScope,
  [WS_METHODS.serverSignalProcess]: AuthOrchestrationOperateScope,
  [WS_METHODS.serverReportClientActivity]: AuthOrchestrationReadScope,
  [WS_METHODS.serverReportHostPowerState]: AuthOrchestrationOperateScope,
  [WS_METHODS.serverGetBackgroundPolicy]: AuthOrchestrationReadScope,
  [WS_METHODS.providerAuthStart]: AuthOrchestrationOperateScope,
  [WS_METHODS.providerAuthComplete]: AuthOrchestrationOperateScope,
  [WS_METHODS.chatGptReconnectProfile]: AuthOrchestrationOperateScope,
  [WS_METHODS.chatGptImportProfile]: AuthOrchestrationOperateScope,
  [WS_METHODS.chatGptHandoffSubscribe]: AuthOrchestrationOperateScope,
  [WS_METHODS.codexAuthCallbackSubscribe]: AuthOrchestrationOperateScope,
  [WS_METHODS.providerAuthRespond]: AuthOrchestrationOperateScope,
  [WS_METHODS.providerAuthCancel]: AuthOrchestrationOperateScope,
  [WS_METHODS.providerAuthLogout]: AuthOrchestrationOperateScope,
  [WS_METHODS.providerAuthSubscribe]: AuthOrchestrationOperateScope,
  [WS_METHODS.providerInstallStart]: AuthOrchestrationOperateScope,
  [WS_METHODS.providerInstallCancel]: AuthOrchestrationOperateScope,
  [WS_METHODS.providerInstallSubscribe]: AuthOrchestrationReadScope,
  [WS_METHODS.providerInstallRemove]: AuthOrchestrationOperateScope,
  [WS_METHODS.cloudGetRelayClientStatus]: AuthRelayReadScope,
  [WS_METHODS.cloudInstallRelayClient]: AuthRelayWriteScope,
  [WS_METHODS.agentCreateThread]: AuthOrchestrationOperateScope,
  [WS_METHODS.agentUpdateThread]: AuthOrchestrationOperateScope,
  [WS_METHODS.agentDeleteThread]: AuthOrchestrationOperateScope,
  [WS_METHODS.agentSendMessage]: AuthOrchestrationOperateScope,
  [WS_METHODS.agentInterrupt]: AuthOrchestrationOperateScope,
  [WS_METHODS.agentRespondToRequest]: AuthOrchestrationOperateScope,
  [WS_METHODS.agentSubscribeThreads]: AuthOrchestrationReadScope,
  [WS_METHODS.agentSubscribeThread]: AuthOrchestrationReadScope,
  [WS_METHODS.notesCreate]: AuthOrchestrationOperateScope,
  [WS_METHODS.notesUpdate]: AuthOrchestrationOperateScope,
  [WS_METHODS.notesDelete]: AuthOrchestrationOperateScope,
  [WS_METHODS.notesSubscribe]: AuthOrchestrationReadScope,
  [WS_METHODS.subscribeServerConfig]: AuthOrchestrationReadScope,
  [WS_METHODS.subscribeServerLifecycle]: AuthOrchestrationReadScope,
  [WS_METHODS.subscribeAuthAccess]: AuthAccessReadScope,
  [WS_METHODS.subscribeBackgroundPolicy]: AuthOrchestrationReadScope,
} as const satisfies Readonly<Record<WsRpcMethod, AuthEnvironmentScope>>;

export function requiredScopeForRpcMethod(method: string): AuthEnvironmentScope {
  if (!Object.hasOwn(RPC_REQUIRED_SCOPES, method)) {
    throw new Error(`RPC method ${method} has no declared authorization scope.`);
  }
  const requiredScope = RPC_REQUIRED_SCOPES[method as WsRpcMethod];
  if (requiredScope === undefined) {
    throw new Error(`RPC method ${method} has no declared authorization scope.`);
  }
  return requiredScope;
}
