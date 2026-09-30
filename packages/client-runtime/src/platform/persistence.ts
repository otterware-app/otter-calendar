import { type EnvironmentId, type ServerConfig } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { ConnectionRegistration } from "../connection/catalog.ts";
import type { ConnectionTarget } from "../connection/model.ts";

export class ConnectionPersistenceError extends Schema.TaggedError<ConnectionPersistenceError>()(
  "ConnectionPersistenceError",
  {
    operation: Schema.Literals([
      "list-targets",
      "list-disabled-targets",
      "register-connection",
      "remove-connection",
      "set-connection-enabled",
      "load-server-config",
      "save-server-config",
      "clear-environment",
    ]),
    message: Schema.String,
  },
) {}

export class ConnectionTargetStore extends Context.Service<
  ConnectionTargetStore,
  {
    readonly list: Effect.Effect<ReadonlyArray<ConnectionTarget>, ConnectionPersistenceError>;
    /** Saved environments the user switched off. See `ConnectionRegistrationStore.setEnabled`. */
    readonly listDisabled: Effect.Effect<ReadonlyArray<EnvironmentId>, ConnectionPersistenceError>;
  }
>()("@t3tools/client-runtime/platform/persistence/ConnectionTargetStore") {}

export class ConnectionRegistrationStore extends Context.Service<
  ConnectionRegistrationStore,
  {
    readonly register: (
      registration: ConnectionRegistration,
    ) => Effect.Effect<void, ConnectionPersistenceError>;
    readonly remove: (target: ConnectionTarget) => Effect.Effect<void, ConnectionPersistenceError>;
    readonly setEnabled: (
      environmentId: EnvironmentId,
      enabled: boolean,
    ) => Effect.Effect<void, ConnectionPersistenceError>;
  }
>()("@t3tools/client-runtime/platform/persistence/ConnectionRegistrationStore") {}

export class EnvironmentCacheStore extends Context.Service<
  EnvironmentCacheStore,
  {
    /**
     * The last complete server configuration. This deliberately includes provider
     * metadata so offline task creation can still offer the models a user last saw.
     */
    readonly loadServerConfig: (
      environmentId: EnvironmentId,
    ) => Effect.Effect<Option.Option<ServerConfig>, ConnectionPersistenceError>;
    readonly saveServerConfig: (
      environmentId: EnvironmentId,
      config: ServerConfig,
    ) => Effect.Effect<void, ConnectionPersistenceError>;
    readonly clear: (
      environmentId: EnvironmentId,
    ) => Effect.Effect<void, ConnectionPersistenceError>;
  }
>()("@t3tools/client-runtime/platform/persistence/EnvironmentCacheStore") {}

export class EnvironmentOwnedDataCleanup extends Context.Reference<{
  readonly clear: (environmentId: EnvironmentId) => Effect.Effect<void>;
}>("@t3tools/client-runtime/platform/persistence/EnvironmentOwnedDataCleanup", {
  defaultValue: () => ({
    clear: () => Effect.void,
  }),
}) {}
