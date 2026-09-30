import { assert, describe, it } from "vite-plus/test";
import {
  compileResolvedKeybindingsConfig,
  DEFAULT_RESOLVED_KEYBINDINGS,
} from "@t3tools/shared/keybindings";

import {
  type KeybindingCommand,
  type KeybindingShortcut,
  type KeybindingWhenNode,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import {
  formatShortcutLabel,
  resolveShortcutCommand,
  shortcutLabelForCommand,
  type ShortcutEventLike,
} from "./keybindings";

function event(overrides: Partial<ShortcutEventLike> = {}): ShortcutEventLike {
  return {
    key: "j",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  };
}

function modShortcut(
  key: string,
  overrides: Partial<Omit<KeybindingShortcut, "key">> = {},
): KeybindingShortcut {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    modKey: true,
    ...overrides,
  };
}

function whenIdentifier(name: string): KeybindingWhenNode {
  return { type: "identifier", name };
}

function whenNot(node: KeybindingWhenNode): KeybindingWhenNode {
  return { type: "not", node };
}

function compile(
  bindings: ReadonlyArray<{
    shortcut: KeybindingShortcut;
    command: KeybindingCommand;
    whenAst?: KeybindingWhenNode;
  }>,
): ResolvedKeybindingsConfig {
  return bindings.map((binding) => ({
    command: binding.command,
    shortcut: binding.shortcut,
    ...(binding.whenAst ? { whenAst: binding.whenAst } : {}),
  }));
}

describe("default app shortcuts", () => {
  it("toggles the sidebar and the agent panel with mod on each platform", () => {
    assert.strictEqual(
      resolveShortcutCommand(event({ key: "b", metaKey: true }), DEFAULT_RESOLVED_KEYBINDINGS, {
        platform: "MacIntel",
      }),
      "sidebar.toggle",
    );
    assert.strictEqual(
      resolveShortcutCommand(event({ key: "i", ctrlKey: true }), DEFAULT_RESOLVED_KEYBINDINGS, {
        platform: "Linux",
      }),
      "agent.toggle",
    );
    assert.isNull(
      resolveShortcutCommand(event({ key: "b", ctrlKey: true }), DEFAULT_RESOLVED_KEYBINDINGS, {
        platform: "MacIntel",
      }),
    );
  });

  it("leaves mod+n to text fields so a new note never steals typing", () => {
    const input = event({ key: "n", metaKey: true });
    assert.strictEqual(
      resolveShortcutCommand(input, DEFAULT_RESOLVED_KEYBINDINGS, {
        platform: "MacIntel",
        context: { editableFocus: false },
      }),
      "notes.new",
    );
    assert.isNull(
      resolveShortcutCommand(input, DEFAULT_RESOLVED_KEYBINDINGS, {
        platform: "MacIntel",
        context: { editableFocus: true },
      }),
    );
  });

  it("navigates history with mod+[ and mod+]", () => {
    assert.strictEqual(
      resolveShortcutCommand(
        event({ key: "[", code: "BracketLeft", metaKey: true }),
        DEFAULT_RESOLVED_KEYBINDINGS,
        { platform: "MacIntel" },
      ),
      "navigation.back",
    );
    assert.strictEqual(
      resolveShortcutCommand(
        event({ key: "]", code: "BracketRight", ctrlKey: true }),
        DEFAULT_RESOLVED_KEYBINDINGS,
        { platform: "Linux" },
      ),
      "navigation.forward",
    );
  });

  it("labels the defaults per platform", () => {
    assert.strictEqual(
      shortcutLabelForCommand(DEFAULT_RESOLVED_KEYBINDINGS, "sidebar.toggle", "MacIntel"),
      "⌘B",
    );
    assert.strictEqual(
      shortcutLabelForCommand(DEFAULT_RESOLVED_KEYBINDINGS, "agent.new", "Linux"),
      "Ctrl+Shift+O",
    );
    assert.strictEqual(
      shortcutLabelForCommand(DEFAULT_RESOLVED_KEYBINDINGS, "commandPalette.toggle", "MacIntel"),
      "⌘K",
    );
  });
});

describe("rule precedence", () => {
  it("lets a later rule that matches the context override an earlier one", () => {
    const keybindings = compile([
      { shortcut: modShortcut("n"), command: "agent.new" },
      {
        shortcut: modShortcut("n"),
        command: "notes.new",
        whenAst: whenNot(whenIdentifier("editableFocus")),
      },
    ]);
    const input = event({ key: "n", metaKey: true });
    assert.strictEqual(
      resolveShortcutCommand(input, keybindings, {
        platform: "MacIntel",
        context: { editableFocus: false },
      }),
      "notes.new",
    );
    assert.strictEqual(
      resolveShortcutCommand(input, keybindings, {
        platform: "MacIntel",
        context: { editableFocus: true },
      }),
      "agent.new",
    );
  });

  it("gives no label to a command shadowed by a later rule on the same keys", () => {
    const keybindings = compile([
      { shortcut: modShortcut("o", { shiftKey: true }), command: "agent.new" },
      { shortcut: modShortcut("o", { shiftKey: true }), command: "notes.new" },
    ]);
    assert.isNull(shortcutLabelForCommand(keybindings, "agent.new", "MacIntel"));
    assert.strictEqual(shortcutLabelForCommand(keybindings, "notes.new", "MacIntel"), "⇧⌘O");
  });

  it("respects the when-context while resolving labels", () => {
    const keybindings = compile([
      { shortcut: modShortcut("n"), command: "agent.new" },
      {
        shortcut: modShortcut("n"),
        command: "notes.new",
        whenAst: whenIdentifier("notesFocus"),
      },
    ]);
    assert.strictEqual(
      shortcutLabelForCommand(keybindings, "agent.new", {
        platform: "Linux",
        context: { notesFocus: false },
      }),
      "Ctrl+N",
    );
    assert.isNull(
      shortcutLabelForCommand(keybindings, "agent.new", {
        platform: "Linux",
        context: { notesFocus: true },
      }),
    );
  });
});

