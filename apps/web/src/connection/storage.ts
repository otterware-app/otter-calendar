import {
  ConnectionCatalogDocument,
  type ConnectionCatalogDocument as ConnectionCatalogDocumentType,
  ConnectionPersistenceError,
  ConnectionRegistrationStore,
  ConnectionTargetStore,
  EMPTY_CONNECTION_CATALOG_DOCUMENT,
  EnvironmentCacheStore,
  putRemoteDpopTokenInCatalog,
  registerConnectionInCatalog,
  removeCatalogValue,
  removeConnectionFromCatalog,
  setConnectionEnabledInCatalog,
  replaceCatalogValue,
} from "@t3tools/client-runtime/platform";
import { TokenStore } from "@t3tools/client-runtime/authorization";
import {
  ConnectionTransientError,
  CredentialStore,
  ProfileStore,
} from "@t3tools/client-runtime/connection";
import { EnvironmentId, ServerConfig } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

const DATABASE_NAME = "t3code:connection-runtime";
const DATABASE_VERSION = 4;
const CATALOG_STORE_NAME = "catalog";
const SERVER_CONFIG_STORE_NAME = "server-config";
const CATALOG_KEY = "document";
const StoredServerConfig = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  environmentId: EnvironmentId,
  config: ServerConfig,
});
const StoredServerConfigJson = Schema.fromJsonString(StoredServerConfig);
const ConnectionCatalogDocumentJson = Schema.fromJsonString(ConnectionCatalogDocument);
const decodeConnectionCatalogDocument = Schema.decodeUnknownEffect(ConnectionCatalogDocumentJson);
const encodeConnectionCatalogDocument = Schema.encodeEffect(ConnectionCatalogDocumentJson);
const decodeStoredServerConfig = Schema.decodeUnknownEffect(StoredServerConfigJson);
const encodeStoredServerConfig = Schema.encodeEffect(StoredServerConfigJson);

function catalogError(operation: string, cause: unknown) {
  return new ConnectionTransientError({
    reason: "remote-unavailable",
    detail: `Could not ${operation} the local connection catalog: ${String(cause)}`,
  });
}

function persistenceError(
  operation:
    | "list-targets"
    | "list-disabled-targets"
    | "register-connection"
    | "remove-connection"
    | "set-connection-enabled"
    | "load-server-config"
    | "save-server-config"
    | "clear-environment",
  cause: unknown,
) {
  return new ConnectionPersistenceError({
    operation,
    message: `Could not ${operation.replaceAll("-", " ")}: ${String(cause)}`,
  });
}

const openDatabase = Effect.fn("web.connectionStorage.openDatabase")(function* () {
  return yield* Effect.callback<IDBDatabase, ConnectionTransientError>((resume) => {
    if (typeof indexedDB === "undefined") {
      resume(
        Effect.fail(catalogError("open", "IndexedDB is unavailable in this browser context.")),
      );
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(CATALOG_STORE_NAME)) {
        request.result.createObjectStore(CATALOG_STORE_NAME);
      }
      if (!request.result.objectStoreNames.contains(SERVER_CONFIG_STORE_NAME)) {
        request.result.createObjectStore(SERVER_CONFIG_STORE_NAME);
      }
    });
    request.addEventListener("error", () => {
      resume(Effect.fail(catalogError("open", request.error ?? "Unknown IndexedDB error")));
    });
    request.addEventListener("success", () => {
      resume(Effect.succeed(request.result));
    });
  });
});

function readDatabaseValue(database: IDBDatabase, storeName: string, key: IDBValidKey) {
  return Effect.callback<unknown, ConnectionTransientError>((resume) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).get(key);
    request.addEventListener("error", () => {
      resume(Effect.fail(catalogError("read", request.error ?? "Unknown IndexedDB read error")));
    });
    request.addEventListener("success", () => {
      resume(Effect.succeed(request.result));
    });
  }).pipe(Effect.withSpan("web.connectionStorage.readDatabaseValue"));
}

function writeDatabaseValue(
  database: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
  value: unknown,
) {
  return Effect.callback<void, ConnectionTransientError>((resume) => {
    const transaction = database.transaction(storeName, "readwrite");
    // Every failed write fires "abort". A failed commit, such as
    // QuotaExceededError, fires only "abort" and no "error".
    transaction.addEventListener("abort", () => {
      resume(
        Effect.fail(catalogError("write", transaction.error ?? "Unknown IndexedDB write error")),
      );
    });
    transaction.addEventListener("complete", () => {
      resume(Effect.void);
    });
    transaction.objectStore(storeName).put(value, key);
  }).pipe(Effect.withSpan("web.connectionStorage.writeDatabaseValue"));
}

function removeDatabaseValue(database: IDBDatabase, storeName: string, key: IDBValidKey) {
  return Effect.callback<void, ConnectionTransientError>((resume) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.addEventListener("error", () => {
      resume(
        Effect.fail(catalogError("remove", transaction.error ?? "Unknown IndexedDB remove error")),
      );
    });
    transaction.addEventListener("complete", () => {
      resume(Effect.void);
    });
    transaction.objectStore(storeName).delete(key);
  }).pipe(Effect.withSpan("web.connectionStorage.removeDatabaseValue"));
}

