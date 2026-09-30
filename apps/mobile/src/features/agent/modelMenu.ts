import { resolveProviderInstanceDisplayName } from "@t3tools/client-runtime/state/provider-instance-display";
import type { ModelSelection, ServerProvider } from "@t3tools/contracts";

import type { ScreenHeaderMenuItem } from "../../components/ScreenHeader.types";

/** A model submenu per ready provider; empty when no provider can run. */
export function modelMenuItems(input: {
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly current: ModelSelection | null;
  readonly onSelect: (selection: ModelSelection) => void;
}): ReadonlyArray<ScreenHeaderMenuItem> {
  return input.providers
    .filter(
      (provider) =>
        provider.enabled &&
        provider.installed &&
        provider.availability !== "unavailable" &&
        provider.models.length > 0,
    )
    .map((provider) => ({
      id: `provider:${provider.instanceId}`,
      title: resolveProviderInstanceDisplayName(provider),
      items: provider.models
        .filter((model) => !model.isLegacy)
        .map((model) => ({
          id: `model:${provider.instanceId}:${model.slug}`,
          title: model.name,
          selected:
            input.current?.instanceId === provider.instanceId && input.current.model === model.slug,
          onPress: () => input.onSelect({ instanceId: provider.instanceId, model: model.slug }),
        })),
    }));
}

/** The model's display name, when a provider still offers it. */
export function modelLabel(
  providers: ReadonlyArray<ServerProvider>,
  selection: ModelSelection | null,
): string | undefined {
  if (selection === null) return undefined;
  const provider = providers.find((candidate) => candidate.instanceId === selection.instanceId);
  return provider?.models.find((model) => model.slug === selection.model)?.name ?? selection.model;
}
