import * as NodeAssert from "node:assert/strict";

import { BRAND } from "@t3tools/shared/brand";
import { describe, it } from "vite-plus/test";

import {
  buildCodexAdditionalContext,
  buildCodexDeveloperInstructions,
} from "./CodexDeveloperInstructions.ts";

describe("buildCodexDeveloperInstructions", () => {
  it("appends runtime info after the mode instructions", () => {
    const instructions = runtimeInstructions({
      model: "gpt-5.3-codex",
      reasoningEffort: "high",
    });

    NodeAssert.match(
      buildCodexDeveloperInstructions("default"),
      /^<collaboration_mode># Collaboration Mode: Default/,
    );
    NodeAssert.match(instructions, new RegExp(BRAND.displayName));
    NodeAssert.match(instructions, /Codex harness/);
    NodeAssert.match(instructions, /as gpt-5\.3-codex with high reasoning effort/);
  });

  it("includes runtime info alongside plan mode instructions", () => {
    const instructions = runtimeInstructions({
      model: "gpt-5.3-codex",
      reasoningEffort: "medium",
    });

    NodeAssert.match(buildCodexDeveloperInstructions("plan"), /^<collaboration_mode># Plan Mode/);
    NodeAssert.match(instructions, /as gpt-5\.3-codex with medium reasoning effort/);
  });

  it("varies with the model and effort of each turn", () => {
    const first = runtimeInstructions({
      model: "gpt-5.3-codex",
      reasoningEffort: "medium",
    });
    const second = runtimeInstructions({
      model: "gpt-5.4",
      reasoningEffort: "high",
    });

    NodeAssert.notEqual(first, second);
  });

  it("flattens multiline metadata into single-line runtime info", () => {
    const instructions = runtimeInstructions({
      model: "gpt\n5.3\ncodex",
      reasoningEffort: " high\neffort ",
    });

    NodeAssert.match(instructions, /as gpt 5\.3 codex with high effort reasoning effort/);
    NodeAssert.doesNotMatch(instructions, /<runtime_info>[^<]*\n/);
  });
});

describe("buildCodexAdditionalContext", () => {
  it("carries the app's instructions next to the runtime info", () => {
    const context = buildCodexAdditionalContext(
      { model: "gpt-5.3-codex", reasoningEffort: "high" },
      "<app_instructions>Use the calendar tools.</app_instructions>",
    );
    NodeAssert.equal(
      context.app_instructions?.value,
      "<app_instructions>Use the calendar tools.</app_instructions>",
    );
    NodeAssert.match(context.app_runtime?.value ?? "", /<runtime_info>/);
  });
});

function runtimeInstructions(runtime: Parameters<typeof buildCodexAdditionalContext>[0]) {
  return buildCodexAdditionalContext(runtime, "").app_runtime!.value;
}