const decodeCatalog = Effect.fn("web.connectionStorage.decodeCatalog")(function* (raw: string) {
  return yield* decodeConnectionCatalogDocument(raw).pipe(
    Effect.mapError((cause) => catalogError("decode", cause)),
  );
});

const encodeCatalog = Effect.fn("web.connectionStorage.encodeCatalog")(function* (
  catalog: ConnectionCatalogDocumentType,
) {
  return yield* encodeConnectionCatalogDocument(catalog).pipe(
    Effect.mapError((cause) => catalogError("encode", cause)),
  );
});

export interface CatalogBackend {
  readonly read: Effect.Effect<string | null, ConnectionTransientError>;
  readonly write: (raw: string) => Effect.Effect<void, ConnectionTransientError>;
  readonly quarantine?: (raw: string) => Effect.Effect<void, ConnectionTransientError>;
}

export function makeCatalogBackend(database: IDBDatabase): CatalogBackend {
  const bridge = window.desktopBridge;
  if (bridge?.getConnectionCatalog !== undefined && bridge.setConnectionCatalog !== undefined) {
    return {
      read: Effect.tryPromise({
        try: () => bridge.getConnectionCatalog!(),
        catch: (cause) => catalogError("load", cause),
      }),
      write: (raw) =>
        Effect.tryPromise({
          try: () => bridge.setConnectionCatalog!(raw),
          catch: (cause) => catalogError("save", cause),
        }).pipe(
          Effect.flatMap((stored) =>
            stored
              ? Effect.void
              : Effect.fail(
                  catalogError(
                    "save",
                    "Desktop secure storage is unavailable in this system context.",
                  ),
                ),
          ),
        ),
    };
  }

  return {
    read: readDatabaseValue(database, CATALOG_STORE_NAME, CATALOG_KEY).pipe(
      Effect.map((value) => (typeof value === "string" ? value : null)),
    ),
    write: (raw) => writeDatabaseValue(database, CATALOG_STORE_NAME, CATALOG_KEY, raw),
    quarantine: (raw) =>
      writeDatabaseValue(database, CATALOG_STORE_NAME, `${CATALOG_KEY}:corrupt:${Date.now()}`, raw),
  };
}

interface CatalogStore {
  readonly read: Effect.Effect<ConnectionCatalogDocumentType, ConnectionTransientError>;
  readonly update: (
    transform: (catalog: ConnectionCatalogDocumentType) => ConnectionCatalogDocumentType,
  ) => Effect.Effect<void, ConnectionTransientError>;
}

export const makeCatalogStore = Effect.fn("web.connectionStorage.makeCatalogStore")(function* (
  backend: CatalogBackend,
) {
  const state = yield* Ref.make<Option.Option<ConnectionCatalogDocumentType>>(Option.none());
  const lock = yield* Semaphore.make(1);

  const loadUnlocked = Effect.fn("web.connectionStorage.loadCatalog")(function* () {
    const cached = yield* Ref.get(state);
    if (Option.isSome(cached)) {
      return cached.value;
    }
    const raw = yield* backend.read;
    let catalog = EMPTY_CONNECTION_CATALOG_DOCUMENT;
    if (raw !== null && raw.trim() !== "") {
      catalog = yield* decodeCatalog(raw).pipe(
        Effect.catch((error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning("Discarding a corrupt web connection catalog.", {
              error: error.message,
            });
            if (backend.quarantine !== undefined) {
              yield* backend.quarantine(raw).pipe(
                Effect.catch((cause) =>
                  Effect.logWarning("Could not quarantine the corrupt web connection catalog.", {
                    error: cause.message,
                  }),
                ),
              );
            }
            const encoded = yield* encodeCatalog(EMPTY_CONNECTION_CATALOG_DOCUMENT);
            yield* backend.write(encoded).pipe(
              Effect.catch((cause) =>
                Effect.logWarning("Could not persist the recovered web connection catalog.", {
                  error: cause.message,
                }),
              ),
            );
            return EMPTY_CONNECTION_CATALOG_DOCUMENT;
          }),
        ),
      );
    }
    yield* Ref.set(state, Option.some(catalog));
    return catalog;
  });

  const read = lock.withPermits(1)(loadUnlocked());
  const update: CatalogStore["update"] = Effect.fn("web.connectionStorage.updateCatalog")(
    function* (transform) {
      yield* lock.withPermits(1)(
        Effect.gen(function* () {
          const next = transform(yield* loadUnlocked());
          yield* backend.write(yield* encodeCatalog(next));
          yield* Ref.set(state, Option.some(next));
        }),
      );
    },
  );

  return { read, update } satisfies CatalogStore;
});