describe("keyboard layouts", () => {
  it("matches bracket shortcuts by physical key when shift changes the character", () => {
    const keybindings = compile([
      { shortcut: modShortcut("[", { shiftKey: true }), command: "navigation.back" },
    ]);
    assert.strictEqual(
      resolveShortcutCommand(
        event({ key: "{", code: "BracketLeft", metaKey: true, shiftKey: true }),
        keybindings,
        { platform: "MacIntel" },
      ),
      "navigation.back",
    );
  });

  it("matches punctuation by physical key across layouts", () => {
    const keybindings = compile([
      { shortcut: modShortcut("'", { shiftKey: true }), command: "agent.toggle" },
    ]);
    assert.strictEqual(
      resolveShortcutCommand(
        event({ key: "@", code: "Quote", metaKey: true, shiftKey: true }),
        keybindings,
        { platform: "MacIntel" },
      ),
      "agent.toggle",
    );
    assert.isNull(
      resolveShortcutCommand(
        event({ key: '"', code: "Digit2", metaKey: true, shiftKey: true }),
        keybindings,
        { platform: "MacIntel" },
      ),
    );
  });

  it("does not let a punctuation position shadow a Latin layout key", () => {
    const keybindings = compile([
      { shortcut: modShortcut("m"), command: "agent.toggle" },
      { shortcut: modShortcut(";"), command: "sidebar.toggle" },
    ]);
    assert.strictEqual(
      resolveShortcutCommand(event({ key: "m", code: "Semicolon", metaKey: true }), keybindings, {
        platform: "MacIntel",
      }),
      "agent.toggle",
    );
  });

  it("matches Option-modified and non-Latin letters by physical key", () => {
    const keybindings = compile([
      { shortcut: modShortcut("b", { altKey: true }), command: "agent.toggle" },
      { shortcut: modShortcut("d"), command: "notes.new" },
    ]);
    assert.strictEqual(
      resolveShortcutCommand(
        event({ key: "∫", code: "KeyB", metaKey: true, altKey: true }),
        keybindings,
        { platform: "MacIntel" },
      ),
      "agent.toggle",
    );
    assert.strictEqual(
      resolveShortcutCommand(event({ key: "в", code: "KeyD", metaKey: true }), keybindings, {
        platform: "MacIntel",
      }),
      "notes.new",
    );
  });

  it("follows the letter a Latin layout types, not the physical key", () => {
    const keybindings = compile([{ shortcut: modShortcut("d"), command: "notes.new" }]);
    assert.isNull(
      resolveShortcutCommand(event({ key: "a", code: "KeyD", metaKey: true }), keybindings, {
        platform: "MacIntel",
      }),
    );
    assert.strictEqual(
      resolveShortcutCommand(event({ key: "d", code: "KeyL", metaKey: true }), keybindings, {
        platform: "MacIntel",
      }),
      "notes.new",
    );
  });

  it("leaves AltGr text entry alone but keeps plain Ctrl+Alt letters working", () => {
    const keybindings = compileResolvedKeybindingsConfig([
      { key: "mod+alt+e", command: "agent.new" },
    ]);
    const altGr = event({
      key: "€",
      code: "KeyE",
      ctrlKey: true,
      altKey: true,
      getModifierState: (key) => key === "AltGraph",
    });
    for (const platform of ["Win32", "Linux"]) {
      assert.isNull(resolveShortcutCommand(altGr, keybindings, { platform }));
      assert.strictEqual(
        resolveShortcutCommand({ ...altGr, getModifierState: () => false }, keybindings, {
          platform,
        }),
        "agent.new",
      );
    }
    // Firefox reports AltGraph for Ctrl+Alt+letter on Windows; letters still match.
    assert.strictEqual(
      resolveShortcutCommand(
        event({
          key: "e",
          ctrlKey: true,
          altKey: true,
          getModifierState: (key) => key === "AltGraph",
        }),
        keybindings,
        { platform: "Win32" },
      ),
      "agent.new",
    );
  });
});

describe("formatShortcutLabel", () => {
  it("formats labels for macOS and other platforms", () => {
    assert.strictEqual(
      formatShortcutLabel(modShortcut("d", { shiftKey: true }), "MacIntel"),
      "⇧⌘D",
    );
    assert.strictEqual(
      formatShortcutLabel(modShortcut("d", { shiftKey: true }), "Linux"),
      "Ctrl+Shift+D",
    );
  });

  it("formats the plus key", () => {
    assert.strictEqual(formatShortcutLabel(modShortcut("+"), "MacIntel"), "⌘+");
    assert.strictEqual(formatShortcutLabel(modShortcut("+"), "Linux"), "Ctrl++");
  });
});
