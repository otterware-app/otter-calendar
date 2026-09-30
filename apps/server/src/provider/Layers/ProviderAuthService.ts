import { BRAND } from "@t3tools/shared/brand";
import { ProviderSetupError, type ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as Semaphore from "effect/Semaphore";

import { ProviderSessionRelease } from "../ProviderSessionRelease.ts";
import * as ProviderAuthService from "../Services/ProviderAuthService.ts";
import { ProviderInstanceRegistry } from "../Services/ProviderInstanceRegistry.ts";

export const makeProviderAuthService = Effect.gen(function* () {
  const registry = yield* ProviderInstanceRegistry;
  const sessionRelease = yield* ProviderSessionRelease;
  const credentialChanges = yield* Semaphore.make(1);

  const getController = Effect.fn("ProviderAuthService.getController")(function* (
    instanceId: ProviderInstanceId,
    operation: string,
  ) {
    const instance = yield* registry.getInstance(instanceId);
    if (!instance?.auth) {
      return yield* new ProviderSetupError({
        instanceId,
        operation,
        detail: instance
          ? `This provider does not support sign-in in ${BRAND.displayName}.`
          : "This provider instance is no longer available.",
      });
    }
    return instance.auth;
  });

  // Instances sharing a credential binding sign in and out together, so a
  // change stops their sessions too.
  const stopSessions = Effect.fn("ProviderAuthService.stopSessions")(function* (
    instanceId: ProviderInstanceId,
    binding: ProviderAuthService.ProviderAuthController["credentialBinding"],
  ) {
    const related =
      binding === undefined
        ? []
        : (yield* registry.listInstances).filter(
            (instance) =>
              instance.instanceId !== instanceId &&
              instance.auth?.credentialBinding?.key === binding.key &&
              instance.auth.credentialBinding.owner === binding.owner,
          );
    yield* sessionRelease.releaseInstances(
      new Set([instanceId, ...related.map((instance) => instance.instanceId)]),
    );
    yield* Effect.forEach(related, (instance) => instance.auth?.invalidate ?? Effect.void, {
      discard: true,
    });
  });

  const checkSharedBinding = Effect.fnUntraced(function* (
    instanceId: ProviderInstanceId,
    operation: "start" | "logout",
    auth: ProviderAuthService.ProviderAuthController,
  ) {
    const binding = auth.credentialBinding;
    if (!binding) return;
    const instances = yield* registry.listInstances;
    for (const instance of instances) {
      if (
        instance.instanceId !== instanceId &&
        instance.auth?.credentialBinding?.key === binding.key &&
        instance.auth.credentialBinding.owner === binding.owner &&
        instance.auth.isChangingCredentials &&
        (yield* instance.auth.isChangingCredentials)
      ) {
        return yield* new ProviderSetupError({
          instanceId,
          operation,
          detail:
            "Another provider instance is changing this shared sign-in. Finish or cancel it first.",
        });
      }
    }
  });

  return ProviderAuthService.ProviderAuthService.of({
    reconnectProfile: Effect.fnUntraced(function* (input) {
      const auth = yield* getController(input.instanceId, "export");
      if (!auth.reconnectProfile)
        return yield* new ProviderSetupError({
          instanceId: input.instanceId,
          operation: "export",
          detail: "This provider does not support ChatGPT profile transfer.",
        });
      return yield* auth.reconnectProfile(input.methodId);
    }),
    importProfile: (input) =>
      credentialChanges.withPermit(
        Effect.gen(function* () {
          const auth = yield* getController(input.instanceId, "import");
          yield* checkSharedBinding(input.instanceId, "start", auth);
          if (!auth.importProfile)
            return yield* new ProviderSetupError({
              instanceId: input.instanceId,
              operation: "import",
              detail: "This provider does not support ChatGPT profile transfer.",
            });
          return yield* auth.importProfile(
            input.profile,
            stopSessions(input.instanceId, auth.credentialBinding),
          );
        }),
      ),
    start: Effect.fn("ProviderAuthService.start")(function* (input, ownerSessionId) {
      return yield* credentialChanges.withPermit(
        Effect.gen(function* () {
          const auth = yield* getController(input.instanceId, "start");
          yield* checkSharedBinding(input.instanceId, "start", auth);
          return yield* auth.start(
            ownerSessionId,
            stopSessions(input.instanceId, auth.credentialBinding),
            input.methodId,
            input.returnUrl,
            input.callbackMode,
          );
        }),
      );
    }),
    respond: Effect.fn("ProviderAuthService.respond")(function* (input, ownerSessionId) {
      const auth = yield* getController(input.instanceId, "respond");
      if (!auth.respond) {
        return yield* new ProviderSetupError({
          instanceId: input.instanceId,
          operation: "respond",
          detail: "This provider does not accept this sign-in interaction.",
        });
      }
      return yield* auth.respond(ownerSessionId, input);
    }),
    complete: Effect.fn("ProviderAuthService.complete")(function* (input, ownerSessionId) {
      const auth = yield* getController(input.instanceId, "complete");
      return yield* auth.complete(ownerSessionId, input);
    }),
    cancel: Effect.fn("ProviderAuthService.cancel")(function* (input, ownerSessionId) {
      const auth = yield* getController(input.instanceId, "cancel");
      return yield* auth.cancel(ownerSessionId, input.flowId);
    }),
    logout: Effect.fn("ProviderAuthService.logout")(function* (input) {
      return yield* credentialChanges.withPermit(
        Effect.gen(function* () {
          const auth = yield* getController(input.instanceId, "logout");
          yield* checkSharedBinding(input.instanceId, "logout", auth);
          return yield* auth.logout(stopSessions(input.instanceId, auth.credentialBinding));
        }),
      );
    }),
    subscribe: (input, ownerSessionId) =>
      Effect.gen(function* () {
        const changes = yield* registry.subscribeChanges;
        const initial = yield* getController(input.instanceId, "subscribe");
        return Stream.concat(
          Stream.succeed(initial),
          Stream.fromSubscription(changes).pipe(
            Stream.mapEffect(() => getController(input.instanceId, "subscribe")),
          ),
        ).pipe(
          Stream.changesWith((previous, next) => previous === next),
          Stream.switchMap((auth) => auth.subscribe(ownerSessionId)),
        );
      }).pipe(Stream.unwrap),
    tryHandlePromptCommand: Effect.fn("ProviderAuthService.tryHandlePromptCommand")(
      function* (input) {
        const instance = yield* registry.getInstance(input.instanceId);
        if (!instance?.auth?.isLogoutPrompt?.(input.text, input.hasAttachments)) {
          return false;
        }
        return yield* credentialChanges.withPermit(
          Effect.gen(function* () {
            const auth = yield* getController(input.instanceId, "logout");
            if (!auth.isLogoutPrompt?.(input.text, input.hasAttachments)) return false;
            yield* checkSharedBinding(input.instanceId, "logout", auth);
            yield* auth.logout(stopSessions(input.instanceId, auth.credentialBinding));
            return true;
          }),
        );
      },
    ),
  });
});

export const ProviderAuthServiceLive = Layer.effect(
  ProviderAuthService.ProviderAuthService,
  makeProviderAuthService,
);
