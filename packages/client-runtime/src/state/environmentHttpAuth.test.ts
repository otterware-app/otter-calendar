import { describe, expect, it } from "@effect/vitest";
import { EnvironmentId, type AuthSessionState } from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import { TestClock } from "effect/testing";

import { RemoteEnvironmentAuthorization } from "../authorization/service.ts";
import {
  ConnectionTransientError,
  RelayConnectionTarget,
  type PreparedConnection,
  type PreparedHttpAuthorization,
} from "../connection/model.ts";
import { ManagedRelayDpopSigner, type ManagedRelayDpopProofInput } from "../relay/managedRelay.ts";
import { remoteHttpClientLayer } from "../rpc/http.ts";
import { fetchEnvironmentSessionState } from "./session.ts";

const TARGET = new RelayConnectionTarget({
  environmentId: EnvironmentId.make("environment-1"),
  label: "Remote environment",
});
const PREPARED: PreparedConnection = {
  environmentId: TARGET.environmentId,
  label: TARGET.label,
  httpBaseUrl: "https://previous.example.test",
  socketUrl: "wss://previous.example.test/ws",
  httpAuthorization: { _tag: "Dpop", accessToken: "expired-token", expiresAtEpochMs: 0 },
  target: TARGET,
};
const CURRENT_ORIGIN = "https://current.example.test";
const RENEWED_ORIGIN = "https://renewed.example.test";
const AUTH = {
  policy: "remote-reachable",
  bootstrapMethods: ["one-time-token"],
  sessionMethods: ["dpop-access-token"],
  sessionCookieName: "t3_session",
} satisfies AuthSessionState["auth"];
const SESSION = {
  authenticated: true,
  auth: AUTH,
  scopes: ["orchestration:read", "orchestration:operate"],
  sessionMethod: "dpop-access-token",
} satisfies AuthSessionState;
const UNAUTHENTICATED_SESSION = { authenticated: false, auth: AUTH } satisfies AuthSessionState;

function makeHarness(reply: (requestNumber: number) => Response | Promise<Response>) {
  const calls: Array<{ readonly url: string; readonly init: RequestInit }> = [];
  const authorizations: Array<
    Parameters<RemoteEnvironmentAuthorization["Service"]["authorizeDpopHttp"]>[0]
  > = [];
  const proofs: Array<ManagedRelayDpopProofInput> = [];
  const remoteAuthorization = RemoteEnvironmentAuthorization.of({
    authorizeBearer: () => Effect.die("Unexpected bearer connection preparation."),
    authorizeDpop: () => Effect.die("HTTP requests must not prepare a WebSocket connection."),
    authorizeDpopHttp: (input) =>
      Effect.sync(() => {
        authorizations.push(input);
        const rejected = input.rejectedAccessToken !== undefined;
        return {
          environmentId: TARGET.environmentId,
          label: TARGET.label,
          httpBaseUrl: rejected ? RENEWED_ORIGIN : CURRENT_ORIGIN,
          httpAuthorization: {
            _tag: "Dpop" as const,
            accessToken: rejected ? "renewed-token" : "current-token",
            expiresAtEpochMs: 3_600_000,
          },
        };
      }),
  });
  const signer = ManagedRelayDpopSigner.of({
    thumbprint: Effect.succeed("test-thumbprint"),
    createProof: (input) =>
      Effect.sync(() => {
        proofs.push(input);
        return `proof-${proofs.length}`;
      }),
  });
  const fetchFn: typeof fetch = async (request, init) => {
    calls.push({ url: String(request), init: init ?? {} });
    return reply(calls.length);
  };
  return {
    calls,
    authorizations,
    proofs,
    remoteAuthorization,
    input: {
      prepared: PREPARED,
      signer: Option.some(signer),
      remoteAuthorization: Option.some(remoteAuthorization),
    },
    httpLayer: remoteHttpClientLayer(fetchFn),
  };
}

