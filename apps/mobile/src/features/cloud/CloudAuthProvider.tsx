import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { ManagedRelay, setManagedRelaySession } from "@t3tools/client-runtime/relay";
import {
  reportAtomCommandResult,
  settleAsyncResult,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import * as Effect from "effect/Effect";
import { type ReactNode, useEffect, useRef } from "react";

import { runtime } from "../../lib/runtime";
import { appAtomRegistry } from "../../state/atom-registry";
import { useAtomCommand } from "../../state/use-atom-command";
import { environmentCatalog } from "../../connection/catalog";
import { clearConnectOnboardingRequest, requestConnectOnboarding } from "./connectOnboarding";
import { resolveCloudPublicConfig, resolveRelayClerkTokenOptions } from "./publicConfig";

function resetManagedRelayTokenCache() {
  return settleAsyncResult(() =>
    runtime.runPromiseExit(
      ManagedRelay.ManagedRelayClient.pipe(Effect.flatMap((client) => client.resetTokenCache)),
    ),
  );
}

export function deactivateCloudRelayAccount(): void {
  setManagedRelaySession(appAtomRegistry, null);
}

export function activateCloudRelayAccount(
  accountId: string,
  tokenProvider: () => Promise<string | null>,
): void {
  setManagedRelaySession(appAtomRegistry, {
    accountId,
    readClerkToken: tokenProvider,
  });
}

function CloudAuthBridge(props: { readonly children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth({ treatPendingAsSignedOut: false });
  const removeRelayEnvironments = useAtomCommand(environmentCatalog.removeRelayEnvironments, {
    reportFailure: false,
    reportDefect: false,
  });
  const observedAccountRef = useRef<string | null | undefined>(undefined);
  const accountTransitionRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isLoaded) {
      return;
    }

    const previousObservedAccount = observedAccountRef.current;
    const nextAccount = isSignedIn && userId ? userId : null;
    observedAccountRef.current = nextAccount;

    // Every sign-in or account switch that completes during this session (a
    // cold start observes undefined → account and must not re-prompt) requests
    // the T3 Connect onboarding sheet — account transitions clear the
    // connected environments, so each new session starts with no devices to
    // reach. The request itself is issued after the cleanup transition inside
    // activateSession, so the sheet never lists the previous account's
    // environments; sign-out drops any not-yet-presented request instead.
    const isAccountTransition =
      previousObservedAccount !== undefined && previousObservedAccount !== nextAccount;
    if (isAccountTransition && nextAccount === null) {
      clearConnectOnboardingRequest();
    }

    const cleanUpAccount = async () => {
      const removal = await removeRelayEnvironments();
      if (removal._tag !== "Success") throw squashAtomCommandFailure(removal);
      reportAtomCommandResult(await resetManagedRelayTokenCache(), {
        label: "cloud account cleanup",
      });
    };
    const queueAccountCleanup = () => {
      const previousTransition = accountTransitionRef.current ?? Promise.resolve();
      accountTransitionRef.current = previousTransition.catch(() => {}).then(cleanUpAccount);
      return accountTransitionRef.current;
    };

    if (!isSignedIn || !userId) {
      deactivateCloudRelayAccount();
      if (previousObservedAccount !== null) {
        void settlePromise(queueAccountCleanup).then((result) => {
          reportAtomCommandResult(result, { label: "cloud account cleanup" });
        });
      }
      return;
    }

    const tokenProvider = () => getToken(resolveRelayClerkTokenOptions());
    const activateSession = () => {
      if (cancelled) {
        return;
      }
      activateCloudRelayAccount(userId, tokenProvider);
      if (isAccountTransition) {
        requestConnectOnboarding(userId);
      }
    };
    const activateAfterTransition = (transition: Promise<void>) => {
      const activation = transition.then(activateSession);
      accountTransitionRef.current = activation;
      void settlePromise(() => activation).then((result) => {
        reportAtomCommandResult(result, { label: "cloud account activation" });
      });
    };
    if (
      previousObservedAccount !== undefined &&
      previousObservedAccount !== null &&
      previousObservedAccount !== userId
    ) {
      deactivateCloudRelayAccount();
      activateAfterTransition(queueAccountCleanup());
    } else {
      // Wait for an in-flight sign-out cleanup; its failure must not block the new session.
      activateAfterTransition((accountTransitionRef.current ?? Promise.resolve()).catch(() => {}));
    }

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, removeRelayEnvironments, userId]);

  // Unmounting is not a sign-out: detach the session without removing environments.
  useEffect(() => () => setManagedRelaySession(appAtomRegistry, null), []);

  return props.children;
}

export function CloudAuthProvider(props: { readonly children: ReactNode }) {
  const config = resolveCloudPublicConfig();
  const publishableKey = config.clerk.publishableKey;
  const relayUrl = config.relay.url;

  useEffect(() => {
    if (!publishableKey || !relayUrl) {
      deactivateCloudRelayAccount();
    }
  }, [publishableKey, relayUrl]);

  if (!publishableKey || !relayUrl) {
    return props.children;
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <CloudAuthBridge>{props.children}</CloudAuthBridge>
    </ClerkProvider>
  );
}
