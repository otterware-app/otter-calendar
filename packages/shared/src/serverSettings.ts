import {
  isProviderDriverKind,
  resolveProviderInstanceEnabled,
  type ModelSelection,
  type ProviderDriverKind,
  ServerSettings,
  type ServerSettingsPatch,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { deepMerge } from "./Struct.ts";
import { fromLenientJson } from "./schemaJson.ts";
import { normalizeBackgroundActivitySettings } from "./backgroundActivitySettings.ts";

const ServerSettingsJson = fromLenientJson(ServerSettings);
const decodeServerSettingsJson = Schema.decodeUnknownOption(ServerSettingsJson);

type LegacyProviderSettings = ServerSettings["providers"][keyof ServerSettings["providers"]];

const getLegacyProviderSettings = (
  settings: ServerSettings,
  provider: ProviderDriverKind,
): LegacyProviderSettings | undefined =>
  (settings.providers as Record<string, LegacyProviderSettings | undefined>)[provider];

export function isModelSelectionProviderEnabled(
  settings: ServerSettings,
  selection: ModelSelection,
): boolean {
  const instanceConfig = settings.providerInstances[selection.instanceId];
  if (instanceConfig !== undefined) {
    return resolveProviderInstanceEnabled(instanceConfig);
  }

  return (
    isProviderDriverKind(selection.instanceId) &&
    getLegacyProviderSettings(settings, selection.instanceId)?.enabled === true
  );
}

export interface PersistedServerObservabilitySettings {
  readonly otlpTracesUrl: string | undefined;
  readonly otlpMetricsUrl: string | undefined;
  readonly otlpLogsUrl: string | undefined;
}

function normalizePersistedServerSettingString(
  value: string | null | undefined,
): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/** Reads the OTLP endpoints from a raw `settings.json`, before the server is running. */
export function parsePersistedServerObservabilitySettings(
  raw: string,
): PersistedServerObservabilitySettings {
  const decoded = decodeServerSettingsJson(raw);
  const observability = Option.isSome(decoded) ? decoded.value.observability : undefined;
  return {
    otlpTracesUrl: normalizePersistedServerSettingString(observability?.otlpTracesUrl),
    otlpMetricsUrl: normalizePersistedServerSettingString(observability?.otlpMetricsUrl),
    otlpLogsUrl: normalizePersistedServerSettingString(observability?.otlpLogsUrl),
  };
}

/**
 * Apply a client patch. Nested objects merge key by key, except where a merge
 * would keep what the client meant to clear: the provider instance map and the
 * default model selection are replaced whole, and background overrides are
 * replaced as a record.
 */
export function applyServerSettingsPatch(
  current: ServerSettings,
  patch: ServerSettingsPatch,
): ServerSettings {
  const { backgroundActivity, providerInstances, defaultModelSelection, ...patchForMerge } = patch;
  const next = deepMerge(current, patchForMerge);
  return {
    ...next,
    backgroundActivity:
      backgroundActivity === undefined
        ? current.backgroundActivity
        : normalizeBackgroundActivitySettings({
            ...deepMerge(current.backgroundActivity, backgroundActivity),
            ...(backgroundActivity.overrides !== undefined
              ? { overrides: backgroundActivity.overrides }
              : {}),
          }),
    ...(providerInstances !== undefined ? { providerInstances } : {}),
    ...(defaultModelSelection !== undefined ? { defaultModelSelection } : {}),
  };
}
