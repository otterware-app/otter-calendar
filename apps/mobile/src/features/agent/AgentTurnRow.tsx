import {
  type AgentStep,
  type AgentStepKind,
  type AgentTurnBlock,
  type AgentTurnView,
  agentTurnWorkLabel,
} from "@t3tools/client-runtime/agent-steps";
import { memo, useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";

import { type AppSymbolName, SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { MarkdownText } from "../../components/MarkdownText";

const STEP_ICONS: Readonly<Record<AgentStepKind, AppSymbolName>> = {
  command: "terminal",
  read: "doc.text",
  edit: "pencil",
  search: "magnifyingglass",
  web: "globe",
  tool: "hammer",
  agent: "person.2",
};

const MONO_FONT_FAMILY = Platform.select({ ios: "Menlo", default: "monospace" });

/**
 * One turn: the user's prompt, then what the agent did as one-line steps, then its answer.
 * Once the turn is done, the steps fold behind "Worked for Ns".
 */
export const AgentTurnRow = memo(function AgentTurnRow(props: { readonly view: AgentTurnView }) {
  const { view } = props;
  const running = view.turn.status === "running";
  const [expanded, setExpanded] = useState(false);
  const showWork = view.work.length > 0 && (running || !view.foldable || expanded);

  return (
    <View className="gap-3 px-4 py-3">
      {view.prompt === null ? null : <UserBubble text={view.prompt.text} />}
      {running || view.foldable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showWork }}
          disabled={running}
          className="flex-row items-center gap-1 self-start"
          onPress={() => setExpanded((value) => !value)}
        >
          <WorkLabel view={view} />
          {running ? null : (
            <SymbolView
              name={expanded ? "chevron.down" : "chevron.right"}
              size={11}
              tintColorClassName="accent-icon-muted"
              type="monochrome"
            />
          )}
        </Pressable>
      ) : null}
      {showWork ? (
        <View className="gap-2">
          {view.work.map((block) => (
            <TurnBlock key={blockKey(block)} block={block} muted />
          ))}
        </View>
      ) : null}
      {view.answer.map((block) => (
        <TurnBlock key={blockKey(block)} block={block} />
      ))}
      {view.error === null ? null : <ErrorText message={view.error} />}
    </View>
  );
});

function blockKey(block: AgentTurnBlock): string {
  return block.type === "step" ? block.step.id : block.id;
}

/** "Working for 4s" ticks once a second while the turn runs; only this label re-renders. */
function WorkLabel(props: { readonly view: AgentTurnView }) {
  const running = props.view.turn.completedAt === null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [running]);
  return (
    <Text className="text-sm font-t3-medium text-foreground-muted">
      {agentTurnWorkLabel(props.view.turn, now)}
    </Text>
  );
}

function TurnBlock(props: { readonly block: AgentTurnBlock; readonly muted?: boolean }) {
  const { block } = props;
  switch (block.type) {
    case "text":
      return props.muted ? (
        <Text className="text-sm text-foreground-muted">{block.text.trim()}</Text>
      ) : (
        <MarkdownText>{block.text}</MarkdownText>
      );
    case "user":
      return <UserBubble text={block.text} />;
    case "step":
      return <StepRow step={block.step} />;
    case "group":
      return (
        <View className="gap-1.5">
          <Text className="text-xs font-t3-bold text-foreground-muted">Used {block.source}</Text>
          <View className="gap-1.5 border-l border-border pl-3">
            {block.steps.map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
          </View>
        </View>
      );
    case "error":
      return <ErrorText message={block.message} />;
  }
}

function StepRow(props: { readonly step: AgentStep }) {
  const { step } = props;
  const [open, setOpen] = useState(false);
  const hasDetail = step.detail !== undefined || step.output !== undefined;
  return (
    <View className="gap-1">
      <Pressable
        accessibilityRole="button"
        accessibilityState={hasDetail ? { expanded: open } : undefined}
        disabled={!hasDetail}
        className="flex-row items-center gap-2"
        onPress={() => setOpen((value) => !value)}
      >
        <SymbolView
          name={step.status === "failed" ? "exclamationmark.circle" : STEP_ICONS[step.kind]}
          size={13}
          tintColorClassName={
            step.status === "failed" ? "accent-danger-foreground" : "accent-icon-muted"
          }
          type="monochrome"
        />
        <Text
          numberOfLines={1}
          className={
            step.status === "running"
              ? "flex-1 text-sm text-foreground"
              : "flex-1 text-sm text-foreground-muted"
          }
        >
          {step.title}
        </Text>
      </Pressable>
      {open ? (
        <View className="gap-1 rounded-xl bg-subtle px-3 py-2">
          {step.detail === undefined ? null : (
            <Text
              selectable
              className="text-xs text-foreground"
              style={{ fontFamily: MONO_FONT_FAMILY }}
            >
              {step.detail}
            </Text>
          )}
          {step.output === undefined ? null : (
            <Text
              selectable
              numberOfLines={12}
              className="text-xs text-foreground-muted"
              style={{ fontFamily: MONO_FONT_FAMILY }}
            >
              {step.output}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

function UserBubble(props: { readonly text: string }) {
  return (
    <View className="max-w-[85%] self-end rounded-2xl bg-user-bubble px-3.5 py-2">
      <Text selectable className="text-base text-user-bubble-foreground">
        {props.text}
      </Text>
    </View>
  );
}

function ErrorText(props: { readonly message: string }) {
  return (
    <View className="rounded-xl border border-danger-border bg-danger px-3 py-2">
      <Text className="text-sm text-danger-foreground">{props.message}</Text>
    </View>
  );
}
