import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
} from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import { describe, expect, it } from "vite-plus/test";
import { resolveServerBackgroundActivitySettings } from "./backgroundActivitySettings.ts";
import { createModelSelection } from "./model.ts";
import {
  applyServerSettingsPatch,
  isModelSelectionProviderEnabled,
  parsePersistedServerObservabilitySettings,
} from "./serverSettings.ts";

describe("serverSettings helpers", () => {
  it("replaces and clears conversation model defaults without retaining old options", () => {
    const current = applyServerSettingsPatch(DEFAULT_SERVER_SETTINGS, {
      defaultModelSelection: createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.4", [
        { id: "reasoningEffort", value: "high" },
      ]),
    });
    const selection = createModelSelection(ProviderInstanceId.make("claudeAgent"), "sonnet");
    const updated = applyServerSettingsPatch(current, { defaultModelSelection: selection });
    expect(updated.defaultModelSelection).toEqual(selection);
    expect(
      applyServerSettingsPatch(updated, { defaultModelSelection: null }).defaultModelSelection,
    ).toBeNull();
  });

  it("ignores missing and blank persisted observability URLs", () => {
    const empty = { otlpTracesUrl: undefined, otlpMetricsUrl: undefined, otlpLogsUrl: undefined };
    expect(parsePersistedServerObservabilitySettings("{}")).toEqual(empty);
    expect(
      parsePersistedServerObservabilitySettings(
        JSON.stringify({
          observability: { otlpTracesUrl: "   ", otlpMetricsUrl: "", otlpLogsUrl: "   " },
        }),
      ),
    ).toEqual(empty);
    expect(parsePersistedServerObservabilitySettings("{")).toEqual(empty);
  });

  it("parses lenient persisted settings JSON and trims observability URLs", () => {
    expect(
      parsePersistedServerObservabilitySettings(
        JSON.stringify({
          observability: {
            otlpTracesUrl: "  http://localhost:4318/v1/traces  ",
            otlpMetricsUrl: "  http://localhost:4318/v1/metrics  ",
            otlpLogsUrl: "  http://localhost:4318/v1/logs  ",
          },
        }),
      ),
    ).toEqual({
      otlpTracesUrl: "http://localhost:4318/v1/traces",
      otlpMetricsUrl: "http://localhost:4318/v1/metrics",
      otlpLogsUrl: "http://localhost:4318/v1/logs",
    });
  });

  it("replaces providerInstances maps so omitted instance fields are cleared", () => {
    const codexId = ProviderInstanceId.make("codex");
    const driver = ProviderDriverKind.make("codex");
    const current = {
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        [codexId]: {
          driver,
          displayName: "Codex Work",
          accentColor: "#7c3aed",
          enabled: true,
          config: { homePath: "~/.codex" },
        },
      },
    };
    const replacement = { driver, displayName: "Codex Work", enabled: true, config: {} };

    expect(
      applyServerSettingsPatch(current, { providerInstances: { [codexId]: replacement } })
        .providerInstances[codexId],
    ).toEqual(replacement);
  });

  it("treats an instance's own enabled flag as authoritative", () => {
    const codexId = ProviderInstanceId.make("codex");
    const settings = {
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        [codexId]: { driver: ProviderDriverKind.make("codex"), enabled: false, config: {} },
      },
    };
    expect(
      isModelSelectionProviderEnabled(settings, createModelSelection(codexId, "gpt-5.4")),
    ).toBe(false);
    expect(
      isModelSelectionProviderEnabled(
        DEFAULT_SERVER_SETTINGS,
        createModelSelection(ProviderInstanceId.make("claudeAgent"), "sonnet"),
      ),
    ).toBe(true);
  });

  it("replaces the complete background override record", () => {
    const current = applyServerSettingsPatch(DEFAULT_SERVER_SETTINGS, {
      backgroundActivity: {
        schemaVersion: 1,
        profile: "custom",
        baseProfile: "balanced",
        overrides: {
          providerHealthRefreshInterval: Duration.minutes(3),
          pauseWhenOnBattery: true,
        },
      },
    });

    const next = applyServerSettingsPatch(current, {
      backgroundActivity: { overrides: { providerHealthRefreshInterval: Duration.minutes(2) } },
    });

    expect(next.backgroundActivity).toEqual({
      schemaVersion: 1,
      profile: "custom",
      baseProfile: "balanced",
      overrides: { providerHealthRefreshInterval: Duration.minutes(2) },
    });
  });

  it("drops custom overrides that duplicate the base profile", () => {
    const next = applyServerSettingsPatch(DEFAULT_SERVER_SETTINGS, {
      backgroundActivity: {
        schemaVersion: 1,
        profile: "custom",
        baseProfile: "balanced",
        overrides: { providerHealthRefreshInterval: Duration.minutes(5) },
      },
    });

    expect(next.backgroundActivity).toEqual({
      schemaVersion: 1,
      profile: "balanced",
      overrides: {},
    });
  });

  it("ignores overrides attached to a concrete background profile", () => {
    const resolved = resolveServerBackgroundActivitySettings({
      backgroundActivity: {
        schemaVersion: 1,
        profile: "balanced",
        overrides: { pauseWhenOnBattery: true },
      },
    });

    expect(resolved.pauseWhenOnBattery).toBe(false);
  });
});
