import { useAtomValue } from "@effect/atom-react";
import {
  DEFAULT_RUNTIME_MODE,
  type AgentThreadSummary,
  type EnvironmentId,
  type ModelSelection,
  type RuntimeMode,
} from "@t3tools/contracts";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { useRef, useState } from "react";

import { useAgentPanelStore } from "../../agentPanelStore";
import { useClientSettings } from "../../hooks/useSettings";
import { resolveDefaultProviderModelSelection } from "../../providerInstances";
import { agentEnvironment } from "../../state/agent";
import { serverEnvironment } from "../../state/server";
import { toastCommandFailure } from "../../lib/commandFailureToast";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { AgentModelPicker, AgentRuntimeModePicker } from "./AgentModelPicker";
import { composerKeySends } from "./composerKeys";

const EMPTY_PROVIDERS: never[] = [];

/** Writes to the open conversation, or starts a new one with the picked model and mode. */
export function AgentComposer({
  environmentId,
  thread,
}: {
  environmentId: EnvironmentId;
  /** The open conversation; null starts a new one on send. */
  thread: AgentThreadSummary | null;
}) {
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const providers = config?.providers ?? EMPTY_PROVIDERS;
  const sendShortcut = useClientSettings((settings) => settings.sendShortcut);
  const pageContext = useAgentPanelStore((state) => state.pageContext);
  const draftModelSelection = useAgentPanelStore((state) => state.draftModelSelection);
  const draftRuntimeMode = useAgentPanelStore((state) => state.draftRuntimeMode);
  const setDraftModelSelection = useAgentPanelStore((state) => state.setDraftModelSelection);
  const setDraftRuntimeMode = useAgentPanelStore((state) => state.setDraftRuntimeMode);
  const openThread = useAgentPanelStore((state) => state.openThread);
  const createThread = useAtomCommand(agentEnvironment.createThread);
  const sendMessage = useAtomCommand(agentEnvironment.sendMessage);
  const interrupt = useAtomCommand(agentEnvironment.interrupt);
  const updateThread = useAtomCommand(agentEnvironment.updateThread);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const modelSelection: ModelSelection | null =
    thread?.modelSelection ??
    resolveDefaultProviderModelSelection(
      providers,
      draftModelSelection ?? config?.settings.defaultModelSelection,
    );
  const runtimeMode: RuntimeMode =
    thread?.runtimeMode ??
    draftRuntimeMode ??
    config?.settings.defaultRuntimeMode ??
    DEFAULT_RUNTIME_MODE;
  const selectedProvider = providers.find(
    (provider) => provider.instanceId === modelSelection?.instanceId,
  );
  const running = thread !== null && thread.status !== "idle";
  const canSend =
    text.trim().length > 0 && !sending && (thread !== null || modelSelection !== null);

  const send = async () => {
    const message = text.trim();
    if (!canSend) return;
    setSending(true);
    const context = pageContext ?? undefined;
    if (thread === null) {
      const result = await createThread({
        environmentId,
        input: {
          message,
          ...(context ? { context } : {}),
          ...(modelSelection ? { modelSelection } : {}),
          runtimeMode,
        },
      });
      setSending(false);
      if (toastCommandFailure("Could not start the chat", result) || result._tag !== "Success") {
        return;
      }
      openThread(result.value.threadId);
    } else {
      const result = await sendMessage({
        environmentId,
        input: { threadId: thread.threadId, text: message, ...(context ? { context } : {}) },
      });
      setSending(false);
      if (toastCommandFailure("Could not send the message", result)) return;
    }
    setText("");
    textareaRef.current?.focus();
  };

  const changeModel = (selection: ModelSelection) => {
    if (thread === null) setDraftModelSelection(selection);
    else
      void updateThread({
        environmentId,
        input: { threadId: thread.threadId, modelSelection: selection },
      });
  };
  const changeRuntimeMode = (mode: RuntimeMode) => {
    if (thread === null) setDraftRuntimeMode(mode);
    else
      void updateThread({ environmentId, input: { threadId: thread.threadId, runtimeMode: mode } });
  };

  return (
    <form
      className="mx-3 mb-3 flex flex-col rounded-2xl border border-border bg-popover shadow-xs focus-within:border-ring/60"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <textarea
        ref={textareaRef}
        value={text}
        rows={2}
        placeholder={thread === null ? "Ask anything" : "Reply"}
        aria-label="Message the agent"
        className="field-sizing-content max-h-48 min-h-14 w-full resize-none bg-transparent px-3 pt-2.5 font-(family-name:--font-composer,var(--font-sans)) text-(length:--font-size-prompt,var(--text-sm)) text-foreground outline-none placeholder:text-muted-foreground max-sm:pointer-coarse:text-(length:--font-size-prompt-touch)"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (composerKeySends(event.nativeEvent, sendShortcut, text)) {
            event.preventDefault();
            void send();
          }
        }}
      />
      <div className="flex items-center gap-1 px-1.5 pb-1.5">
        <AgentModelPicker providers={providers} value={modelSelection} onChange={changeModel} />
        <AgentRuntimeModePicker
          value={runtimeMode}
          supportedModes={selectedProvider?.supportedRuntimeModes}
          onChange={changeRuntimeMode}
        />
        <div className="ms-auto flex items-center gap-1">
          {running && thread !== null ? (
            <Button
              type="button"
              size="icon-xs"
              variant="outline"
              aria-label="Stop"
              onClick={() =>
                void interrupt({ environmentId, input: { threadId: thread.threadId } })
              }
            >
              <SquareIcon className="size-3" fill="currentColor" />
            </Button>
          ) : null}
          <Button type="submit" size="icon-xs" aria-label="Send" disabled={!canSend}>
            <ArrowUpIcon />
          </Button>
        </div>
      </div>
    </form>
  );
}
