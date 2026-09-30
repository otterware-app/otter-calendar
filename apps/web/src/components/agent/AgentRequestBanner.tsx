import type { AgentPendingRequest } from "@t3tools/client-runtime/agent-steps";
import type {
  EnvironmentId,
  OrchestrationV2UserInputQuestion,
  ProviderApprovalDecision,
  ThreadId,
} from "@t3tools/contracts";
import { ShieldQuestionIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "../../lib/utils";
import { agentEnvironment } from "../../state/agent";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";

const APPROVAL_CHOICES: ReadonlyArray<{
  readonly decision: ProviderApprovalDecision;
  readonly label: string;
  readonly variant: "default" | "outline" | "ghost";
}> = [
  { decision: "accept", label: "Allow once", variant: "default" },
  { decision: "acceptForSession", label: "Allow for session", variant: "outline" },
  { decision: "decline", label: "Deny", variant: "ghost" },
];

const REQUEST_KIND_TITLES: Record<string, string> = {
  command: "The agent wants to run a command",
  "file-read": "The agent wants to read a file",
  "file-change": "The agent wants to change a file",
};

type Answer = string | ReadonlyArray<string>;

function QuestionField({
  question,
  answer,
  onAnswer,
}: {
  question: OrchestrationV2UserInputQuestion;
  answer: Answer | undefined;
  onAnswer: (answer: Answer) => void;
}) {
  const selected = Array.isArray(answer) ? answer : typeof answer === "string" ? [answer] : [];
  const custom =
    typeof answer === "string" && !question.options.some((o) => (o.value ?? o.label) === answer)
      ? answer
      : "";
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm font-medium text-foreground">{question.question}</legend>
      <div className="flex flex-wrap gap-1.5">
        {question.options.map((option) => {
          const value = option.value ?? option.label;
          const checked = selected.includes(value);
          return (
            <Button
              key={value}
              size="xs"
              variant={checked ? "secondary" : "outline"}
              aria-pressed={checked}
              title={option.description}
              onClick={() =>
                onAnswer(
                  question.multiSelect
                    ? checked
                      ? selected.filter((entry) => entry !== value)
                      : [...selected, value]
                    : value,
                )
              }
            >
              {option.label}
            </Button>
          );
        })}
      </div>
      {question.allowCustomAnswer !== false ? (
        <input
          className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring"
          placeholder="Or type an answer"
          value={custom}
          onChange={(event) => onAnswer(event.target.value)}
        />
      ) : null}
    </fieldset>
  );
}

/** The oldest approval or question the agent waits on, answered right above the composer. */
export function AgentRequestBanner({
  environmentId,
  threadId,
  pending,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  pending: AgentPendingRequest;
}) {
  const respond = useAtomCommand(agentEnvironment.respondToRequest);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [submitting, setSubmitting] = useState(false);
  const { request, item } = pending;

  const send = (input: {
    decision?: ProviderApprovalDecision;
    answers?: Record<string, Answer>;
  }) => {
    setSubmitting(true);
    void respond({
      environmentId,
      input: { threadId, requestId: request.id, ...input },
    }).finally(() => setSubmitting(false));
  };

  if (item?.type === "user_input_request") {
    const complete = item.questions.every((question) => {
      const answer = answers[question.id];
      return question.required === false || (answer !== undefined && answer.length > 0);
    });
    return (
      <div className="mx-3 mb-2 flex flex-col gap-3 rounded-xl border border-border bg-popover p-3 shadow-xs">
        {item.questions.map((question) => (
          <QuestionField
            key={question.id}
            question={question}
            answer={answers[question.id]}
            onAnswer={(answer) => setAnswers((current) => ({ ...current, [question.id]: answer }))}
          />
        ))}
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            disabled={submitting}
            onClick={() => send({ decision: "cancel" })}
          >
            Skip
          </Button>
          <Button size="sm" disabled={!complete || submitting} onClick={() => send({ answers })}>
            Answer
          </Button>
        </div>
      </div>
    );
  }

  const offered = item?.type === "approval_request" ? item.options : undefined;
  const choices =
    offered === undefined || offered.length === 0
      ? APPROVAL_CHOICES
      : APPROVAL_CHOICES.filter((choice) =>
          offered.some((option) => option.decision === choice.decision),
        );
  const title =
    item?.type === "approval_request" && item.appName
      ? `${item.appName} wants access`
      : (REQUEST_KIND_TITLES[request.kind] ?? "The agent asks for permission");
  return (
    <div className="mx-3 mb-2 flex flex-col gap-2 rounded-xl border border-border bg-popover p-3 shadow-xs">
      <div className="flex items-start gap-2">
        <ShieldQuestionIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {item?.type === "approval_request" && item.prompt ? (
            <pre
              className={cn(
                "max-h-32 overflow-auto rounded-md bg-secondary px-2 py-1 font-mono text-xs break-all whitespace-pre-wrap text-muted-foreground",
              )}
            >
              {item.prompt}
            </pre>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-1.5">
        {choices.map((choice) => (
          <Button
            key={choice.decision}
            size="sm"
            variant={choice.variant}
            disabled={submitting}
            onClick={() => send({ decision: choice.decision })}
          >
            {choice.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
