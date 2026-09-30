import { useNavigation } from "@react-navigation/native";
import type { AgentThreadSummary, EnvironmentId } from "@t3tools/contracts";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { EmptyState } from "../../components/EmptyState";
import { RowPressable } from "../../components/RowPressable";
import { ScreenHeader } from "../../components/ScreenHeader";
import { StatusPill } from "../../components/StatusPill";
import { relativeTime } from "../../lib/time";
import { useActiveEnvironment } from "../../state/active-environment";
import { agentEnvironment } from "../../state/agent";
import { useEnvironmentQuery } from "../../state/query";
import { environmentMenuItems } from "../connection/environmentMenu";
import { EnvironmentLoadingState } from "../connection/EnvironmentLoadingState";
import { NoEnvironmentState } from "../connection/NoEnvironmentState";

/** The active environment's agent conversations, newest activity first. */
export function AgentThreadsRouteScreen() {
  const navigation = useNavigation();
  const { environments, activeEnvironment, selectEnvironment } = useActiveEnvironment();
  const environmentId = activeEnvironment?.environmentId ?? null;
  const menuItems = environmentMenuItems({
    environments,
    activeEnvironmentId: environmentId,
    onSelect: selectEnvironment,
  });

  return (
    <View collapsable={false} className="flex-1 bg-screen">
      <ScreenHeader
        title="Agent"
        subtitle={environments.length > 1 ? activeEnvironment?.environmentLabel : undefined}
        onBack={() => navigation.goBack()}
        actions={
          environmentId === null
            ? []
            : [
                {
                  accessibilityLabel: "New chat",
                  icon: "square.and.pencil",
                  onPress: () => navigation.navigate("AgentThread", { environmentId }),
                },
              ]
        }
        menus={
          menuItems.length === 0
            ? []
            : [{ title: "Environment", icon: "ellipsis", items: menuItems }]
        }
        optionsVersion={[environmentId, environments.length]}
      />
      {environmentId === null ? (
        <NoEnvironmentState />
      ) : (
        <AgentThreadList key={environmentId} environmentId={environmentId} />
      )}
    </View>
  );
}

function AgentThreadList(props: { readonly environmentId: EnvironmentId }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const threads = useEnvironmentQuery(
    agentEnvironment.threads({ environmentId: props.environmentId, input: {} }),
  );

  if (threads.data === null) {
    return (
      <EnvironmentLoadingState
        environmentId={props.environmentId}
        resourceName="conversations"
        error={threads.error}
      />
    );
  }

  return (
    <FlatList
      data={threads.data}
      keyExtractor={(thread) => thread.threadId}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18, flexGrow: 1 }}
      ListEmptyComponent={
        <View className="flex-1 justify-center">
          <EmptyState
            variant="plain"
            title="No conversations yet"
            detail="Ask the agent to find, write, or organize things in the app for you."
            actionLabel="New chat"
            onAction={() =>
              navigation.navigate("AgentThread", { environmentId: props.environmentId })
            }
          />
        </View>
      }
      renderItem={({ item }) => (
        <AgentThreadRow
          thread={item}
          onPress={() =>
            navigation.navigate("AgentThread", {
              environmentId: props.environmentId,
              threadId: item.threadId,
            })
          }
        />
      )}
    />
  );
}

function AgentThreadRow(props: {
  readonly thread: AgentThreadSummary;
  readonly onPress: () => void;
}) {
  const { thread } = props;
  const status =
    thread.pendingRequestCount > 0
      ? {
          label: "Needs you",
          pillClassName: "bg-warning",
          textClassName: "text-warning-foreground",
        }
      : thread.status === "idle"
        ? null
        : { label: "Working", pillClassName: "bg-subtle", textClassName: "text-foreground-muted" };
  return (
    <RowPressable
      accessibilityRole="button"
      className="border-b border-separator px-5 py-3"
      onPress={props.onPress}
    >
      <View className="flex-row items-center gap-2">
        <Text numberOfLines={1} className="flex-1 text-base font-t3-bold text-foreground">
          {thread.title}
        </Text>
        {status === null ? (
          <Text className="text-xs text-foreground-muted">{relativeTime(thread.updatedAt)}</Text>
        ) : (
          <StatusPill {...status} size="compact" />
        )}
      </View>
      {thread.preview.length > 0 ? (
        <Text numberOfLines={2} className="mt-0.5 text-sm text-foreground-muted">
          {thread.preview}
        </Text>
      ) : null}
    </RowPressable>
  );
}
