import { Pressable, TextInput, View } from "react-native";

import { SymbolView } from "../../components/AppSymbol";
import { cn } from "../../lib/cn";

/**
 * The message field. While the agent works, an empty field offers Stop; typing turns the
 * button back into Send, which steers the running turn.
 */
export function AgentComposer(props: {
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly busy: boolean;
  readonly sending: boolean;
  readonly autoFocus?: boolean;
  readonly onSend: () => void;
  readonly onStop: () => void;
}) {
  const canSend = props.value.trim().length > 0 && !props.sending;
  const showStop = props.busy && props.value.trim().length === 0;
  return (
    <View className="flex-row items-end gap-2 border-t border-separator bg-screen px-3 py-2">
      <TextInput
        accessibilityLabel="Message"
        autoFocus={props.autoFocus}
        className="max-h-40 min-h-10 flex-1 rounded-[20px] border border-composer-border bg-composer-surface px-4 py-2.5 text-base text-foreground"
        multiline
        placeholder={props.busy ? "Add to the task…" : "Ask the agent…"}
        placeholderTextColorClassName="accent-placeholder"
        value={props.value}
        onChangeText={props.onChangeText}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={showStop ? "Stop" : "Send"}
        disabled={!showStop && !canSend}
        onPress={showStop ? props.onStop : props.onSend}
        className={cn(
          "size-10 items-center justify-center rounded-full bg-primary active:opacity-70",
          !showStop && !canSend && "opacity-40",
        )}
      >
        <SymbolView
          name={showStop ? "stop.fill" : "arrow.up"}
          size={17}
          tintColorClassName="accent-primary-foreground"
          type="monochrome"
        />
      </Pressable>
    </View>
  );
}
