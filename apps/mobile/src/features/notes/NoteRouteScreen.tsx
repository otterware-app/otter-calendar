import { type StaticScreenProps, useNavigation, usePreventRemove } from "@react-navigation/native";
import type { EnvironmentId, Note, NoteId } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { useRef, useState } from "react";
import { Alert, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ScreenHeader } from "../../components/ScreenHeader";
import { notesEnvironment } from "../../state/notes";
import { useEnvironmentQuery } from "../../state/query";
import { atomCommandErrorMessage, useAtomCommand } from "../../state/use-atom-command";
import { EnvironmentLoadingState } from "../connection/EnvironmentLoadingState";

/** Edits one note, or writes a new one when the route has no note id. */
export function NoteRouteScreen({
  route,
}: StaticScreenProps<{
  readonly environmentId: EnvironmentId;
  readonly noteId?: NoteId;
}>) {
  const { environmentId, noteId } = route.params;
  const notes = useEnvironmentQuery(notesEnvironment.notes({ environmentId, input: {} }));
  const navigation = useNavigation();

  if (noteId === undefined) {
    return <NoteEditor environmentId={environmentId} note={null} />;
  }
  const note = notes.data?.find((candidate) => candidate.noteId === noteId);
  if (note !== undefined) {
    return <NoteEditor key={noteId} environmentId={environmentId} note={note} />;
  }
  return (
    <View className="flex-1 bg-screen">
      <ScreenHeader title="Note" onBack={() => navigation.goBack()} />
      {notes.data === null ? (
        <EnvironmentLoadingState
          environmentId={environmentId}
          resourceName="note"
          error={notes.error}
        />
      ) : (
        <View className="flex-1 justify-center">
          <EmptyState variant="plain" title="Note not found" detail="It may have been deleted." />
        </View>
      )}
    </View>
  );
}

function NoteEditor(props: { readonly environmentId: EnvironmentId; readonly note: Note | null }) {
  const { environmentId, note } = props;
  const navigation = useNavigation();
  const createNote = useAtomCommand(notesEnvironment.createNote);
  const updateNote = useAtomCommand(notesEnvironment.updateNote);
  const deleteNote = useAtomCommand(notesEnvironment.deleteNote);
  // Null until the user types, so the fields follow edits made elsewhere (another device, the agent).
  const [draft, setDraft] = useState<{ readonly title: string; readonly body: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leavingRef = useRef(false);

  const title = draft?.title ?? note?.title ?? "";
  const body = draft?.body ?? note?.body ?? "";
  const dirty = draft !== null && (title !== (note?.title ?? "") || body !== (note?.body ?? ""));
  const canSave = dirty && title.trim().length > 0 && !saving;

  usePreventRemove(dirty, ({ data }) => {
    if (leavingRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert("Discard changes?", "Your edits to this note are not saved.", [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  const leave = () => {
    leavingRef.current = true;
    navigation.goBack();
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const result =
      note === null
        ? await createNote({ environmentId, input: { title: title.trim(), body } })
        : await updateNote({
            environmentId,
            input: { noteId: note.noteId, title: title.trim(), body },
          });
    setSaving(false);
    if (AsyncResult.isSuccess(result)) {
      leave();
    } else {
      setError(atomCommandErrorMessage(result, "The note could not be saved."));
    }
  };

  const setPinned = async (pinned: boolean) => {
    if (note === null) return;
    const result = await updateNote({ environmentId, input: { noteId: note.noteId, pinned } });
    if (!AsyncResult.isSuccess(result)) {
      setError(atomCommandErrorMessage(result, "The note could not be updated."));
    }
  };

  const confirmDelete = () => {
    if (note === null) return;
    Alert.alert("Delete this note?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deleteNote({ environmentId, input: { noteId: note.noteId } }).then((result) => {
            if (AsyncResult.isSuccess(result)) leave();
            else setError(atomCommandErrorMessage(result, "The note could not be deleted."));
          });
        },
      },
    ]);
  };

  return (
    <View collapsable={false} className="flex-1 bg-screen">
      <ScreenHeader
        title={note === null ? "New note" : "Note"}
        onBack={() => navigation.goBack()}
        actions={[
          {
            accessibilityLabel: "Save",
            icon: "checkmark",
            disabled: !canSave,
            onPress: () => void save(),
          },
        ]}
        menus={
          note === null
            ? []
            : [
                {
                  title: "Note actions",
                  icon: "ellipsis",
                  items: [
                    {
                      id: "pin",
                      title: note.pinned ? "Unpin" : "Pin",
                      icon: note.pinned ? "pin.slash" : "pin",
                      onPress: () => void setPinned(!note.pinned),
                    },
                    {
                      id: "delete",
                      title: "Delete",
                      icon: "trash",
                      destructive: true,
                      onPress: confirmDelete,
                    },
                  ],
                },
              ]
        }
        optionsVersion={[canSave, note?.pinned]}
      />
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        {error === null ? null : (
          <View className="px-5 pt-3">
            <ErrorBanner message={error} />
          </View>
        )}
        <TextInput
          accessibilityLabel="Title"
          autoFocus={note === null}
          className="px-5 pt-4 pb-2 text-xl font-t3-bold text-foreground"
          placeholder="Title"
          placeholderTextColorClassName="accent-placeholder"
          returnKeyType="next"
          value={title}
          onChangeText={(value) => setDraft({ title: value, body })}
        />
        <TextInput
          accessibilityLabel="Note"
          className="flex-1 px-5 pb-6 text-base text-foreground"
          multiline
          placeholder="Write something…"
          placeholderTextColorClassName="accent-placeholder"
          scrollEnabled
          textAlignVertical="top"
          value={body}
          onChangeText={(value) => setDraft({ title, body: value })}
        />
      </KeyboardAvoidingView>
    </View>
  );
}
