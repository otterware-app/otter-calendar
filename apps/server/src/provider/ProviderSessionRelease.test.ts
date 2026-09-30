import { assert, it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Scope from "effect/Scope";

import * as ProviderSessionRelease from "./ProviderSessionRelease.ts";

const personal = ProviderInstanceId.make("codex-personal");
const work = ProviderInstanceId.make("codex-work");
const claude = ProviderInstanceId.make("claudeAgent");

it.effect("releases only the sessions registered for the requested instances", () =>
  Effect.gen(function* () {
    const release = yield* ProviderSessionRelease.make;
    const released: string[] = [];
    const session = (name: string) => Effect.sync(() => void released.push(name));
    yield* release.register(personal, session("personal-a"));
    yield* release.register(personal, session("personal-b"));
    yield* release.register(work, session("work"));
    yield* release.register(claude, session("claude"));

    yield* release.releaseInstances(new Set([personal, work]));

    assert.sameMembers(released, ["personal-a", "personal-b", "work"]);
  }),
);

it.effect("stops releasing a session once its registration scope closes", () =>
  Effect.gen(function* () {
    const release = yield* ProviderSessionRelease.make;
    const released: string[] = [];
    const ended = yield* Scope.make();
    yield* release
      .register(
        personal,
        Effect.sync(() => void released.push("ended")),
      )
      .pipe(Scope.provide(ended));
    yield* release.register(
      personal,
      Effect.sync(() => void released.push("live")),
    );

    yield* Scope.close(ended, Exit.void);
    yield* release.releaseInstances(new Set([personal]));

    assert.deepStrictEqual(released, ["live"]);
  }),
);
