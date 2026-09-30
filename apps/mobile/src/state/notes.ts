import { createNotesEnvironmentAtoms } from "@t3tools/client-runtime/state/notes";

import { connectionAtomRuntime } from "../connection/runtime";

export const notesEnvironment = createNotesEnvironmentAtoms(connectionAtomRuntime);
