import type { ModelSelection, RuntimeMode, ServerProvider } from "@t3tools/contracts";
import { ChevronDownIcon } from "lucide-react";
import { useMemo } from "react";

import { useClientSettings } from "../../hooks/useSettings";
import { sortModelsForProviderInstance } from "../../modelOrdering";
import {
  deriveProviderInstanceEntries,
  isProviderInstancePickerReady,
  sortProviderInstanceEntries,
} from "../../providerInstances";
import { runtimeModeConfig, runtimeModeOptions } from "./runtimeModes";
import { ProviderInstanceIcon } from "../ProviderInstanceIcon";
import { Button } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";

const selectionKey = (selection: Pick<ModelSelection, "instanceId" | "model">) =>
  JSON.stringify([selection.instanceId, selection.model]);

/**
 * The agent's provider instance and model, from the environment's ready providers. Models follow
 * the user's Agents settings: hidden ones are left out (unless selected), favorites come first.
 */
export function AgentModelPicker({
  providers,
  value,
  onChange,
  disabled,
}: {
  providers: ReadonlyArray<ServerProvider>;
  value: ModelSelection | null;
  onChange: (selection: ModelSelection) => void;
  disabled?: boolean;
}) {
  const { favorites, providerModelPreferences } = useClientSettings();
  const selectedModelSlug = value?.model;
  const entries = useMemo(
    () =>
      sortProviderInstanceEntries(deriveProviderInstanceEntries(providers))
        .filter(isProviderInstancePickerReady)
        .map((entry) => {
          const preferences = providerModelPreferences[entry.instanceId];
          const hidden = new Set(preferences?.hiddenModels);
          const models = sortModelsForProviderInstance(
            entry.models.filter(
              (model) => !hidden.has(model.slug) || model.slug === selectedModelSlug,
            ),
            {
              modelOrder: preferences?.modelOrder ?? [],
              favoriteModels: favorites
                .filter((favorite) => favorite.provider === entry.instanceId)
                .map((favorite) => favorite.model),
              groupFavorites: true,
            },
          );
          return { ...entry, models };
        }),
    [favorites, providerModelPreferences, providers, selectedModelSlug],
  );
  const selectedEntry = entries.find((entry) => entry.instanceId === value?.instanceId);
  const selectedModel = selectedEntry?.models.find((model) => model.slug === value?.model);
  const label = selectedEntry
    ? (selectedModel?.shortName ?? selectedModel?.name ?? value?.model ?? selectedEntry.displayName)
    : entries.length === 0
      ? "No agent set up"
      : "Choose a model";

  return (
    <Menu>
      <MenuTrigger
        disabled={disabled || entries.length === 0}
        render={<Button size="xs" variant="ghost-muted" aria-label="Model" />}
      >
        {selectedEntry ? (
          <ProviderInstanceIcon
            driverKind={selectedEntry.driverKind}
            displayName={selectedEntry.displayName}
            accentColor={selectedEntry.accentColor}
            iconClassName="size-3.5"
          />
        ) : null}
        <span className="max-w-40 truncate">{label}</span>
        <ChevronDownIcon className="size-3 opacity-60" />
      </MenuTrigger>
      <MenuPopup align="start" side="top">
        <MenuRadioGroup
          value={value ? selectionKey(value) : ""}
          onValueChange={(key) => {
            const [instanceId, model] = JSON.parse(String(key)) as [string, string];
            const entry = entries.find((candidate) => candidate.instanceId === instanceId);
            if (entry) onChange({ instanceId: entry.instanceId, model });
          }}
        >
          {entries.map((entry, index) => (
            <MenuGroup key={entry.instanceId}>
              {index > 0 ? <MenuSeparator /> : null}
              <MenuGroupLabel>{entry.displayName}</MenuGroupLabel>
              {entry.models.map((model) => (
                <MenuRadioItem
                  key={model.slug}
                  value={selectionKey({ instanceId: entry.instanceId, model: model.slug })}
                  closeOnClick
                >
                  {model.name}
                </MenuRadioItem>
              ))}
            </MenuGroup>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

/** How much the agent may do without asking. */
export function AgentRuntimeModePicker({
  value,
  supportedModes,
  onChange,
  disabled,
}: {
  value: RuntimeMode;
  supportedModes?: ReadonlyArray<RuntimeMode> | undefined;
  onChange: (mode: RuntimeMode) => void;
  disabled?: boolean;
}) {
  const modes = runtimeModeOptions.filter(
    (mode) => supportedModes === undefined || supportedModes.includes(mode),
  );
  const current = runtimeModeConfig[value];
  const CurrentIcon = current.icon;
  return (
    <Menu>
      <MenuTrigger
        disabled={disabled}
        render={<Button size="xs" variant="ghost-muted" aria-label="Access" />}
      >
        <CurrentIcon className="size-3.5" />
        <span>{current.label}</span>
        <ChevronDownIcon className="size-3 opacity-60" />
      </MenuTrigger>
      <MenuPopup align="start" side="top">
        <MenuRadioGroup value={value} onValueChange={(mode) => onChange(mode as RuntimeMode)}>
          {modes.map((mode) => {
            const config = runtimeModeConfig[mode];
            const Icon = config.icon;
            return (
              <MenuRadioItem key={mode} value={mode} closeOnClick>
                <span className="flex min-w-0 flex-col py-0.5">
                  <span className="flex items-center gap-1.5">
                    <Icon className="size-3.5" />
                    {config.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{config.description}</span>
                </span>
              </MenuRadioItem>
            );
          })}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}
