import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";
import { useCallback } from "react";

import { appAtomRegistry } from "./atom-registry";
import type { ConnectedEnvironmentSummary } from "./remote-runtime-types";
import { useWorkspaceEnvironments } from "./workspace";

const selectedEnvironmentIdAtom = Atom.make<EnvironmentId | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("mobile:selected-environment-id"),
);

/**
 * The environment whose notes and agent the app shows: the user's pick while it is still
 * saved and switched on, otherwise the first connected one, otherwise the first switched on.
 */
export function resolveActiveEnvironment(
  environments: ReadonlyArray<ConnectedEnvironmentSummary>,
  selectedEnvironmentId: EnvironmentId | null,
): ConnectedEnvironmentSummary | null {
  const enabled = environments.filter((environment) => environment.isEnabled);
  return (
    enabled.find((environment) => environment.environmentId === selectedEnvironmentId) ??
    enabled.find((environment) => environment.connectionState === "connected") ??
    enabled[0] ??
    null
  );
}

export function useActiveEnvironment() {
  const environments = useWorkspaceEnvironments();
  const selectedEnvironmentId = useAtomValue(selectedEnvironmentIdAtom);
  const selectEnvironment = useCallback((environmentId: EnvironmentId) => {
    appAtomRegistry.set(selectedEnvironmentIdAtom, environmentId);
  }, []);
  return {
    environments: environments.filter((environment) => environment.isEnabled),
    activeEnvironment: resolveActiveEnvironment(environments, selectedEnvironmentId),
    selectEnvironment,
  };
}
