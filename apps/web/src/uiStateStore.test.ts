import { assert, describe, it } from "vite-plus/test";

import { PERSISTED_STATE_KEY, readPersistedState } from "./uiStateStore";

const storage = (value: string | null) => ({
  getItem: (key: string) => (key === PERSISTED_STATE_KEY ? value : null),
});

describe("readPersistedState", () => {
  it("restores the default advertised endpoint and ignores anything else", () => {
    assert.deepEqual(
      readPersistedState(
        storage(JSON.stringify({ defaultAdvertisedEndpointKey: "lan", projectOrder: ["a"] })),
      ),
      { defaultAdvertisedEndpointKey: "lan" },
    );
  });

  it("falls back to no default for missing or corrupt state", () => {
    assert.deepEqual(readPersistedState(storage(null)), { defaultAdvertisedEndpointKey: null });
    assert.deepEqual(readPersistedState(storage("{not json")), {
      defaultAdvertisedEndpointKey: null,
    });
  });
});
