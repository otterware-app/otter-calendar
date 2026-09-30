import { useAtomValue } from "@effect/atom-react";
import { CommonActions, type StaticScreenProps, useNavigation } from "@react-navigation/native";
import { presentPendingRequests } from "@t3tools/client-runtime/agent-steps";
import type {
  AgentThreadDetail,
  EnvironmentId,
  ModelSelection,
  ThreadId,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { type ReactNode, useMemo, useState } from "react";
import { Alert, FlatList, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ScreenHeader } from "../../components/ScreenHeader";
import type { ScreenHeaderMenuItem } from "../../components/ScreenHeader.types";
import { agentEnvironment } from "../../state/agent";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { atomCommandErrorMessage, useAtomCommand } from "../../state/use-atom-command";
import { EnvironmentLoadingState } from "../connection/EnvironmentLoadingState";
import { AgentComposer } from "./AgentComposer";
import { AgentRequestPanel, type AgentRequestResponse } from "./AgentRequestPanel";
import { AgentTurnRow } from "./AgentTurnRow";
import { modelLabel, modelMenuItems } from "./modelMenu";
import { presentTurnsReusing, type TurnViewCache } from "./turnViews";

const EMPTY_TURN_VIEW_CACHE: TurnViewCache = new Map();

/** Turn views that keep their identity while their turn is unchanged, so memoized rows skip. */
function useTurnViews(detail: AgentThreadDetail) {
  const [presented, setPresented] = useState(() => ({
    detail,
    ...presentTurnsReusing(EMPTY_TURN_VIEW_CACHE, detail),
  }));
  if (presented.detail === detail) return presented.views;
  const next = { detail, ...presentTurnsReusing(presented.cache, detail) };
  setPresented(next);
  return next.views;
}

/** One agent conversation, or a new one when the route has no thread id. */
export function AgentThreadRouteScreen({
  route,
}: StaticScreenProps<{
  readonly environmentId: EnvironmentId;
  readonly threadId?: ThreadId;
}>) {
  const { environmentId, threadId } = route.params;
  return threadId === undefined ? (
    <NewAgentThread environmentId={environmentId} />
  ) : (
    <AgentThread key={threadId} environmentId={environmentId} threadId={threadId} />
  );
}

function NewAgentThread(props: { readonly environmentId: EnvironmentId }) {
  const navigation = useNavigation();
  const createThread = useAtomCommand(agentEnvironment.createThread);
  const providers = useAtomValue(serverEnvironment.configValueAtom(props.environmentId))?.providers;
  const [modelSelection, setModelSelection] = useState<ModelSelection | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const models = modelMenuItems({
    providers: providers ?? [],
    current: modelSelection,
    onSelect: setModelSelection,
  });

  const send = async () => {
    const message = draft.trim();
    if (message.length === 0 || sending) return;
    setSending(true);
    setError(null);
    const result = await createThread({
      environmentId: props.environmentId,
      input: { message, ...(modelSelection === null ? {} : { modelSelection }) },
    });
    setSending(false);
    if (AsyncResult.isSuccess(result)) {
      navigation.dispatch(CommonActions.setParams({ threadId: result.value.threadId }));
    } else {
      setError(atomCommandErrorMessage(result, "The conversation could not be started."));
    }
  };

  return (
    <View collapsable={false} className="flex-1 bg-screen">
      <ScreenHeader
        title="New chat"
        subtitle={modelLabel(providers ?? [], modelSelection)}
        onBack={() => navigation.goBack()}
        menus={models.length === 0 ? [] : [{ title: "Model", icon: "sparkles", items: models }]}
        optionsVersion={[modelSelection?.instanceId, modelSelection?.model, models.length]}
      />
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <View className="flex-1 justify-center">
          {error === null ? null : (
            <View className="px-5 pb-3">
              <ErrorBanner message={error} />
            </View>
          )}
          <EmptyState
            variant="plain"
            title="Ask the agent"
            detail="It can read and change your calendars, and answer questions about your schedule."
          />
        </View>
        <ComposerArea>
          <AgentComposer
            autoFocus
            value={draft}
            onChangeText={setDraft}
            busy={false}
            sending={sending}
            onSend={() => void send()}
            onStop={() => undefined}
          />
        </ComposerArea>
      </KeyboardAvoidingView>
    </View>
  );
}

function AgentThread(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const { environmentId, threadId } = props;
  const navigation = useNavigation();
  const detail = useEnvironmentQuery(
    agentEnvironment.thread({ environmentId, input: { threadId } }),
  );

  if (detail.data === null) {
    return (
      <View className="flex-1 bg-screen">
        <ScreenHeader title="Chat" onBack={() => navigation.goBack()} />
        {detail.hasData ? (
          <View className="flex-1 justify-center">
            <EmptyState
              variant="plain"
              title="Conversation not found"
              detail="It may have been deleted."
            />
          </View>
        ) : (
          <EnvironmentLoadingState
            environmentId={environmentId}
            resourceName="conversation"
            error={detail.error}
          />
        )}
      </View>
    );
  }
  return <AgentConversation environmentId={environmentId} detail={detail.data} />;
}

function AgentConversation(props: {
  readonly environmentId: EnvironmentId;
  readonly detail: AgentThreadDetail;
}) {
  const { environmentId, detail } = props;
  const { threadId } = detail.thread;
  const navigation = useNavigation();
  const providers = useAtomValue(serverEnvironment.configValueAtom(environmentId))?.providers ?? [];
  const sendMessage = useAtomCommand(agentEnvironment.sendMessage);
  const interrupt = useAtomCommand(agentEnvironment.interrupt);
  const respondToRequest = useAtomCommand(agentEnvironment.respondToRequest);
  const updateThread = useAtomCommand(agentEnvironment.updateThread);
  const deleteThread = useAtomCommand(agentEnvironment.deleteThread);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const views = useTurnViews(detail);
  // The list is inverted so it stays pinned to the newest turn.
  const turns = useMemo(() => [...views].reverse(), [views]);
  const pending = useMemo(() => presentPendingRequests(detail), [detail]);
  const busy = detail.thread.status !== "idle";

  const send = async () => {
    const text = draft.trim();
    if (text.length === 0 || sending) return;
    setSending(true);
    setError(null);
    setDraft("");
    const result = await sendMessage({ environmentId, input: { threadId, text } });
    setSending(false);
    if (!AsyncResult.isSuccess(result)) {
      setDraft((current) => (current.length === 0 ? text : current));
      setError(atomCommandErrorMessage(result, "The message could not be sent."));
    }
  };

  const stop = async () => {
    const result = await interrupt({ environmentId, input: { threadId } });
    if (!AsyncResult.isSuccess(result)) {
      setError(atomCommandErrorMessage(result, "The agent could not be stopped."));
    }
  };

  const respond = async (response: AgentRequestResponse) => {
    const request = pending[0]?.request;
    if (request === undefined) return;
    setRespondingId(request.id);
    const result = await respondToRequest({
      environmentId,
      input: { threadId, requestId: request.id, ...response },
    });
    setRespondingId(null);
    if (!AsyncResult.isSuccess(result)) {
      setError(atomCommandErrorMessage(result, "The answer could not be sent."));
    }
  };

  const selectModel = async (modelSelection: ModelSelection) => {
    const result = await updateThread({ environmentId, input: { threadId, modelSelection } });
    if (!AsyncResult.isSuccess(result)) {
      setError(atomCommandErrorMessage(result, "The model could not be changed."));
    }
  };

  const confirmDelete = () => {
    Alert.alert("Delete this conversation?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deleteThread({ environmentId, input: { threadId } }).then((result) => {
            if (AsyncResult.isSuccess(result)) navigation.goBack();
            else
              setError(atomCommandErrorMessage(result, "The conversation could not be deleted."));
          });
        },
      },
    ]);
  };

  const models = modelMenuItems({
    providers,
    current: detail.thread.modelSelection,
    onSelect: (selection) => void selectModel(selection),
  });
  const menuItems: ReadonlyArray<ScreenHeaderMenuItem> = [
    ...(models.length === 0 ? [] : [{ id: "model", title: "Model", inline: true, items: models }]),
    {
      id: "delete",
      title: "Delete conversation",
      icon: "trash",
      destructive: true,
      onPress: confirmDelete,
    },
  ];
  const firstPending = pending[0];

  return (
    <View collapsable={false} className="flex-1 bg-screen">
      <ScreenHeader
        title={detail.thread.title}
        subtitle={modelLabel(providers, detail.thread.modelSelection)}
        onBack={() => navigation.goBack()}
        menus={[{ title: "Conversation", icon: "ellipsis", items: menuItems }]}
        optionsVersion={[detail.thread.modelSelection, models.length]}
      />
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <FlatList
          inverted
          data={turns}
          keyExtractor={(view) => view.turn.turnId}
          renderItem={({ item }) => <AgentTurnRow view={item} />}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          className="flex-1"
          contentContainerStyle={{ paddingVertical: 8 }}
          ListHeaderComponent={
            error === null ? null : (
              <View className="px-4 pb-2">
                <ErrorBanner message={error} />
              </View>
            )
          }
        />
        <ComposerArea>
          {firstPending === undefined ? null : (
            <AgentRequestPanel
              pending={firstPending}
              responding={respondingId === firstPending.request.id}
              onRespond={(response) => void respond(response)}
            />
          )}
          <AgentComposer
            value={draft}
            onChangeText={setDraft}
            busy={busy}
            sending={sending}
            onSend={() => void send()}
            onStop={() => void stop()}
          />
        </ComposerArea>
      </KeyboardAvoidingView>
    </View>
  );
}

function ComposerArea(props: { readonly children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={{ paddingBottom: insets.bottom }}>{props.children}</View>;
}
