import { describe, expect, it } from "vite-plus/test";
import type { ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";

import {
  buildKeybindingRows,
  buildKeybindingCommandOptions,
  buildWhenVariableOptions,
  commandLabel,
  keybindingConflictLabels,
  keybindingFromKeyboardEvent,
  parseWhenExpressionDraft,
  shortcutToKeybindingInput,
  unknownWhenVariables,
  whenAstToExpression,
  whenNodeRemoveLabel,
} from "./KeybindingsSettings.logic";

describe("KeybindingsSettings.logic", () => {
  it("lists the app commands with editable defaults", () => {
    const rows = buildKeybindingRows(DEFAULT_RESOLVED_KEYBINDINGS, "");
    for (const command of ["agent.toggle", "agent.new", "notes.new", "commandPalette.toggle"]) {
      expect(rows.find((row) => row.command === command)).toMatchObject({
        source: "Default",
        conflicts: [],
      });
    }
  });

  it.each(["agent", "new chat", "toggle panel"])("finds the agent shortcuts with %s", (query) => {
    expect(buildKeybindingRows(DEFAULT_RESOLVED_KEYBINDINGS, query).length).toBeGreaterThan(0);
  });

  it("builds searchable rows with readable key and when values", () => {
    const rows = buildKeybindingRows(
      [
        {
          command: "agent.toggle",
          shortcut: {
            key: "j",
            modKey: true,
            metaKey: false,
            ctrlKey: false,
            altKey: false,
            shiftKey: false,
          },
          whenAst: {
            type: "not",
            node: { type: "identifier", name: "editableFocus" },
          },
        },
      ] satisfies ResolvedKeybindingsConfig,
      "agent",
    );

    expect(rows).toEqual([
      expect.objectContaining({
        command: "agent.toggle",
        key: "mod+j",
        when: "!editableFocus",
        defaultKey: "mod+i",
        defaultWhen: "",
        source: "Custom",
      }),
    ]);
  });

  it("captures platform-specific mod shortcuts", () => {
    expect(
      keybindingFromKeyboardEvent(
        { key: "K", code: "KeyK", metaKey: true, ctrlKey: false, altKey: false, shiftKey: true },
        "MacIntel",
      ),
    ).toBe("mod+shift+k");
    expect(
      keybindingFromKeyboardEvent(
        { key: "K", code: "KeyK", metaKey: false, ctrlKey: true, altKey: false, shiftKey: true },
        "Win32",
      ),
    ).toBe("mod+shift+k");
  });

  it.each([
    ["@", "Digit2", "mod+shift+2"],
    ['"', "Digit2", "mod+shift+2"],
    ["@", "Quote", "mod+shift+'"],
  ])("captures %s at %s by physical key", (key, code, expected) => {
    expect(
      keybindingFromKeyboardEvent(
        {
          key,
          code,
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: true,
        },
        "MacIntel",
      ),
    ).toBe(expected);
  });

  it("captures Latin layout keys instead of their punctuation position", () => {
    expect(
      keybindingFromKeyboardEvent(
        {
          key: "m",
          code: "Semicolon",
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
        },
        "MacIntel",
      ),
    ).toBe("mod+m");
  });

  it("serializes shortcuts and when expressions for upserts", () => {
    expect(
      shortcutToKeybindingInput({
        key: " ",
        modKey: true,
        metaKey: false,
        ctrlKey: false,
        altKey: true,
        shiftKey: false,
      }),
    ).toBe("mod+alt+space");

    expect(
      whenAstToExpression({
        type: "and",
        left: { type: "identifier", name: "editorFocus" },
        right: {
          type: "not",
          node: { type: "identifier", name: "terminalFocus" },
        },
      }),
    ).toBe("editorFocus && !terminalFocus");

    expect(parseWhenExpressionDraft("editorFocus && (!terminalFocus || modelPickerOpen)")).toEqual({
      ok: true,
      value: {
        type: "and",
        left: { type: "identifier", name: "editorFocus" },
        right: {
          type: "or",
          left: {
            type: "not",
            node: { type: "identifier", name: "terminalFocus" },
          },
          right: { type: "identifier", name: "modelPickerOpen" },
        },
      },
    });
    expect(parseWhenExpressionDraft("editorFocus &&")).toEqual({
      ok: false,
      message: "Use variables with !, &&, ||, and parentheses.",
    });

    expect(parseWhenExpressionDraft("!(terminalFocus || modelPickerOpen)")).toEqual({
      ok: true,
      value: {
        type: "not",
        node: {
          type: "or",
          left: { type: "identifier", name: "terminalFocus" },
          right: { type: "identifier", name: "modelPickerOpen" },
        },
      },
    });
  });

  it("describes the scope of each visual expression removal", () => {
    const condition = { type: "identifier", name: "terminalFocus" } as const;
    const negatedCondition = { type: "not", node: condition } as const;
    const group = { type: "and", left: condition, right: negatedCondition } as const;
    const negatedGroup = { type: "not", node: group } as const;

    expect(whenNodeRemoveLabel(group, 0)).toBe("Clear all conditions");
    expect(whenNodeRemoveLabel(condition, 1)).toBe("Remove condition");
    expect(whenNodeRemoveLabel(negatedCondition, 1)).toBe("Remove condition");
    expect(whenNodeRemoveLabel(group, 1)).toBe("Remove group and its conditions");
    expect(whenNodeRemoveLabel(negatedGroup, 1)).toBe("Remove group and its conditions");
  });

  it("formats command labels", () => {
    expect(commandLabel("commandPalette.toggle")).toBe("Command Palette: Toggle");
    expect(commandLabel("themeEditor.toggle")).toBe("Theme Editor: Toggle");
    expect(commandLabel("agent.new")).toBe("Agent: New Chat");
  });

  it("builds known when variable options from defaults without frontend labels", () => {
    const options = buildWhenVariableOptions();

    expect(options).toEqual(
      expect.arrayContaining(["editableFocus", "isWeb", "isDesktop", "true", "false"]),
    );
    expect(options).not.toContain("customModeActive");
  });

  it("builds command options from all static commands", () => {
    expect(buildKeybindingCommandOptions([])).toEqual(
      expect.arrayContaining(["agent.toggle", "agent.new", "notes.new", "sidebar.toggle"]),
    );
  });

  it("reports unknown when variables without rejecting parseable expressions", () => {
    const parsed = parseWhenExpressionDraft("!editableFocus && editableFoc");

    expect(parsed.ok).toBe(true);
    expect(unknownWhenVariables(parsed.ok ? parsed.value : undefined)).toEqual(["editableFoc"]);
  });

  it("marks a binding that matches its default as default", () => {
    const rows = buildKeybindingRows(
      [
        {
          command: "notes.new",
          shortcut: {
            key: "n",
            modKey: true,
            metaKey: false,
            ctrlKey: false,
            altKey: false,
            shiftKey: false,
          },
          whenAst: {
            type: "not",
            node: { type: "identifier", name: "editableFocus" },
          },
        },
      ] satisfies ResolvedKeybindingsConfig,
      "",
    );

    expect(rows.map((row) => row.source)).toEqual(["Default"]);
  });

  it("reports conflicting shortcuts that share an active when context", () => {
    const rows = buildKeybindingRows(
      [
        {
          command: "notes.new",
          shortcut: {
            key: "n",
            modKey: true,
            metaKey: false,
            ctrlKey: false,
            altKey: false,
            shiftKey: false,
          },
          whenAst: {
            type: "not",
            node: { type: "identifier", name: "editableFocus" },
          },
        },
        {
          command: "agent.new",
          shortcut: {
            key: "n",
            modKey: true,
            metaKey: false,
            ctrlKey: false,
            altKey: false,
            shiftKey: false,
          },
          whenAst: {
            type: "not",
            node: { type: "identifier", name: "editableFocus" },
          },
        },
      ] satisfies ResolvedKeybindingsConfig,
      "",
    );

    const notesRow = rows.find((row) => row.command === "notes.new");
    expect(notesRow?.conflicts).toEqual(["Agent: New Chat"]);
    expect(
      keybindingConflictLabels(rows, {
        rowId: notesRow?.id ?? "",
        key: "mod+n",
        when: "",
      }),
    ).toEqual(["Agent: New Chat"]);
  });
});
