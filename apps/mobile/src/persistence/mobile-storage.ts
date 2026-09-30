import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as MobileSecureStorage from "./mobile-secure-storage";

const DEVICE_ID_KEY = "t3code.device-id";

export class MobileStorageDecodeError extends Schema.TaggedError<MobileStorageDecodeError>()(
  "MobileStorageDecodeError",
  {
    key: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to decode mobile storage value for key ${this.key}.`;
  }
}

export class MobileStorageEncodeError extends Schema.TaggedError<MobileStorageEncodeError>()(
  "MobileStorageEncodeError",
  {
    key: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to encode mobile storage value for key ${this.key}.`;
  }
}

export class MobileDeviceIdGenerationError extends Schema.TaggedError<MobileDeviceIdGenerationError>()(
  "MobileDeviceIdGenerationError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Failed to generate the mobile device id.";
  }
}

export class MobileStorage extends Context.Service<
  MobileStorage,
  {
    /** A stable per-install id: the relay device identity and the background-activity client id. */
    readonly loadOrCreateDeviceId: Effect.Effect<
      string,
      MobileSecureStorage.MobileSecureStorageError | MobileDeviceIdGenerationError
    >;
  }
>()("@t3tools/mobile/persistence/MobileStorage") {}

export const make = Effect.fn("MobileStorage.make")(function* () {
  const secureStorage = yield* MobileSecureStorage.MobileSecureStorage;

  const loadOrCreateDeviceId = Effect.gen(function* () {
    const existing = yield* secureStorage.getItem(DEVICE_ID_KEY);
    if (existing?.trim()) return existing;
    const deviceId = yield* Effect.tryPromise({
      try: () => import("../lib/uuid").then(({ uuidv4 }) => uuidv4()),
      catch: (cause) => new MobileDeviceIdGenerationError({ cause }),
    });
    yield* secureStorage.setItem(DEVICE_ID_KEY, deviceId);
    return deviceId;
  });

  return MobileStorage.of({ loadOrCreateDeviceId });
});

export const layer = Layer.effect(MobileStorage, make());
