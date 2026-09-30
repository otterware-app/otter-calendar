import * as Schema from "effect/Schema";
import { ForwardCompatibleArray, TrimmedString } from "./baseSchemas.ts";

const MAX_KEYBINDING_VALUE_LENGTH = 64;
const MAX_KEYBINDING_WHEN_LENGTH = 256;
export const MAX_WHEN_EXPRESSION_DEPTH = 64;
export const MAX_KEYBINDINGS_COUNT = 256;

/** Every command a shortcut can run. Clients dispatch them; the server only validates them. */
export const STATIC_KEYBINDING_COMMANDS = [
  "sidebar.toggle",
  "navigation.back",
  "navigation.forward",
  "commandPalette.toggle",
  "theme.select",
  "appearance.cycle",
  "themeEditor.toggle",
  "agent.toggle",
  "agent.new",
  "calendar.today",
  "calendar.next",
  "calendar.previous",
  "calendar.view.day",
  "calendar.view.week",
  "calendar.view.month",
  "calendar.view.agenda",
  "calendar.view.custom",
  "calendar.create",
  "calendar.search",
  "calendar.goToDate",
  "calendar.undo",
  "calendar.redo",
] as const;

export const KeybindingCommand = Schema.Literals(STATIC_KEYBINDING_COMMANDS);
export type KeybindingCommand = typeof KeybindingCommand.Type;

export const KeybindingValue = TrimmedString.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(MAX_KEYBINDING_VALUE_LENGTH),
);

export const KeybindingWhen = TrimmedString.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(MAX_KEYBINDING_WHEN_LENGTH),
);
export const KeybindingRule = Schema.Struct({
  key: KeybindingValue,
  command: KeybindingCommand,
  when: Schema.optional(KeybindingWhen),
});
export type KeybindingRule = typeof KeybindingRule.Type;

export const KeybindingsConfig = Schema.Array(KeybindingRule).check(
  Schema.isMaxLength(MAX_KEYBINDINGS_COUNT),
);
export type KeybindingsConfig = typeof KeybindingsConfig.Type;

export const KeybindingShortcut = Schema.Struct({
  key: KeybindingValue,
  metaKey: Schema.Boolean,
  ctrlKey: Schema.Boolean,
  shiftKey: Schema.Boolean,
  altKey: Schema.Boolean,
  modKey: Schema.Boolean,
});
export type KeybindingShortcut = typeof KeybindingShortcut.Type;

const KeybindingWhenNodeRef = Schema.suspend(
  (): Schema.Codec<KeybindingWhenNode> => KeybindingWhenNode,
);
export const KeybindingWhenNode = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("identifier"),
    name: Schema.NonEmptyString,
  }),
  Schema.Struct({
    type: Schema.Literal("not"),
    node: KeybindingWhenNodeRef,
  }),
  Schema.Struct({
    type: Schema.Literal("and"),
    left: KeybindingWhenNodeRef,
    right: KeybindingWhenNodeRef,
  }),
  Schema.Struct({
    type: Schema.Literal("or"),
    left: KeybindingWhenNodeRef,
    right: KeybindingWhenNodeRef,
  }),
]);
export type KeybindingWhenNode =
  | { type: "identifier"; name: string }
  | { type: "not"; node: KeybindingWhenNode }
  | { type: "and"; left: KeybindingWhenNode; right: KeybindingWhenNode }
  | { type: "or"; left: KeybindingWhenNode; right: KeybindingWhenNode };

export const ResolvedKeybindingRule = Schema.Struct({
  command: KeybindingCommand,
  shortcut: KeybindingShortcut,
  whenAst: Schema.optional(KeybindingWhenNode),
}).annotate({ parseOptions: { onExcessProperty: "ignore" } });
export type ResolvedKeybindingRule = typeof ResolvedKeybindingRule.Type;

/**
 * The command set grows over time, so a client may receive rules it cannot
 * represent (a command or `when` node added after that client shipped).
 * Decoding drops those rules instead of failing the whole payload —
 * rejecting the config would take down the connection over a shortcut the
 * client couldn't dispatch anyway.
 */
export const ResolvedKeybindingsConfig = ForwardCompatibleArray(ResolvedKeybindingRule).check(
  Schema.isMaxLength(MAX_KEYBINDINGS_COUNT),
);
export type ResolvedKeybindingsConfig = typeof ResolvedKeybindingsConfig.Type;

export class KeybindingsConfigError extends Schema.TaggedError<KeybindingsConfigError>()(
  "KeybindingsConfigParseError",
  {
    configPath: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Unable to parse keybindings config at ${this.configPath}: ${this.detail}`;
  }
}
