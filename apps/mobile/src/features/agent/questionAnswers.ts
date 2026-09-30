import type { OrchestrationV2UserInputQuestion } from "@t3tools/contracts";

/** What the user picked or typed for one question. A typed answer wins over picked options. */
export interface QuestionDraft {
  readonly selected: ReadonlyArray<string>;
  readonly custom: string;
}

export const EMPTY_QUESTION_DRAFT: QuestionDraft = { selected: [], custom: "" };

/** The value an option answers with: its provider value, else its label. */
export function questionOptionValue(option: OrchestrationV2UserInputQuestion["options"][number]) {
  return option.value ?? option.label;
}

/** Picking an option clears a typed answer; a single-choice question keeps one option. */
export function toggleQuestionOption(
  question: OrchestrationV2UserInputQuestion,
  draft: QuestionDraft,
  value: string,
): QuestionDraft {
  if (!question.multiSelect) return { selected: [value], custom: "" };
  return {
    selected: draft.selected.includes(value)
      ? draft.selected.filter((entry) => entry !== value)
      : [...draft.selected, value],
    custom: "",
  };
}

function resolveAnswer(
  question: OrchestrationV2UserInputQuestion,
  draft: QuestionDraft,
): string | ReadonlyArray<string> | null {
  const custom = question.allowCustomAnswer === false ? "" : draft.custom.trim();
  if (custom.length > 0) return custom;
  const selected = draft.selected.filter((value) =>
    question.options.some((option) => questionOptionValue(option) === value),
  );
  if (question.multiSelect) return selected.length > 0 ? selected : null;
  return selected[0] ?? null;
}

/**
 * The answers to send, keyed by question id, or null while a required question is unanswered.
 * Questions are required unless they say otherwise.
 */
export function buildQuestionAnswers(
  questions: ReadonlyArray<OrchestrationV2UserInputQuestion>,
  drafts: Readonly<Record<string, QuestionDraft>>,
): Record<string, string | ReadonlyArray<string>> | null {
  const answers: Record<string, string | ReadonlyArray<string>> = {};
  for (const question of questions) {
    const answer = resolveAnswer(question, drafts[question.id] ?? EMPTY_QUESTION_DRAFT);
    if (answer !== null) answers[question.id] = answer;
    else if (question.required !== false) return null;
  }
  return answers;
}
