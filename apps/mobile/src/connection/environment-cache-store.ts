import {
  ConnectionPersistenceError,
  EnvironmentCacheStore,
} from "@t3tools/client-runtime/platform";
import { type EnvironmentId, ServerConfig } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as MobileDatabase from "../persistence/mobile-database";

const SERVER_CONFIG_CACHE_SCHEMA_VERSION = 1;

const StoredServerConfig = Schema.Struct({
  schemaVersion: Schema.Literal(SERVER_CONFIG_CACHE_SCHEMA_VERSION),
  environmentId: Schema.String,
  config: ServerConfig,
});

const decodeStoredServerConfig = Schema.decodeUnknownEffect(
  Schema.fromJsonString(StoredServerConfig),
);
const encodeStoredServerConfig = Schema.encodeEffect(Schema.fromJsonString(StoredServerConfig));

type CacheOperation = ConnectionPersistenceError["operation"];

function persistenceError(operation: CacheOperation, cause: unknown) {
  return new ConnectionPersistenceError({
    operation,
    message: `Could not ${operation.replaceAll("-", " ")}: ${String(cause)}`,
  });
}

function mapDatabaseError(operation: CacheOperation) {
  return (error: MobileDatabase.MobileDatabaseError) => persistenceError(operation, error);
}

export const make = Effect.fn("MobileEnvironmentCacheStore.make")(function* () {
  const database = yield* MobileDatabase.MobileDatabase;
  return EnvironmentCacheStore.of({
    loadServerConfig: Effect.fn("MobileEnvironmentCache.loadServerConfig")((environmentId) =>
      database.loadCache(environmentId, "server-config", "config").pipe(
        Effect.mapError(mapDatabaseError("load-server-config")),
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.succeed(Option.none<ServerConfig>()),
            onSome: (raw) =>
              decodeStoredServerConfig(raw).pipe(
                Effect.map((stored) =>
                  stored.environmentId === environmentId
                    ? Option.some(stored.config)
                    : Option.none(),
                ),
                // A record this build cannot decode is a miss; drop it so it is rewritten.
                Effect.catch((cause) =>
                  Effect.logWarning("Discarding corrupt mobile client cache record.", {
                    environmentId,
                    cause: String(cause),
                  }).pipe(
                    Effect.andThen(
                      database
                        .removeCache(environmentId, "server-config", "config")
                        .pipe(Effect.catch(() => Effect.void)),
                    ),
                    Effect.as(Option.none<ServerConfig>()),
                  ),
                ),
              ),
          }),
        ),
      ),
    ),
    saveServerConfig: Effect.fn("MobileEnvironmentCache.saveServerConfig")(
      function* (environmentId, config) {
        const payload = yield* encodeStoredServerConfig({
          schemaVersion: SERVER_CONFIG_CACHE_SCHEMA_VERSION,
          environmentId,
          config,
        }).pipe(Effect.mapError((cause) => persistenceError("save-server-config", cause)));
        yield* database
          .saveCache(
            environmentId,
            "server-config",
            "config",
            SERVER_CONFIG_CACHE_SCHEMA_VERSION,
            payload,
          )
          .pipe(Effect.mapError(mapDatabaseError("save-server-config")));
      },
    ),
    clear: Effect.fn("MobileEnvironmentCache.clear")((environmentId: EnvironmentId) =>
      database
        .clearEnvironmentCache(environmentId)
        .pipe(Effect.mapError(mapDatabaseError("clear-environment"))),
    ),
  });
});

export const layer = Layer.effect(EnvironmentCacheStore, make());
