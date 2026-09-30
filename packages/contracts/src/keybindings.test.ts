import { assert, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";

import {
  KeybindingsConfig,
  KeybindingRule,
  ResolvedKeybindingRule,
  ResolvedKeybindingsConfig,
} from "./keybindings.ts";

const decode = <S extends Schema.Top>(
  schema: S,
  input: unknown,
): Effect.Effect<Schema.Schema.Type<S>, Schema.SchemaError, never> =>
  Schema.decodeUnknownEffect(schema as never)(input) as Effect.Effect<
    Schema.Schema.Type<S>,
    Schema.SchemaError,
    never
  >;

const decodeResolvedRule = Schema.decodeUnknownEffect(ResolvedKeybindingRule as never);
const encodeResolvedKeybindings = Schema.encodeEffect(ResolvedKeybindingsConfig);

it.effect("parses keybinding rules", () =>
  Effect.gen(function* () {
    for (const command of [
      "sidebar.toggle",
      "commandPalette.toggle",
      "agent.toggle",
      "notes.new",
    ]) {
      const parsed = yield* decode(KeybindingRule, { key: "mod+j", command });
      assert.strictEqual(parsed.command, command);
    }
    const parsedWithWhen = yield* decode(KeybindingRule, {
      key: "mod+n",
      command: "notes.new",
      when: "!editableFocus",
    });
    assert.strictEqual(parsedWithWhen.when, "!editableFocus");
  }),
);

it.effect("rejects invalid command values", () =>
  Effect.gen(function* () {
    const result = yield* Effect.exit(
      decode(KeybindingRule, {
        key: "mod+j",
        command: "terminal.toggle",
      }),
    );
    assert.strictEqual(result._tag, "Failure");
  }),
);

it.effect("parses keybindings array payload", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(KeybindingsConfig, [
      { key: "mod+b", command: "sidebar.toggle" },
      { key: "mod+i", command: "agent.toggle" },
      { key: "mod+n", command: "notes.new", when: "!editableFocus" },
    ]);
    assert.lengthOf(parsed, 3);
  }),
);

it.effect("parses resolved keybinding rules", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(ResolvedKeybindingRule, {
      command: "agent.new",
      shortcut: {
        key: "d",
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        modKey: true,
      },
      whenAst: {
        type: "and",
        left: { type: "identifier", name: "isDesktop" },
        right: {
          type: "not",
          node: { type: "identifier", name: "editableFocus" },
        },
      },
    });
    assert.strictEqual(parsed.shortcut.key, "d");
  }),
);

it.effect("parses resolved keybindings arrays", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(ResolvedKeybindingsConfig, [
      {
        command: "agent.toggle",
        shortcut: {
          key: "j",
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          modKey: true,
        },
      },
      {
        command: "notes.new",
        shortcut: {
          key: "3",
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          modKey: true,
        },
      },
    ]);
    assert.lengthOf(parsed, 2);
  }),
);

const shortcut = {
  key: "p",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  modKey: true,
};

it.effect("drops resolved rules with commands this build does not know", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(ResolvedKeybindingsConfig, [
      { command: "agent.toggle", shortcut },
      { command: "someFuture.toggle", shortcut },
      { command: "commandPalette.toggle", shortcut },
    ]);
    assert.deepEqual(
      parsed.map((rule) => rule.command),
      ["agent.toggle", "commandPalette.toggle"],
    );
  }),
);

it.effect("drops resolved rules with unknown when-node types", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(ResolvedKeybindingsConfig, [
      {
        command: "agent.toggle",
        shortcut,
        whenAst: { type: "xor", left: 1, right: 2 },
      },
      { command: "agent.new", shortcut },
    ]);
    assert.deepEqual(
      parsed.map((rule) => rule.command),
      ["agent.new"],
    );
  }),
);

it.effect("drops malformed resolved rule entries", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(ResolvedKeybindingsConfig, [
      "garbage",
      { command: "agent.toggle", shortcut },
      null,
    ]);
    assert.deepEqual(
      parsed.map((rule) => rule.command),
      ["agent.toggle"],
    );
  }),
);

it.effect("encodes resolved keybindings to the plain wire shape", () =>
  Effect.gen(function* () {
    const rules = [{ command: "agent.toggle" as const, shortcut }];
    const encoded = yield* encodeResolvedKeybindings(rules);
    assert.deepEqual(encoded, rules);
    const roundTripped = yield* decode(ResolvedKeybindingsConfig, encoded);
    assert.deepEqual(roundTripped, rules);
  }),
);

it.effect("drops unknown fields in resolved keybinding rules", () =>
  decodeResolvedRule({
    command: "agent.toggle",
    shortcut: {
      key: "j",
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      modKey: true,
    },
    key: "mod+j",
  }).pipe(
    Effect.map((parsed) => {
      const view = parsed as Record<string, unknown>;
      assert.strictEqual("key" in view, false);
      assert.strictEqual(view.command, "agent.toggle");
    }),
  ),
);
