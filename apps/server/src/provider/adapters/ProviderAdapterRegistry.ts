import {
  ProviderInstanceId,
  ProviderSetupError,
  type OrchestrationV2ProviderCapabilities,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";

import { ProviderInstanceRegistry } from "../Services/ProviderInstanceRegistry.ts";
import { ProviderAdapterDriverCreateError } from "./ProviderAdapterDriver.ts";
import {
  ProviderAdapterOpenSessionError,
  type ProviderAdapterV2Shape,
  type ProviderAdapterV2SessionRuntime,
  type ProviderAdapterV2Error,
} from "./ProviderAdapter.ts";

const isProviderSetupError = Schema.is(ProviderSetupError);

export class ProviderAdapterRegistryLookupError extends Schema.TaggedError<ProviderAdapterRegistryLookupError>()(
  "ProviderAdapterRegistryLookupError",
  {
    instanceId: ProviderInstanceId,
  },
) {
  override get message(): string {
    return `No orchestration provider adapter is registered for ${this.instanceId}.`;
  }
}

export class ProviderAdapterRegistryMetadataError extends Schema.TaggedError<ProviderAdapterRegistryMetadataError>()(
  "ProviderAdapterRegistryMetadataError",
  { instanceId: ProviderInstanceId, cause: Schema.Defect() },
) {}

export const ProviderAdapterRegistryV2Error = Schema.Union([
  ProviderAdapterRegistryLookupError,
  ProviderAdapterRegistryMetadataError,
  ProviderAdapterDriverCreateError,
]);
export type ProviderAdapterRegistryV2Error = typeof ProviderAdapterRegistryV2Error.Type;

export interface ProviderAdapterRegistryV2Shape {
  readonly get: (
    instanceId: ProviderInstanceId,
  ) => Effect.Effect<ProviderAdapterV2Shape, ProviderAdapterRegistryV2Error>;
  readonly list: () => Effect.Effect<ReadonlyArray<ProviderInstanceId>>;
  readonly getMetadata?: (instanceId: ProviderInstanceId) => Effect.Effect<
    {
      readonly driver: ProviderAdapterV2Shape["driver"];
      readonly continuationKey: string;
      readonly enabled: boolean;
      readonly capabilities: OrchestrationV2ProviderCapabilities;
    },
    ProviderAdapterRegistryV2Error
  >;
}

export class ProviderAdapterRegistryV2 extends Context.Service<
  ProviderAdapterRegistryV2,
  ProviderAdapterRegistryV2Shape
>()("t3/provider/adapters/ProviderAdapterRegistry/ProviderAdapterRegistryV2") {}

/**
 * Production facade over the canonical provider-instance registry. Adapter
 * lookup stays dynamic so instance hot reloads and removals are visible
 * without maintaining a second settings watcher or instance map.
 */
export const layerFromProviderInstanceRegistry: Layer.Layer<
  ProviderAdapterRegistryV2,
  never,
  ProviderInstanceRegistry
> = Layer.effect(
  ProviderAdapterRegistryV2,
  Effect.gen(function* () {
    const instances = yield* ProviderInstanceRegistry;
    return ProviderAdapterRegistryV2.of({
      get: (instanceId) =>
        instances.getInstance(instanceId).pipe(
          Effect.flatMap((instance) => {
            if (instance === undefined)
              return new ProviderAdapterRegistryLookupError({ instanceId });
            const adapter = instance.orchestrationAdapter;
            const auth = instance.auth;
            if (!auth) return Effect.succeed(adapter);
            return Effect.succeed({
              ...adapter,
              openSession: (input) => {
                const open = Effect.gen(function* () {
                  const binding = auth.credentialBinding;
                  const related = binding
                    ? (yield* instances.listInstances).filter(
                        (instance) =>
                          instance.auth?.credentialBinding?.key === binding.key &&
                          instance.auth.credentialBinding.owner === binding.owner,
                      )
                    : [instance];
                  for (const instance of related) {
                    if (
                      instance.auth?.isChangingCredentials &&
                      (yield* instance.auth.isChangingCredentials)
                    )
                      return yield* new ProviderSetupError({
                        instanceId,
                        operation: "session",
                        detail: "This provider's sign-in is changing. Try again after it finishes.",
                      });
                  }
                  let admitted: Effect.Effect<
                    ProviderAdapterV2SessionRuntime,
                    ProviderAdapterV2Error | ProviderSetupError,
                    Scope.Scope
                  > = adapter.openSession(input);
                  // Shared credential changes must interrupt a peer's startup too.
                  for (const peer of related) {
                    if (peer.auth?.withAccess) admitted = peer.auth.withAccess(admitted);
                  }
                  return yield* admitted;
                });
                return open.pipe(
                  Effect.mapError((cause) =>
                    isProviderSetupError(cause)
                      ? new ProviderAdapterOpenSessionError({
                          driver: adapter.driver,
                          providerSessionId: input.providerSessionId,
                          cause,
                        })
                      : cause,
                  ),
                );
              },
            } satisfies ProviderAdapterV2Shape);
          }),
        ),
      list: () =>
        instances.listInstances.pipe(
          Effect.map((available) => available.map((instance) => instance.instanceId)),
        ),
      getMetadata: (instanceId) =>
        Effect.gen(function* () {
          const instance = yield* instances.getInstance(instanceId);
          if (instance === undefined) {
            return yield* new ProviderAdapterRegistryLookupError({ instanceId });
          }
          const capabilities = yield* instance.orchestrationAdapter
            .getCapabilities()
            .pipe(
              Effect.mapError(
                (cause) => new ProviderAdapterRegistryMetadataError({ instanceId, cause }),
              ),
            );
          return {
            driver: instance.driverKind,
            continuationKey: instance.continuationIdentity.continuationKey,
            enabled: instance.enabled,
            capabilities,
          };
        }),
    });
  }),
);

function makeRegistry(
  adapters: ReadonlyArray<ProviderAdapterV2Shape>,
): ProviderAdapterRegistryV2Shape {
  return {
    get: (instanceId) =>
      Effect.gen(function* () {
        const adapter = adapters.find((candidate) => candidate.instanceId === instanceId);
        if (!adapter) {
          return yield* new ProviderAdapterRegistryLookupError({ instanceId });
        }
        return adapter;
      }),
    list: () => Effect.succeed(adapters.map((adapter) => adapter.instanceId)),
  };
}

/** A registry holding one adapter, for tests that drive a single provider. */
export function makeSingleLayer(
  adapter: ProviderAdapterV2Shape,
): Layer.Layer<ProviderAdapterRegistryV2> {
  return Layer.succeed(
    ProviderAdapterRegistryV2,
    ProviderAdapterRegistryV2.of(makeRegistry([adapter])),
  );
}
