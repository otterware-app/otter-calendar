import { createAgentEnvironmentAtoms } from "@t3tools/client-runtime/state/agent";

import { connectionAtomRuntime } from "../connection/runtime";

export const agentEnvironment = createAgentEnvironmentAtoms(connectionAtomRuntime);
