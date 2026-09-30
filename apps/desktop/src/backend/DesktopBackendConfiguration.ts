import { parsePersistedServerObservabilitySettings } from "@t3tools/shared/serverSettings";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import * as DesktopBackendManager from "./DesktopBackendManager.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopServerExposure from "./DesktopServerExposure.ts";

export class DesktopBackendObservabilitySettingsReadError extends Schema.TaggedError<DesktopBackendObservabilitySettingsReadError>()(
  "DesktopBackendObservabilitySettingsReadError",
  {
    settingsPath: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to read persisted backend observability settings at ${this.settingsPath}.`;
  }
}

export class DesktopBackendConfiguration extends Context.Service<
  DesktopBackendConfiguration,
  {
    // Build the bundled backend's start config. Reads the port/host/exposure
    // from DesktopServerExposure. Can fail with PlatformError because bootstrap
    // token generation uses crypto.randomBytes.
    readonly resolvePrimary: Effect.Effect<
      DesktopBackendManager.DesktopBackendStartConfig,
      PlatformError.PlatformError
    >;
  }
>()("@t3tools/desktop/backend/DesktopBackendConfiguration") {}

interface BackendObservabilitySettings {
  readonly otlpTracesUrl: Option.Option<string>;
  readonly otlpMetricsUrl: Option.Option<string>;
  readonly otlpLogsUrl: Option.Option<string>;
}

const emptyBackendObservabilitySettings: BackendObservabilitySettings = {
  otlpTracesUrl: Option.none(),
  otlpMetricsUrl: Option.none(),
  otlpLogsUrl: Option.none(),
};

const DESKTOP_BACKEND_ENV_NAMES = [
  "T3CODE_PORT",
  "T3CODE_MODE",
  "T3CODE_NO_BROWSER",
  "T3CODE_HOST",
  "T3CODE_DESKTOP_WS_URL",
  "T3CODE_DESKTOP_LAN_ACCESS",
  "T3CODE_DESKTOP_LAN_HOST",
  "T3CODE_DESKTOP_HTTPS_ENDPOINTS",
  "T3CODE_TAILSCALE_SERVE",
  "T3CODE_TAILSCALE_SERVE_PORT",
] as const;

const backendChildEnvPatch = (): Record<string, string | undefined> =>
  Object.fromEntries(DESKTOP_BACKEND_ENV_NAMES.map((name) => [name, undefined]));

const logBackendObservabilitySettingsReadFailure = (
  settingsPath: string,
  cause: PlatformError.PlatformError,
) => {
  const error = new DesktopBackendObservabilitySettingsReadError({ settingsPath, cause });
  return Effect.logWarning(error).pipe(
    Effect.annotateLogs({
      component: "desktop-backend-configuration",
      error,
    }),
  );
};

const readPersistedBackendObservabilitySettings = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const raw = yield* fileSystem.readFileString(environment.serverSettingsPath).pipe(
    Effect.asSome,
    Effect.catchTags({
      PlatformError: (cause) =>
        cause.reason._tag === "NotFound"
          ? Effect.succeedNone
          : logBackendObservabilitySettingsReadFailure(environment.serverSettingsPath, cause).pipe(
              Effect.as(Option.none()),
            ),
    }),
  );
  if (Option.isNone(raw)) {
    return emptyBackendObservabilitySettings;
  }

  const parsed = parsePersistedServerObservabilitySettings(raw.value);
  return {
    otlpTracesUrl: Option.fromNullishOr(parsed.otlpTracesUrl),
    otlpMetricsUrl: Option.fromNullishOr(parsed.otlpMetricsUrl),
    otlpLogsUrl: Option.fromNullishOr(parsed.otlpLogsUrl),
  };
});

// The bootstrap carries the OTLP endpoints to the backend. Env beats the
// persisted settings file, matching the precedence resolveServerConfig and
// DesktopObservability apply.
const readBackendObservabilitySettings = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const persisted = yield* readPersistedBackendObservabilitySettings;
  return {
    otlpTracesUrl: Option.orElse(environment.otlpTracesUrl, () => persisted.otlpTracesUrl),
    otlpMetricsUrl: Option.orElse(environment.otlpMetricsUrl, () => persisted.otlpMetricsUrl),
    otlpLogsUrl: Option.orElse(environment.otlpLogsUrl, () => persisted.otlpLogsUrl),
  } satisfies BackendObservabilitySettings;
});

const buildObservabilityFragment = (observabilitySettings: BackendObservabilitySettings) => ({
  ...Option.match(observabilitySettings.otlpTracesUrl, {
    onNone: () => ({}),
    onSome: (otlpTracesUrl) => ({ otlpTracesUrl }),
  }),
  ...Option.match(observabilitySettings.otlpMetricsUrl, {
    onNone: () => ({}),
    onSome: (otlpMetricsUrl) => ({ otlpMetricsUrl }),
  }),
  ...Option.match(observabilitySettings.otlpLogsUrl, {
    onNone: () => ({}),
    onSome: (otlpLogsUrl) => ({ otlpLogsUrl }),
  }),
});

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const fileSystem = yield* FileSystem.FileSystem;
  const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
  const crypto = yield* Crypto.Crypto;
  // One token per desktop run: the renderer keeps it across backend restarts.
  const tokenRef = yield* Ref.make(Option.none<string>());
  const getOrCreateBootstrapToken = Effect.gen(function* () {
    const existing = yield* Ref.get(tokenRef);
    if (Option.isSome(existing)) return existing.value;
    const token = Encoding.encodeHex(yield* crypto.randomBytes(24));
    yield* Ref.set(tokenRef, Option.some(token));
    return token;
  });

  return DesktopBackendConfiguration.of({
    resolvePrimary: Effect.gen(function* () {
      const bootstrapToken = yield* getOrCreateBootstrapToken;
      // Re-read each resolve so an edited server-settings file is picked up on
      // the next restart without bouncing the desktop process.
      const observabilitySettings = yield* readBackendObservabilitySettings.pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provideService(DesktopEnvironment.DesktopEnvironment, environment),
      );
      const backendExposure = yield* serverExposure.backendConfig;

      return {
        executablePath: process.execPath,
        // Packaged builds only, so a dev instance never shares the cache with the
        // prod app it is often run from. `--require` rather than NODE_COMPILE_CACHE,
        // so the setting does not leak into the provider processes the backend
        // starts.
        args: [
          ...(environment.isPackaged ? ["--require", environment.compileCachePath] : []),
          environment.backendEntryPath,
          "--bootstrap-fd",
          "3",
        ],
        entryPath: environment.backendEntryPath,
        cwd: environment.backendCwd,
        env: {
          ...backendChildEnvPatch(),
          ELECTRON_RUN_AS_NODE: "1",
        },
        bootstrap: {
          mode: "desktop",
          noBrowser: true,
          port: backendExposure.port,
          t3Home: environment.baseDir,
          host: backendExposure.bindHost,
          desktopBootstrapToken: bootstrapToken,
          tailscaleServeEnabled: backendExposure.tailscaleServeEnabled,
          tailscaleServePort: backendExposure.tailscaleServePort,
          ...buildObservabilityFragment(observabilitySettings),
        },
        httpBaseUrl: backendExposure.httpBaseUrl,
        captureOutput: true,
      } satisfies DesktopBackendManager.DesktopBackendStartConfig;
    }).pipe(Effect.withSpan("desktop.backendConfiguration.resolvePrimary")),
  });
});

export const layer = Layer.effect(DesktopBackendConfiguration, make);