describe("authenticated environment HTTP requests", () => {
  it.effect("rejects an invalid session response", () =>
    Effect.gen(function* () {
      const harness = makeHarness(() => Response.json({}));
      const result = yield* fetchEnvironmentSessionState(harness.input).pipe(
        Effect.provide(harness.httpLayer),
        Effect.asVoid,
        Effect.flip,
      );
      expect(result._tag).toBe("RemoteEnvironmentAuthInvalidJsonError");
      expect(harness.calls).toHaveLength(1);
    }),
  );

  it.effect("uses current relay authorization and endpoint for the session", () =>
    Effect.gen(function* () {
      const harness = makeHarness(() => Response.json(SESSION));
      const result = yield* fetchEnvironmentSessionState(harness.input).pipe(
        Effect.provide(harness.httpLayer),
      );

      expect(result).toEqual(SESSION);
      expect(harness.calls).toHaveLength(1);
      const call = harness.calls[0]!;
      const url = new URL(call.url);
      expect(url.origin).toBe(CURRENT_ORIGIN);
      expect(url.pathname).toBe("/api/auth/session");
      expect(call.init.method).toBe("GET");
      expect(new Headers(call.init.headers).get("authorization")).toBe("DPoP current-token");
      expect(new Headers(call.init.headers).get("dpop")).toBe("proof-1");
      expect(call.init.credentials).toBeUndefined();
      expect(harness.authorizations).toEqual([{ expectedEnvironmentId: TARGET.environmentId }]);
      expect(harness.proofs).toEqual([
        {
          method: "GET",
          url: `${CURRENT_ORIGIN}/api/auth/session`,
          accessToken: "current-token",
        },
      ]);
      expect(PREPARED.httpAuthorization).toMatchObject({ accessToken: "expired-token" });
    }),
  );

  it.effect("recovers a session's unauthenticated 200 response before checking permissions", () =>
    Effect.gen(function* () {
      const harness = makeHarness((requestNumber) =>
        Response.json(requestNumber === 1 ? UNAUTHENTICATED_SESSION : SESSION),
      );
      const result = yield* fetchEnvironmentSessionState(harness.input).pipe(
        Effect.provide(harness.httpLayer),
      );

      expect(result).toEqual(SESSION);
      expect(harness.authorizations[1]).toEqual({
        expectedEnvironmentId: TARGET.environmentId,
        rejectedAccessToken: "current-token",
      });
      expect(harness.calls).toHaveLength(2);
    }),
  );

  it.effect("reports persistent session rejection instead of showing missing permissions", () =>
    Effect.gen(function* () {
      const harness = makeHarness(() => Response.json(UNAUTHENTICATED_SESSION));
      const error = yield* fetchEnvironmentSessionState(harness.input).pipe(
        Effect.provide(harness.httpLayer),
        Effect.flip,
      );

      expect(error).toMatchObject({
        _tag: "RemoteEnvironmentAuthFetchError",
        message: "The environment rejected the renewed session authorization.",
      });
      expect(harness.calls).toHaveLength(2);
    }),
  );

  it.effect.each([
    { name: "cookie", authorization: null },
    { name: "bearer", authorization: { _tag: "Bearer", token: "bearer-token" } },
  ] satisfies ReadonlyArray<{ name: string; authorization: PreparedHttpAuthorization | null }>)(
    "leaves $name sessions unchanged without relay services",
    ({ authorization }) =>
      Effect.gen(function* () {
        const harness = makeHarness(() => Response.json(UNAUTHENTICATED_SESSION));
        const result = yield* fetchEnvironmentSessionState({
          prepared: { ...PREPARED, httpAuthorization: authorization },
          signer: Option.none(),
        }).pipe(Effect.provide(harness.httpLayer));

        expect(result).toEqual(UNAUTHENTICATED_SESSION);
        expect(harness.calls).toHaveLength(1);
        expect(harness.authorizations).toEqual([]);
        expect(new Headers(harness.calls[0]!.init.headers).get("authorization")).toBe(
          authorization === null ? null : "Bearer bearer-token",
        );
        expect(harness.calls[0]!.init.credentials).toBe(
          authorization === null ? "include" : undefined,
        );
      }),
  );

  it.effect("keeps the caller's timeout while waiting for renewal", () =>
    Effect.gen(function* () {
      const harness = makeHarness(() => Response.json(SESSION));
      const authorizing = yield* Deferred.make<void>();
      const remoteAuthorization = RemoteEnvironmentAuthorization.of({
        ...harness.remoteAuthorization,
        authorizeDpopHttp: () =>
          Deferred.succeed(authorizing, undefined).pipe(Effect.andThen(Effect.never)),
      });
      const pending = yield* fetchEnvironmentSessionState({
        ...harness.input,
        remoteAuthorization: Option.some(remoteAuthorization),
        timeoutMs: 100,
      }).pipe(Effect.provide(harness.httpLayer), Effect.flip, Effect.forkChild);
      yield* Deferred.await(authorizing);
      yield* TestClock.adjust(100);

      expect(yield* Fiber.join(pending)).toMatchObject({
        _tag: "RemoteEnvironmentAuthTimeoutError",
        requestUrl: `${PREPARED.httpBaseUrl}/api/auth/session`,
        timeoutMs: 100,
      });
      expect(harness.calls).toEqual([]);
    }),
  );

  it.effect("reports the current endpoint when the total timeout expires during HTTP", () =>
    Effect.gen(function* () {
      const requested = Promise.withResolvers<void>();
      const response = Promise.withResolvers<Response>();
      const harness = makeHarness(() => {
        requested.resolve();
        return response.promise;
      });
      const authorizing = yield* Deferred.make<void>();
      const authorize = yield* Deferred.make<void>();
      const remoteAuthorization = RemoteEnvironmentAuthorization.of({
        ...harness.remoteAuthorization,
        authorizeDpopHttp: (input) =>
          Deferred.succeed(authorizing, undefined).pipe(
            Effect.andThen(Deferred.await(authorize)),
            Effect.andThen(harness.remoteAuthorization.authorizeDpopHttp(input)),
          ),
      });
      const pending = yield* fetchEnvironmentSessionState({
        ...harness.input,
        remoteAuthorization: Option.some(remoteAuthorization),
        timeoutMs: 100,
      }).pipe(Effect.provide(harness.httpLayer), Effect.flip, Effect.forkChild);
      yield* Deferred.await(authorizing);
      yield* TestClock.adjust(25);
      yield* Deferred.succeed(authorize, undefined);
      yield* Effect.promise(() => requested.promise);
      yield* TestClock.adjust(75);

      expect(yield* Fiber.join(pending)).toMatchObject({
        _tag: "RemoteEnvironmentAuthTimeoutError",
        requestUrl: `${CURRENT_ORIGIN}/api/auth/session`,
        timeoutMs: 100,
      });
      expect(harness.calls.map((call) => call.url)).toEqual([`${CURRENT_ORIGIN}/api/auth/session`]);
      expect(harness.authorizations).toHaveLength(1);
      response.resolve(Response.json(SESSION));
    }),
  );

  it.effect("reports renewal failure without sending the expired prepared token", () =>
    Effect.gen(function* () {
      const harness = makeHarness(() => Response.json(SESSION));
      const failure = new ConnectionTransientError({
        reason: "transport",
        detail: "Relay unavailable",
      });
      const remoteAuthorization = RemoteEnvironmentAuthorization.of({
        ...harness.remoteAuthorization,
        authorizeDpopHttp: () => Effect.fail(failure),
      });
      const error = yield* fetchEnvironmentSessionState({
        ...harness.input,
        remoteAuthorization: Option.some(remoteAuthorization),
      }).pipe(Effect.provide(harness.httpLayer), Effect.flip);

      expect(error).toMatchObject({
        _tag: "RemoteEnvironmentAuthFetchError",
        message: "Could not authorize the environment request.",
        cause: failure,
      });
      expect(harness.calls).toEqual([]);
      expect(harness.proofs).toEqual([]);
    }),
  );

  it.effect("does not fall back to a captured DPoP token when authorization is unavailable", () =>
    Effect.gen(function* () {
      const harness = makeHarness(() => Response.json(SESSION));
      const error = yield* fetchEnvironmentSessionState({
        prepared: PREPARED,
        signer: harness.input.signer,
      }).pipe(Effect.provide(harness.httpLayer), Effect.flip);

      expect(error).toMatchObject({
        _tag: "RemoteEnvironmentAuthFetchError",
        message: "No relay authorization service is available for the environment request.",
      });
      expect(harness.calls).toEqual([]);
    }),
  );
});
