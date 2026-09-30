import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  AuthRelayReadScope,
  AuthRelayWriteScope,
  WS_METHODS,
  WsRpcGroup,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { RPC_REQUIRED_SCOPES, requiredScopeForRpcMethod } from "./RpcAuthorization.ts";

describe("RPC authorization scopes", () => {
  it("declares exactly one scope for every RPC in the server group", () => {
    expect(new Set(Object.keys(RPC_REQUIRED_SCOPES))).toEqual(new Set(WsRpcGroup.requests.keys()));
  });

  it("authorizes background policy reporting and observation deliberately", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.serverReportClientActivity)).toBe(
      AuthOrchestrationReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.serverReportHostPowerState)).toBe(
      AuthOrchestrationOperateScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.subscribeBackgroundPolicy)).toBe(
      AuthOrchestrationReadScope,
    );
  });

  it("allows relay status reads without granting relay installation access", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.cloudGetRelayClientStatus)).toBe(
      AuthRelayReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.cloudInstallRelayClient)).toBe(AuthRelayWriteScope);
  });

  it("lets read-only clients watch the agent and the calendar but not change them", () => {
    for (const method of [
      WS_METHODS.agentSubscribeThreads,
      WS_METHODS.agentSubscribeThread,
      WS_METHODS.calendarSubscribeDirectory,
      WS_METHODS.calendarSubscribeWeek,
      WS_METHODS.calendarGetEvent,
      WS_METHODS.calendarSearch,
    ]) {
      expect(requiredScopeForRpcMethod(method)).toBe(AuthOrchestrationReadScope);
    }
    for (const method of [
      WS_METHODS.agentCreateThread,
      WS_METHODS.agentSendMessage,
      WS_METHODS.agentRespondToRequest,
      WS_METHODS.calendarCreateEvent,
      WS_METHODS.calendarDeleteEvent,
      WS_METHODS.calendarApplyChanges,
      WS_METHODS.calendarSync,
      WS_METHODS.calendarGoogleConnect,
      WS_METHODS.calendarGoogleSetClient,
    ]) {
      expect(requiredScopeForRpcMethod(method)).toBe(AuthOrchestrationOperateScope);
    }
  });

  it("fails loudly for a method without a declared scope", () => {
    expect(() => requiredScopeForRpcMethod("unknown.method")).toThrow(
      "RPC method unknown.method has no declared authorization scope.",
    );
  });
});
