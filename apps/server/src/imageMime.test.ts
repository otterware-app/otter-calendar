import { describe, expect, it } from "vite-plus/test";

import { inferImageExtension } from "./imageMime.ts";

describe("imageMime", () => {
  it("does not read inherited keys from mime extension map", () => {
    expect(inferImageExtension({ mimeType: "constructor" })).toBe(".bin");
  });
});
