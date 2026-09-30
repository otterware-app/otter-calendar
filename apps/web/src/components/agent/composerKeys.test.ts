import { describe, expect, it } from "vite-plus/test";

import { composerKeySends } from "./composerKeys";

const key = (overrides: Partial<Parameters<typeof composerKeySends>[0]> = {}) => ({
  key: "Enter",
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
  ...overrides,
});

describe("composerKeySends", () => {
  it("sends on Enter and keeps Shift+Enter and IME composition for typing", () => {
    expect(composerKeySends(key(), "enter", "hi")).toBe(true);
    expect(composerKeySends(key({ shiftKey: true }), "enter", "hi")).toBe(false);
    expect(composerKeySends(key({ isComposing: true }), "enter", "hi")).toBe(false);
    expect(composerKeySends(key({ key: "a" }), "enter", "hi")).toBe(false);
  });

  it("needs Mod+Enter for multiline prompts or always, per the setting", () => {
    expect(composerKeySends(key(), "mod-enter-multiline", "one line")).toBe(true);
    expect(composerKeySends(key(), "mod-enter-multiline", "two\nlines")).toBe(false);
    expect(composerKeySends(key({ metaKey: true }), "mod-enter-multiline", "two\nlines")).toBe(
      true,
    );
    expect(composerKeySends(key(), "mod-enter", "hi")).toBe(false);
    expect(composerKeySends(key({ ctrlKey: true }), "mod-enter", "hi")).toBe(true);
  });
});
