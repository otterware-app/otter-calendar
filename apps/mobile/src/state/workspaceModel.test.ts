import {
  BearerConnectionProfile,
  BearerConnectionTarget,
  type EnvironmentPresentation,
} from "@t3tools/client-runtime/connection";
import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";

import { projectWorkspaceConnectionState, projectWorkspaceEnvironment } from "./workspaceModel";

const ENVIRONMENT_ID = EnvironmentId.make("environment-1");

function environment(
  phase: EnvironmentPresentation["connection"]["phase"],
): EnvironmentPresentation {
  const connectionId = `bearer:${ENVIRONMENT_ID}`;
  return {
    entry: {
      target: new BearerConnectionTarget({
        environmentId: ENVIRONMENT_ID,
        label: "Julius's MacBook Pro",
        connectionId,
      }),
      profile: Option.some(
        new BearerConnectionProfile({
          connectionId,
          environmentId: ENVIRONMENT_ID,
          label: "Julius's MacBook Pro",
          httpBaseUrl: "https://environment.example.test",
          wsBaseUrl: "wss://environment.example.test",
        }),
      ),
      enabled: true,
    },
    connection: {
      phase,
      error: phase === "error" ? "Connection failed." : null,
      traceId: phase === "error" ? "trace-1" : null,
    },
    serverConfig: null,
  };
}

describe("mobile workspace projection", () => {
  it("preserves explicit offline state without presenting it as a connection error", () => {
    const projected = projectWorkspaceEnvironment(ENVIRONMENT_ID, environment("offline"));

    expect(projected.connectionState).toBe("offline");
    expect(projected.connectionError).toBeNull();
  });

  it("reports offline before stale connected presentations", () => {
    const environments = [projectWorkspaceEnvironment(ENVIRONMENT_ID, environment("connected"))];
    const state = projectWorkspaceConnectionState({
      isReady: true,
      networkStatus: "offline",
      environments,
    });

    expect(state.connectionState).toBe("offline");
    expect(state.networkStatus).toBe("offline");
    expect(state.hasReadyEnvironment).toBe(false);
  });

  it("projects reconnecting environments dynamically from active phases", () => {
    const environments = [
      projectWorkspaceEnvironment(ENVIRONMENT_ID, environment("reconnecting")),
      projectWorkspaceEnvironment(EnvironmentId.make("environment-2"), environment("connected")),
    ];
    const state = projectWorkspaceConnectionState({
      isReady: true,
      networkStatus: "online",
      environments,
    });

    expect(state.connectingEnvironments).toHaveLength(1);
    expect(state.connectingEnvironments[0]?.connectionState).toBe("reconnecting");
    expect(state.hasConnectingEnvironment).toBe(true);
    expect(state.hasReadyEnvironment).toBe(true);
  });
});
