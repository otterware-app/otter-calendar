import { useNavigation } from "@react-navigation/native";
import type { EnvironmentId, Note } from "@t3tools/contracts";
import { useCallback } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { RowPressable } from "../../components/RowPressable";
import { ScreenHeader } from "../../components/ScreenHeader";
import { relativeTime } from "../../lib/time";
import { useActiveEnvironment } from "../../state/active-environment";
import { notesEnvironment } from "../../state/notes";
import { useEnvironmentQuery } from "../../state/query";
import { environmentMenuItems } from "../connection/environmentMenu";
import { EnvironmentLoadingState } from "../connection/EnvironmentLoadingState";
import { NoEnvironmentState } from "../connection/NoEnvironmentState";

/** Home: the active environment's notes, pinned first. */
export function NotesRouteScreen() {
  const navigation = useNavigation();
  const { environments, activeEnvironment, selectEnvironment } = useActiveEnvironment();
  const environmentId = activeEnvironment?.environmentId ?? null;

  return (
    <View collapsable={false} className="flex-1 bg-screen">
      <ScreenHeader
        title="Notes"
        subtitle={environments.length > 1 ? activeEnvironment?.environmentLabel : undefined}
        actions={[
          {
            accessibilityLabel: "Agent",
            icon: "sparkles",
            onPress: () => navigation.navigate("AgentThreads"),
          },
          ...(environmentId === null
            ? []
            : [
                {
                  accessibilityLabel: "New note",
                  icon: "square.and.pencil" as const,
                  onPress: () => navigation.navigate("Note", { environmentId }),
                },
              ]),
        ]}
        menus={[
          {
            title: "More",
            icon: "ellipsis",
            items: [
              ...environmentMenuItems({
                environments,
                activeEnvironmentId: environmentId,
                onSelect: selectEnvironment,
              }),
              {
                id: "settings",
                title: "Settings",
                icon: "gearshape",
                onPress: () => navigation.navigate("SettingsSheet"),
              },
            ],
          },
        ]}
        optionsVersion={[environmentId, environments.length]}
      />
      {environmentId === null ? (
        <NoEnvironmentState />
      ) : (
        <NotesList key={environmentId} environmentId={environmentId} />
      )}
    </View>
  );
}

function NotesList(props: { readonly environmentId: EnvironmentId }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const notes = useEnvironmentQuery(
    notesEnvironment.notes({ environmentId: props.environmentId, input: {} }),
  );
  const openNote = useCallback(
    (note: Note) =>
      navigation.navigate("Note", { environmentId: props.environmentId, noteId: note.noteId }),
    [navigation, props.environmentId],
  );

  if (notes.data === null) {
    return (
      <EnvironmentLoadingState
        environmentId={props.environmentId}
        resourceName="notes"
        error={notes.error}
      />
    );
  }

  return (
    <FlatList
      data={notes.data}
      keyExtractor={(note) => note.noteId}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18, flexGrow: 1 }}
      ListHeaderComponent={
        notes.error === null ? null : (
          <View className="px-5 pt-3">
            <ErrorBanner message={notes.error} />
          </View>
        )
      }
      ListEmptyComponent={
        <View className="flex-1 justify-center">
          <EmptyState
            variant="plain"
            title="No notes yet"
            detail="Write one yourself, or ask the agent to take notes for you."
            actionLabel="New note"
            onAction={() => navigation.navigate("Note", { environmentId: props.environmentId })}
          />
        </View>
      }
      renderItem={({ item }) => <NoteRow note={item} onPress={openNote} />}
    />
  );
}

function NoteRow(props: { readonly note: Note; readonly onPress: (note: Note) => void }) {
  const { note } = props;
  const preview = note.body.trim().split("\n")[0] ?? "";
  return (
    <RowPressable
      accessibilityRole="button"
      className="border-b border-separator px-5 py-3"
      onPress={() => props.onPress(note)}
    >
      <View className="flex-row items-center gap-2">
        {note.pinned ? (
          <SymbolView
            name="pin"
            size={13}
            tintColorClassName="accent-icon-muted"
            type="monochrome"
          />
        ) : null}
        <Text numberOfLines={1} className="flex-1 text-base font-t3-bold text-foreground">
          {note.title}
        </Text>
        <Text className="text-xs text-foreground-muted">{relativeTime(note.updatedAt)}</Text>
      </View>
      {preview.length > 0 ? (
        <Text numberOfLines={2} className="mt-0.5 text-sm text-foreground-muted">
          {preview}
        </Text>
      ) : null}
    </RowPressable>
  );
}
