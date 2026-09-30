import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS, type ClientSettings } from "@t3tools/contracts/settings";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const persistenceMocks = vi.hoisted(() => ({
  getClientSettings: vi.fn<() => Promise<ClientSettings | null>>(),
  setClientSettings: vi.fn<(settings: ClientSettings) => Promise<void>>(),
}));

vi.mock("~/localApi", () => ({
  ensureLocalApi: () => ({ persistence: persistenceMocks }),
}));

import {
  __resetClientSettingsPersistenceForTests,
  __setClientSettingsForTests,
  getClientSettings,
  mergeEnvironmentSettings,
  persistClientSettingsPatch,
  resolveEnvironmentIdentificationMode,
} from "./useSettings";

beforeEach(() => {
  persistenceMocks.getClientSettings.mockReset().mockResolvedValue(null);
  persistenceMocks.setClientSettings.mockReset().mockResolvedValue(undefined);
  __resetClientSettingsPersistenceForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function nextPersistedSettings(): Promise<ClientSettings> {
  return new Promise((resolve) => {
    persistenceMocks.setClientSettings.mockImplementationOnce(async (settings) => {
      resolve(settings);
    });
  });
}

describe("client settings hydration", () => {
  const savedSettings = {
    ...DEFAULT_CLIENT_SETTINGS,
    timestampFormat: "12-hour" as const,
    favorites: [{ provider: ProviderInstanceId.make("codex_work"), model: "gpt-5.6" }],
  };

  it("holds patches until a pending read supplies the saved preferences", async () => {
    let finishRead!: (settings: ClientSettings) => void;
    const readStarted = new Promise<void>((markStarted) => {
      persistenceMocks.getClientSettings.mockImplementationOnce(() => {
        markStarted();
        return new Promise((resolve) => {
          finishRead = resolve;
        });
      });
    });
    const persisted = nextPersistedSettings();

    void persistClientSettingsPatch({ sendShortcut: "mod-enter" });
    await readStarted;
    expect(getClientSettings()).toBe(DEFAULT_CLIENT_SETTINGS);
    expect(persistenceMocks.setClientSettings).not.toHaveBeenCalled();

    finishRead(savedSettings);
    await expect(persisted).resolves.toEqual({ ...savedSettings, sendShortcut: "mod-enter" });
    expect(persistenceMocks.getClientSettings).toHaveBeenCalledOnce();
  });

  it("does not write defaults over saved preferences after a failed read, and retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    persistenceMocks.getClientSettings.mockRejectedValueOnce(new Error("storage unavailable"));

    await persistClientSettingsPatch({ sendShortcut: "mod-enter" });
    expect(persistenceMocks.setClientSettings).not.toHaveBeenCalled();
    expect(getClientSettings()).toBe(DEFAULT_CLIENT_SETTINGS);

    persistenceMocks.getClientSettings.mockResolvedValue(savedSettings);
    const persisted = nextPersistedSettings();
    void persistClientSettingsPatch({ sendShortcut: "mod-enter" });
    await expect(persisted).resolves.toEqual({ ...savedSettings, sendShortcut: "mod-enter" });
  });
});

describe("persistClientSettingsPatch", () => {
  it("publishes patches immediately and writes them in request order", async () => {
    __setClientSettingsForTests(DEFAULT_CLIENT_SETTINGS);
    let finishFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    persistenceMocks.setClientSettings.mockImplementationOnce(() => {
      markFirstStarted();
      return new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
    });

    const firstSettings = { ...DEFAULT_CLIENT_SETTINGS, sendShortcut: "mod-enter" as const };
    const secondSettings = { ...firstSettings, timestampFormat: "24-hour" as const };
    const first = persistClientSettingsPatch({ sendShortcut: "mod-enter" });
    await firstStarted;
    const second = persistClientSettingsPatch({ timestampFormat: "24-hour" });

    expect(persistenceMocks.setClientSettings).toHaveBeenCalledTimes(1);
    expect(getClientSettings()).toEqual(secondSettings);
    finishFirst();
    await Promise.all([first, second]);

    expect(persistenceMocks.setClientSettings).toHaveBeenNthCalledWith(1, firstSettings);
    expect(persistenceMocks.setClientSettings).toHaveBeenNthCalledWith(2, secondSettings);
  });

  it("keeps writing after a rejected write", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    __setClientSettingsForTests(DEFAULT_CLIENT_SETTINGS);
    persistenceMocks.setClientSettings.mockRejectedValueOnce(new Error("disk full"));

    await persistClientSettingsPatch({ timestampFormat: "12-hour" });
    await persistClientSettingsPatch({ sendShortcut: "mod-enter" });

    expect(persistenceMocks.setClientSettings).toHaveBeenLastCalledWith({
      ...DEFAULT_CLIENT_SETTINGS,
      timestampFormat: "12-hour",
      sendShortcut: "mod-enter",
    });
  });
});

describe("resolveEnvironmentIdentificationMode", () => {
  it("keeps identification hidden until client settings hydrate", () => {
    expect(resolveEnvironmentIdentificationMode({ mode: "artwork", settingsHydrated: false })).toBe(
      "none",
    );
    expect(resolveEnvironmentIdentificationMode({ mode: "pill", settingsHydrated: true })).toBe(
      "pill",
    );
  });

  it("uses a pill instead of artwork with a palette theme", () => {
    expect(
      resolveEnvironmentIdentificationMode({
        mode: "artwork",
        settingsHydrated: true,
        paletteThemeActive: true,
      }),
    ).toBe("pill");
  });

  it("respects none with a palette theme", () => {
    expect(
      resolveEnvironmentIdentificationMode({
        mode: "none",
        settingsHydrated: true,
        paletteThemeActive: true,
      }),
    ).toBe("none");
  });

  it("keeps artwork when the palette theme opts into it", () => {
    expect(
      resolveEnvironmentIdentificationMode({
        mode: "artwork",
        settingsHydrated: true,
        paletteThemeActive: true,
        paletteThemeAllowsArtwork: true,
      }),
    ).toBe("artwork");
  });
});

describe("mergeEnvironmentSettings", () => {
  it("combines the selected environment's server settings with client preferences", () => {
    const serverSettings = {
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        [ProviderInstanceId.make("codex_remote")]: {
          driver: ProviderDriverKind.make("codex"),
          enabled: true,
        },
      },
    };
    const clientSettings = {
      ...DEFAULT_CLIENT_SETTINGS,
      favorites: [
        {
          provider: ProviderInstanceId.make("codex_remote"),
          model: "gpt-5.4",
        },
      ],
    };

    const settings = mergeEnvironmentSettings(serverSettings, clientSettings);

    expect(settings.providerInstances).toBe(serverSettings.providerInstances);
    expect(settings.favorites).toBe(clientSettings.favorites);
  });
});
