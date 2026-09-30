import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { vi } from "vite-plus/test";

import type * as Electron from "electron";

const { focusedWebContents, ownerWindow } = vi.hoisted(() => ({
  focusedWebContents: vi.fn(),
  ownerWindow: vi.fn(),
}));
vi.mock("electron", () => ({
  webContents: { getFocusedWebContents: focusedWebContents },
  BrowserWindow: { fromWebContents: ownerWindow },
}));

import * as DesktopEnvironment from "../../app/DesktopEnvironment.ts";
import * as DesktopBackendManager from "../../backend/DesktopBackendManager.ts";
import * as DesktopBackendPool from "../../backend/DesktopBackendPool.ts";
import * as ElectronDialog from "../../electron/ElectronDialog.ts";
import * as ElectronWindow from "../../electron/ElectronWindow.ts";
import * as DesktopAppSettings from "../../settings/DesktopAppSettings.ts";
import {
  getLocalEnvironmentBootstraps,
  getWindowFullscreenState,
  pasteAsText,
  pickFolder,
} from "./window.ts";

const readyConfig: DesktopBackendManager.DesktopBackendStartConfig = {
  executablePath: "/electron",
  args: ["/app/bin.mjs", "--bootstrap-fd", "3"],
  entryPath: "/app/bin.mjs",
  cwd: "/app",
  env: {},
  bootstrap: {
    mode: "desktop",
    noBrowser: true,
    port: 3773,
    host: "127.0.0.1",
    desktopBootstrapToken: "bootstrap-token",
    tailscaleServeEnabled: false,
    tailscaleServePort: 443,
  },
  httpBaseUrl: new URL("http://127.0.0.1:3773"),
  captureOutput: true,
};

const makePrimary = (
  config: Option.Option<DesktopBackendManager.DesktopBackendStartConfig>,
): DesktopBackendManager.DesktopBackendInstance => ({
  id: DesktopBackendManager.PRIMARY_INSTANCE_ID,
  label: Effect.succeed("Local environment"),
  start: Effect.void,
  stop: () => Effect.void,
  currentConfig: Effect.succeed(config),
  snapshot: Effect.succeed({
    desiredRunning: true,
    ready: Option.isSome(config),
    activePid: Option.some(123),
    restartAttempt: 0,
    restartScheduled: false,
  }),
});

describe("getLocalEnvironmentBootstraps", () => {
  it.effect("publishes the running backend's endpoints and bootstrap token", () =>
    Effect.gen(function* () {
      const result = yield* getLocalEnvironmentBootstraps.handler();

      assert.deepEqual(result, [
        {
          id: "primary",
          label: "Local environment",
          httpBaseUrl: "http://127.0.0.1:3773/",
          wsBaseUrl: "ws://127.0.0.1:3773/",
          bootstrapToken: "bootstrap-token",
        },
      ]);
    }).pipe(Effect.provide(DesktopBackendPool.layerTest(makePrimary(Option.some(readyConfig))))),
  );

  it.effect("omits a backend that has not resolved its configuration yet", () =>
    Effect.gen(function* () {
      assert.deepEqual(yield* getLocalEnvironmentBootstraps.handler(), []);
    }).pipe(Effect.provide(DesktopBackendPool.layerTest(makePrimary(Option.none())))),
  );
});

describe("getWindowFullscreenState", () => {
  it.effect("reads the current native window state", () => {
    const window = { isFullScreen: () => true } as Electron.BrowserWindow;

    return Effect.gen(function* () {
      assert.isTrue(yield* getWindowFullscreenState.handler());
    }).pipe(
      Effect.provide(
        Layer.mock(ElectronWindow.ElectronWindow)({
          currentMainOrFirst: Effect.succeedSome(window),
        }),
      ),
    );
  });
});

describe("pasteAsText", () => {
  it.effect(
    "pastes into the focused guest only after the main renderer acknowledges the menu action",
    () => {
      const paste = vi.fn();
      const mainPaste = vi.fn();
      const window = {
        webContents: { id: 42, paste: mainPaste },
        isDestroyed: () => false,
      } as unknown as Electron.BrowserWindow;
      focusedWebContents.mockReturnValue({ paste, isDestroyed: () => false });
      ownerWindow.mockReturnValue(window);

      return Effect.gen(function* () {
        yield* pasteAsText.handler(undefined, { sender: { id: 42 } });
        assert.equal(paste.mock.calls.length, 1);
        assert.equal(mainPaste.mock.calls.length, 0);

        yield* pasteAsText.handler(undefined, { sender: { id: 99 } });
        assert.equal(paste.mock.calls.length, 1);
        ownerWindow.mockReturnValue({}); // A focused PiP/other BrowserWindow.
        yield* pasteAsText.handler(undefined, { sender: { id: 42 } });
        assert.equal(paste.mock.calls.length, 1);
        ownerWindow.mockReturnValue(null); // Detached contents.
        yield* pasteAsText.handler(undefined, { sender: { id: 42 } });
        assert.equal(paste.mock.calls.length, 1);
        ownerWindow.mockReturnValue(window);
        focusedWebContents.mockReturnValue({ paste, isDestroyed: () => true });
        yield* pasteAsText.handler(undefined, { sender: { id: 42 } });
        assert.equal(paste.mock.calls.length, 1);
        focusedWebContents.mockReturnValue(null);
        yield* pasteAsText.handler(undefined, { sender: { id: 42 } });
        assert.equal(paste.mock.calls.length, 1);
      }).pipe(
        Effect.provide(
          Layer.mock(ElectronWindow.ElectronWindow)({
            main: Effect.succeedSome(window),
          }),
        ),
      );
    },
  );
});

describe("pickFolder", () => {
  it.effect("does not open a picker while the local environment is off", () =>
    Effect.gen(function* () {
      const pickFolderDialog = vi.fn(() => Effect.succeedSome("/picked"));
      const result = yield* pickFolder.handler(undefined).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.mock(ElectronDialog.ElectronDialog)({ pickFolder: pickFolderDialog }),
            Layer.mock(ElectronWindow.ElectronWindow)({ focusedMainOrFirst: Effect.succeedNone }),
            Layer.succeed(
              DesktopEnvironment.DesktopEnvironment,
              {} as unknown as DesktopEnvironment.DesktopEnvironment["Service"],
            ),
            DesktopAppSettings.layerTest({
              ...DesktopAppSettings.DEFAULT_DESKTOP_SETTINGS,
              localEnvironmentEnabled: false,
            }),
          ),
        ),
      );

      assert.strictEqual(result, null);
      assert.strictEqual(pickFolderDialog.mock.calls.length, 0);
    }),
  );
});