export const connectionStorageLayer = Layer.effectContext(
  Effect.gen(function* () {
    const database = yield* Effect.acquireRelease(openDatabase(), (database) =>
      Effect.sync(() => database.close()),
    );
    const catalog = yield* makeCatalogStore(makeCatalogBackend(database));

    const targetStore = ConnectionTargetStore.of({
      list: catalog.read.pipe(
        Effect.map((document) => document.targets),
        Effect.mapError((cause) => persistenceError("list-targets", cause)),
      ),
      listDisabled: catalog.read.pipe(
        Effect.map((document) => document.disabledEnvironmentIds),
        Effect.mapError((cause) => persistenceError("list-disabled-targets", cause)),
      ),
    });
    const registrationStore = ConnectionRegistrationStore.of({
      register: (registration) =>
        catalog
          .update((document) => registerConnectionInCatalog(document, registration))
          .pipe(Effect.mapError((cause) => persistenceError("register-connection", cause))),
      remove: (target) =>
        catalog
          .update((document) => removeConnectionFromCatalog(document, target))
          .pipe(Effect.mapError((cause) => persistenceError("remove-connection", cause))),
      setEnabled: (environmentId, enabled) =>
        catalog
          .update((document) => setConnectionEnabledInCatalog(document, environmentId, enabled))
          .pipe(Effect.mapError((cause) => persistenceError("set-connection-enabled", cause))),
    });
    const profileStore = ProfileStore.make({
      get: (connectionId) =>
        catalog.read.pipe(
          Effect.map((document) =>
            Option.fromUndefinedOr(
              document.profiles.find((profile) => profile.connectionId === connectionId),
            ),
          ),
        ),
      put: (profile) =>
        catalog.update((document) => ({
          ...document,
          profiles: replaceCatalogValue(document.profiles, (value) => value.connectionId, profile),
        })),
      remove: (connectionId) =>
        catalog.update((document) => ({
          ...document,
          profiles: removeCatalogValue(
            document.profiles,
            (value) => value.connectionId,
            connectionId,
          ),
        })),
    });
    const credentialStore = CredentialStore.make({
      get: (connectionId) =>
        catalog.read.pipe(
          Effect.map((document) =>
            Option.fromUndefinedOr(
              document.credentials.find((entry) => entry.connectionId === connectionId)?.credential,
            ),
          ),
        ),
      put: (connectionId, credential) =>
        catalog.update((document) => ({
          ...document,
          credentials: replaceCatalogValue(document.credentials, (value) => value.connectionId, {
            connectionId,
            credential,
          }),
        })),
      remove: (connectionId) =>
        catalog.update((document) => ({
          ...document,
          credentials: removeCatalogValue(
            document.credentials,
            (value) => value.connectionId,
            connectionId,
          ),
        })),
    });
    const remoteTokenStore = TokenStore.make({
      get: (environmentId) =>
        catalog.read.pipe(
          Effect.map((document) =>
            Option.fromUndefinedOr(
              document.remoteDpopTokens.find((token) => token.environmentId === environmentId),
            ),
          ),
        ),
      put: (token) => catalog.update((document) => putRemoteDpopTokenInCatalog(document, token)),
      remove: (environmentId) =>
        catalog.update((document) => ({
          ...document,
          remoteDpopTokens: removeCatalogValue(
            document.remoteDpopTokens,
            (value) => value.environmentId,
            environmentId,
          ),
        })),
    });
    const cacheStore = EnvironmentCacheStore.of({
      loadServerConfig: (environmentId) =>
        readDatabaseValue(database, SERVER_CONFIG_STORE_NAME, environmentId).pipe(
          Effect.flatMap((raw) => {
            if (typeof raw !== "string") {
              return Effect.succeedNone;
            }
            return decodeStoredServerConfig(raw).pipe(
              Effect.mapError((cause) => persistenceError("load-server-config", cause)),
              Effect.map((stored) =>
                stored.environmentId === environmentId ? Option.some(stored.config) : Option.none(),
              ),
            );
          }),
          Effect.mapError((cause) =>
            cause._tag === "ConnectionPersistenceError"
              ? cause
              : persistenceError("load-server-config", cause),
          ),
        ),
      saveServerConfig: (environmentId, config) =>
        Effect.gen(function* () {
          const encoded = yield* encodeStoredServerConfig({
            schemaVersion: 1,
            environmentId,
            config,
          }).pipe(Effect.mapError((cause) => persistenceError("save-server-config", cause)));
          yield* writeDatabaseValue(database, SERVER_CONFIG_STORE_NAME, environmentId, encoded);
        }).pipe(
          Effect.mapError((cause) =>
            cause._tag === "ConnectionPersistenceError"
              ? cause
              : persistenceError("save-server-config", cause),
          ),
        ),
      clear: (environmentId) =>
        removeDatabaseValue(database, SERVER_CONFIG_STORE_NAME, environmentId).pipe(
          Effect.mapError((cause) => persistenceError("clear-environment", cause)),
        ),
    });

    return Context.make(ConnectionTargetStore, targetStore).pipe(
      Context.add(ConnectionRegistrationStore, registrationStore),
      Context.add(ProfileStore.ConnectionProfileStore, profileStore),
      Context.add(CredentialStore.ConnectionCredentialStore, credentialStore),
      Context.add(TokenStore.RemoteDpopAccessTokenStore, remoteTokenStore),
      Context.add(EnvironmentCacheStore, cacheStore),
    );
  }),
);
