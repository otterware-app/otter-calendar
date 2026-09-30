import type { AgentPendingRequest } from "@t3tools/client-runtime/agent-steps";
import type {
  OrchestrationV2UserInputQuestion,
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
} from "@t3tools/contracts";
import { type ReactNode, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { cn } from "../../lib/cn";
import {
  buildQuestionAnswers,
  EMPTY_QUESTION_DRAFT,
  type QuestionDraft,
  questionOptionValue,
  toggleQuestionOption,
} from "./questionAnswers";

export type AgentRequestResponse =
  | { readonly decision: ProviderApprovalDecision }
  | { readonly answers: ProviderUserInputAnswers };

const DEFAULT_APPROVAL_OPTIONS: ReadonlyArray<{
  readonly decision: ProviderApprovalDecision;
  readonly label: string;
  readonly warning?: string;
}> = [
  { decision: "accept", label: "Allow once" },
  { decision: "acceptForSession", label: "Allow for session" },
  { decision: "decline", label: "Deny" },
];

const APPROVAL_TITLES: Readonly<Record<string, string>> = {
  command: "Run a command?",
  "file-read": "Read a file?",
  "file-change": "Change files?",
  "mcp-elicitation": "Allow this action?",
  permission: "Allow this action?",
};

/** The oldest approval or question the agent is waiting on, answered in place above the composer. */
export function AgentRequestPanel(props: {
  readonly pending: AgentPendingRequest;
  readonly responding: boolean;
  readonly onRespond: (response: AgentRequestResponse) => void;
}) {
  const { request, item } = props.pending;
  if (item?.type === "user_input_request") {
    return (
      <QuestionsPanel
        key={request.id}
        questions={item.questions}
        responding={props.responding}
        onSubmit={(answers) => props.onRespond({ answers })}
      />
    );
  }
  if (item === null && request.kind === "user_input") {
    return (
      <PanelFrame title="The agent has a question">
        <Text className="text-sm text-foreground-muted">Loading the question…</Text>
      </PanelFrame>
    );
  }
  const options = item?.options?.length ? item.options : DEFAULT_APPROVAL_OPTIONS;
  return (
    <PanelFrame
      title={
        item?.title ??
        (item?.appName ? `Allow ${item.appName}?` : undefined) ??
        APPROVAL_TITLES[request.kind] ??
        "Allow this action?"
      }
    >
      {item?.prompt ? (
        <Text selectable numberOfLines={8} className="text-sm text-foreground">
          {item.prompt}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => (
          <PanelButton
            key={option.decision}
            label={option.label}
            primary={option.decision === "accept"}
            disabled={props.responding}
            onPress={() => props.onRespond({ decision: option.decision })}
          />
        ))}
      </View>
      {options.flatMap((option) =>
        option.warning === undefined
          ? []
          : [
              <Text key={option.decision} className="text-xs text-foreground-muted">
                {option.warning}
              </Text>,
            ],
      )}
    </PanelFrame>
  );
}

function QuestionsPanel(props: {
  readonly questions: ReadonlyArray<OrchestrationV2UserInputQuestion>;
  readonly responding: boolean;
  readonly onSubmit: (answers: ProviderUserInputAnswers) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, QuestionDraft>>({});
  const answers = buildQuestionAnswers(props.questions, drafts);
  const update = (questionId: string, draft: QuestionDraft) =>
    setDrafts((current) => ({ ...current, [questionId]: draft }));

  return (
    <PanelFrame title={props.questions.length === 1 ? "The agent asks" : "The agent has questions"}>
      {props.questions.map((question) => {
        const draft = drafts[question.id] ?? EMPTY_QUESTION_DRAFT;
        return (
          <View key={question.id} className="gap-2">
            <Text className="text-sm font-t3-bold text-foreground">{question.question}</Text>
            <View className="flex-row flex-wrap gap-2">
              {question.options.map((option) => {
                const value = questionOptionValue(option);
                return (
                  <PanelButton
                    key={value}
                    label={option.label}
                    primary={draft.selected.includes(value) && draft.custom.trim().length === 0}
                    disabled={props.responding}
                    onPress={() =>
                      update(question.id, toggleQuestionOption(question, draft, value))
                    }
                  />
                );
              })}
            </View>
            {question.allowCustomAnswer === false ? null : (
              <TextInput
                accessibilityLabel={`Answer: ${question.header}`}
                className="rounded-xl border border-input-border bg-input px-3 py-2 text-sm text-foreground"
                placeholder="Or type an answer"
                placeholderTextColorClassName="accent-placeholder"
                value={draft.custom}
                onChangeText={(custom) => update(question.id, { ...draft, custom })}
              />
            )}
          </View>
        );
      })}
      <View className="flex-row">
        <PanelButton
          label="Send answers"
          primary
          disabled={answers === null || props.responding}
          onPress={() => {
            if (answers !== null) props.onSubmit(answers);
          }}
        />
      </View>
    </PanelFrame>
  );
}

function PanelFrame(props: { readonly title: string; readonly children: ReactNode }) {
  return (
    <View className="mx-3 mb-2 gap-2.5 rounded-2xl border border-border bg-card p-3.5">
      <Text className="text-base font-t3-bold text-foreground">{props.title}</Text>
      {props.children}
    </View>
  );
}

function PanelButton(props: {
  readonly label: string;
  readonly primary?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: props.disabled === true, selected: props.primary === true }}
      disabled={props.disabled}
      onPress={props.onPress}
      className={cn(
        "rounded-full px-3.5 py-2 active:opacity-70",
        props.primary ? "bg-primary" : "bg-subtle",
        props.disabled && "opacity-50",
      )}
    >
      <Text
        className={cn(
          "text-sm font-t3-bold",
          props.primary ? "text-primary-foreground" : "text-foreground",
        )}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}
