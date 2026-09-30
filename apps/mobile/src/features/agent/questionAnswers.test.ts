import type { OrchestrationV2UserInputQuestion } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildQuestionAnswers,
  EMPTY_QUESTION_DRAFT,
  toggleQuestionOption,
} from "./questionAnswers";

const single: OrchestrationV2UserInputQuestion = {
  id: "color",
  header: "Color",
  question: "Which color?",
  options: [
    { label: "Red", description: "Warm" },
    { label: "Blue", description: "Cool", value: "blue-value" },
  ],
};

const multi: OrchestrationV2UserInputQuestion = {
  id: "days",
  header: "Days",
  question: "Which days?",
  multiSelect: true,
  options: [
    { label: "Monday", description: "Start" },
    { label: "Friday", description: "End" },
  ],
};

describe("question answers", () => {
  it("answers with an option's value, falling back to its label", () => {
    const draft = toggleQuestionOption(single, EMPTY_QUESTION_DRAFT, "blue-value");
    expect(buildQuestionAnswers([single], { color: draft })).toEqual({ color: "blue-value" });
    expect(
      buildQuestionAnswers([single], {
        color: toggleQuestionOption(single, draft, "Red"),
      }),
    ).toEqual({ color: "Red" });
  });

  it("toggles several options for a multi-select question", () => {
    let draft = toggleQuestionOption(multi, EMPTY_QUESTION_DRAFT, "Monday");
    draft = toggleQuestionOption(multi, draft, "Friday");
    draft = toggleQuestionOption(multi, draft, "Monday");
    expect(buildQuestionAnswers([multi], { days: draft })).toEqual({ days: ["Friday"] });
  });

  it("prefers a typed answer unless the question forbids one", () => {
    const draft = { selected: ["Red"], custom: " Green " };
    expect(buildQuestionAnswers([single], { color: draft })).toEqual({ color: "Green" });
    expect(
      buildQuestionAnswers([{ ...single, allowCustomAnswer: false }], { color: draft }),
    ).toEqual({ color: "Red" });
  });

  it("waits for every required question but skips optional ones", () => {
    const draft = toggleQuestionOption(single, EMPTY_QUESTION_DRAFT, "Red");
    expect(buildQuestionAnswers([single, multi], { color: draft })).toBeNull();
    expect(buildQuestionAnswers([single, { ...multi, required: false }], { color: draft })).toEqual(
      { color: "Red" },
    );
  });

  it("ignores selections that are no longer options", () => {
    expect(
      buildQuestionAnswers([single], { color: { selected: ["Purple"], custom: "" } }),
    ).toBeNull();
  });
});
