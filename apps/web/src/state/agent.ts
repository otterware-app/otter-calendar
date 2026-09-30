import { useAtomValue } from "@effect/atom-react";
import {
  EMPTY_AGENT_THREADS,
  createAgentEnvironmentAtoms,
} from "@t3tools/client-runtime/state/agent";
import type {
  AgentThreadDetail,
  AgentThreadSummary,
  EnvironmentId,
  ThreadId,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";

export const agentEnvironment = createAgentEnvironmentAtoms(connectionAtomRuntime);

const EMPTY_THREADS_ATOM = Atom.make(
  AsyncResult.success<ReadonlyArray<AgentThreadSummary>>(EMPTY_AGENT_THREADS),
).pipe(Atom.withLabel("web-agent-threads:empty"));
const EMPTY_THREAD_ATOM = Atom.make(AsyncResult.success<AgentThreadDetail | null>(null)).pipe(
  Atom.withLabel("web-agent-thread:empty"),
);

/** The environment's agent conversations, newest activity first. */
export function useAgentThreads(environmentId: EnvironmentId | null) {
  const result = useAtomValue(
    environmentId === null
      ? EMPTY_THREADS_ATOM
      : agentEnvironment.threads({ environmentId, input: {} }),
  );
  return {
    threads: Option.getOrElse(AsyncResult.value(result), () => EMPTY_AGENT_THREADS),
    isLoading: result._tag === "Initial",
  };
}

/** One conversation's detail; `detail` is null while loading and after deletion. */
export function useAgentThread(environmentId: EnvironmentId | null, threadId: ThreadId | null) {
  const result = useAtomValue(
    environmentId === null || threadId === null
      ? EMPTY_THREAD_ATOM
      : agentEnvironment.thread({ environmentId, input: { threadId } }),
  );
  return {
    detail: Option.getOrNull(AsyncResult.value(result)),
    isLoading: result._tag === "Initial",
    error: result._tag === "Failure" ? result.cause : null,
  };
}
