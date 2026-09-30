import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { ThreadTokenUsageSnapshot, TurnTokenUsage } from "./providerRuntime.ts";

const decodeTurnTokenUsage = Schema.decodeUnknownSync(TurnTokenUsage);
const decodeThreadTokenUsage = Schema.decodeUnknownSync(ThreadTokenUsageSnapshot);

describe("TurnTokenUsage", () => {
  it("requires input and output totals for complete usage", () => {
    const complete = { usageStatus: "complete", usageScope: "main_agent", hasSubagents: false };
    expect(() => decodeTurnTokenUsage(complete)).toThrow();
    expect(decodeTurnTokenUsage({ ...complete, inputTokens: 10, outputTokens: 5 })).toMatchObject({
      inputTokens: 10,
      outputTokens: 5,
    });
  });

  it("accepts partial usage without totals", () => {
    expect(
      decodeTurnTokenUsage({
        usageStatus: "partial",
        usageScope: "main_agent",
        hasSubagents: true,
      }),
    ).toMatchObject({ usageStatus: "partial" });
  });
});

describe("ThreadTokenUsageSnapshot", () => {
  it("rejects a non-positive context window", () => {
    expect(() => decodeThreadTokenUsage({ usedTokens: 10, maxTokens: 0 })).toThrow();
    expect(decodeThreadTokenUsage({ usedTokens: 10, maxTokens: 200_000 })).toEqual({
      usedTokens: 10,
      maxTokens: 200_000,
    });
  });
});
