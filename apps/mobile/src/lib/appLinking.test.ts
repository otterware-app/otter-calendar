import { BRAND } from "@t3tools/shared/brand";
import { describe, expect, it } from "vite-plus/test";

import { shouldHandleAppLink } from "./appLinking";

const scheme = BRAND.urlScheme;

describe("shouldHandleAppLink", () => {
  it.each([`${scheme}://`, `${scheme}:///`, `${scheme}-dev://`, `${scheme}-preview://`])(
    "ignores scheme-only URL %s",
    (url) => {
      expect(shouldHandleAppLink(url)).toBe(false);
    },
  );

  it.each([
    `${scheme}://calendar/day/2026-09-30`,
    `${scheme}://calendar/event/env-1/cal-1/event-1`,
    `${scheme}-dev://settings/appearance`,
  ])("handles path-bearing URL %s", (url) => {
    expect(shouldHandleAppLink(url)).toBe(true);
  });

  it("ignores the dev client launcher URL", () => {
    expect(shouldHandleAppLink(`${scheme}://expo-development-client/?url=x`)).toBe(false);
  });
});
