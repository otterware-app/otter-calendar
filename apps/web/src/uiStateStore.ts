import { create } from "zustand";

export const PERSISTED_STATE_KEY = "t3code:ui-state:v1";

/** Device-local UI preferences that are not client settings. */
export interface UiState {
  /** The advertised endpoint pairing links default to, picked in Connections. */
  readonly defaultAdvertisedEndpointKey: string | null;
}

export function readPersistedState(storage: Pick<Storage, "getItem"> | undefined): UiState {
  try {
    const raw = storage?.getItem(PERSISTED_STATE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const key =
      parsed !== null && typeof parsed === "object"
        ? (parsed as { defaultAdvertisedEndpointKey?: unknown }).defaultAdvertisedEndpointKey
        : null;
    return { defaultAdvertisedEndpointKey: typeof key === "string" && key ? key : null };
  } catch {
    return { defaultAdvertisedEndpointKey: null };
  }
}

function persistState(state: UiState): void {
  try {
    window.localStorage.setItem(
      PERSISTED_STATE_KEY,
      JSON.stringify({ defaultAdvertisedEndpointKey: state.defaultAdvertisedEndpointKey }),
    );
  } catch {
    // Storage can be full or unavailable; the preference then lasts for this session only.
  }
}

interface UiStateStore extends UiState {
  readonly setDefaultAdvertisedEndpointKey: (key: string | null) => void;
}

export const useUiStateStore = create<UiStateStore>((set) => ({
  ...readPersistedState(typeof window === "undefined" ? undefined : window.localStorage),
  setDefaultAdvertisedEndpointKey: (key) => set({ defaultAdvertisedEndpointKey: key }),
}));

useUiStateStore.subscribe((state, previous) => {
  if (state.defaultAdvertisedEndpointKey !== previous.defaultAdvertisedEndpointKey) {
    persistState(state);
  }
});
