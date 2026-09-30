import { createFileRoute } from "@tanstack/react-router";
import { ProviderInstanceId } from "@t3tools/contracts";

import { NoEnvironmentState } from "../components/AppPage";
import { ProviderSettingsPanel } from "../components/settings/ProviderSettingsPanel";
import { useActiveEnvironmentId } from "../state/activeEnvironment";

/** Agents are machine state, so the page shows the active environment's providers. */
function SettingsProvidersRoute() {
  const { instanceId } = Route.useSearch();
  const environmentId = useActiveEnvironmentId();
  if (environmentId === null) return <NoEnvironmentState />;
  return (
    <ProviderSettingsPanel environmentId={environmentId} {...(instanceId ? { instanceId } : {})} />
  );
}

export const Route = createFileRoute("/settings/providers")({
  validateSearch: (raw: Record<string, unknown>) =>
    typeof raw.instanceId === "string" && raw.instanceId.trim()
      ? { instanceId: ProviderInstanceId.make(raw.instanceId) }
      : {},
  component: SettingsProvidersRoute,
});
