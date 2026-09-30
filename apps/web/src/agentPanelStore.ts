import { ThreadId, type ModelSelection, type RuntimeMode } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useEffect } from "react";
import { create } from "zustand";

import { getLocalStorageItem, setLocalStorageItem } from "./hooks/useLocalStorage";

const STORAGE_KEY = "t3code:agent-panel:v1";

const PersistedAgentPanel = Schema.Struct({
  open: Schema.Boolean,
  threadId: Schema.NullOr(ThreadId),
});

interface AgentPanelState {
  readonly open: boolean;
  /** The conversation on screen; null shows a new chat. */
  readonly threadId: ThreadId | null;
  /** Model and mode picked for the next new chat; null uses the environment's defaults. */
  readonly draftModelSelection: ModelSelection | null;
  readonly draftRuntimeMode: RuntimeMode | null;
  /** What the page on screen shows, sent along with each message so the agent knows. */
  readonly pageContext: string | null;
  readonly setOpen: (open: boolean) => void;
  readonly toggle: () => void;
  readonly openThread: (threadId: ThreadId) => void;
  readonly startNewChat: () => void;
  readonly setDraftModelSelection: (selection: ModelSelection) => void;
  readonly setDraftRuntimeMode: (mode: RuntimeMode) => void;
  readonly setPageContext: (context: string | null) => void;
}

function readPersisted() {
  try {
    return getLocalStorageItem(STORAGE_KEY, PersistedAgentPanel);
  } catch {
    return null;
  }
}

const persisted = readPersisted();

export const useAgentPanelStore = create<AgentPanelState>((set) => ({
  open: persisted?.open ?? false,
  threadId: persisted?.threadId ?? null,
  draftModelSelection: null,
  draftRuntimeMode: null,
  pageContext: null,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
  openThread: (threadId) => set({ open: true, threadId }),
  startNewChat: () => set({ open: true, threadId: null }),
  setDraftModelSelection: (draftModelSelection) => set({ draftModelSelection }),
  setDraftRuntimeMode: (draftRuntimeMode) => set({ draftRuntimeMode }),
  setPageContext: (pageContext) => set({ pageContext }),
}));

useAgentPanelStore.subscribe((state, previous) => {
  if (state.open === previous.open && state.threadId === previous.threadId) return;
  try {
    setLocalStorageItem(
      STORAGE_KEY,
      { open: state.open, threadId: state.threadId },
      PersistedAgentPanel,
    );
  } catch {
    // Storage can be unavailable (private mode); the panel then just forgets its state.
  }
});

/** Tells the agent what the page shows while the page is mounted, e.g. `Open note: …`. */
export function useAgentPageContext(context: string | null): void {
  const setPageContext = useAgentPanelStore((state) => state.setPageContext);
  useEffect(() => {
    setPageContext(context);
    return () => setPageContext(null);
  }, [context, setPageContext]);
}
