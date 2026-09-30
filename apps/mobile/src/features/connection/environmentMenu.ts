import type { EnvironmentId } from "@t3tools/contracts";

import type { ScreenHeaderMenuItem } from "../../components/ScreenHeader.types";
import type { ConnectedEnvironmentSummary } from "../../state/remote-runtime-types";

/** An inline "switch environment" section, shown only when there is a choice to make. */
export function environmentMenuItems(input: {
  readonly environments: ReadonlyArray<ConnectedEnvironmentSummary>;
  readonly activeEnvironmentId: EnvironmentId | null;
  readonly onSelect: (environmentId: EnvironmentId) => void;
}): ReadonlyArray<ScreenHeaderMenuItem> {
  if (input.environments.length < 2) return [];
  return [
    {
      id: "environments",
      title: "Environment",
      inline: true,
      items: input.environments.map((environment) => ({
        id: `environment:${environment.environmentId}`,
        title: environment.environmentLabel,
        selected: environment.environmentId === input.activeEnvironmentId,
        onPress: () => input.onSelect(environment.environmentId),
      })),
    },
  ];
}
