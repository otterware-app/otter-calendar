/**
 * ProviderSessionRelease - how sign-in changes reach live provider sessions.
 *
 * Whoever opens a provider session (the agent service) registers a release
 * effect for as long as the session lives. Signing in, signing out, or
 * importing a profile releases every live session of the affected instances
 * before the credentials change, so no session keeps running on the old
 * account.
 *
 * @module provider/ProviderSessionRelease
 */
import type { ProviderInstanceId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import type * as Scope from "effect/Scope";

export interface ProviderSessionReleaseShape {
  /** Registers `release` until the surrounding scope closes. */
  readonly register: (
    instanceId: ProviderInstanceId,
    release: Effect.Effect<void>,
  ) => Effect.Effect<void, never, Scope.Scope>;
  /** Runs the release effect of every session registered for these instances. */
  readonly releaseInstances: (instanceIds: ReadonlySet<ProviderInstanceId>) => Effect.Effect<void>;
}

export class ProviderSessionRelease extends Context.Service<
  ProviderSessionRelease,
  ProviderSessionReleaseShape
>()("t3/provider/ProviderSessionRelease") {}

interface Registration {
  readonly instanceId: ProviderInstanceId;
  readonly release: Effect.Effect<void>;
}

export const make = Effect.gen(function* () {
  const registrations = yield* Ref.make<ReadonlySet<Registration>>(new Set());

  const register: ProviderSessionReleaseShape["register"] = (instanceId, release) => {
    const registration: Registration = { instanceId, release };
    return Effect.acquireRelease(
      Ref.update(registrations, (current) => new Set([...current, registration])),
      () =>
        Ref.update(
          registrations,
          (current) => new Set([...current].filter((entry) => entry !== registration)),
        ),
    );
  };

  const releaseInstances: ProviderSessionReleaseShape["releaseInstances"] = (instanceIds) =>
    Ref.get(registrations).pipe(
      Effect.flatMap((current) =>
        Effect.forEach(
          [...current].filter((entry) => instanceIds.has(entry.instanceId)),
          (entry) => entry.release,
          { concurrency: "unbounded", discard: true },
        ),
      ),
    );

  return ProviderSessionRelease.of({ register, releaseInstances });
});

export const layer = Layer.effect(ProviderSessionRelease, make);
