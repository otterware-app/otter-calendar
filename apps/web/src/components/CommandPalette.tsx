/**
 * The command palette (Mod+K): app actions, notes, agent chats, settings pages, theme and
 * appearance. It also owns the theme shortcuts, since they open its theme view.
 */
import { useAtomValue } from "@effect/atom-react";
import { BUILT_IN_THEMES } from "@t3tools/shared/themePalettes";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  MonitorIcon,
  MoonIcon,
  NotebookPenIcon,
  PaletteIcon,
  PlusIcon,
  SparklesIcon,
  SunIcon,
} from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAgentPanelStore } from "../agentPanelStore";
import { useCustomThemes } from "../hooks/useCustomThemes";
import { useEnvironmentThemeDefinitions } from "../hooks/useEnvironmentTheme";
import { useClientSettings } from "../hooks/useSettings";
import { useTheme } from "../hooks/useTheme";
import { resolveShortcutCommand } from "../keybindings";
import { useActiveEnvironmentId } from "../state/activeEnvironment";
import { useAgentThreads } from "../state/agent";
import { useNotes } from "../state/notes";
import { primaryServerKeybindingsAtom } from "../state/server";
import { getThemeDefinition } from "../themePalette";
import { formatShortTimestamp } from "../timestampFormat";
import {
  filterCommandPaletteGroups,
  ITEM_ICON_CLASS,
  type CommandPaletteActionItem,
  type CommandPaletteGroup,
  type CommandPaletteSubmenuItem,
} from "./CommandPalette.logic";
import { CommandPaletteContent } from "./CommandPaletteContent";
import { CommandPaletteResults } from "./CommandPaletteResults";
import { useCreateNote } from "./notes/useCreateNote";
import { SETTINGS_SECTIONS } from "./settings/settingsSections";
import { toggleThemeEditorForTheme } from "./settings/themeEditorStore";
import {
  getThemeCardDefinition,
  STANDARD_THEME_CARDS,
  ThemePreviewCircle,
} from "./settings/ThemePreviewCircles";
import { CommandDialog, CommandDialogPopup } from "./ui/command";
import { toastManager } from "./ui/toast";

const APPEARANCE_OPTIONS = [
  { mode: "system", label: "System", icon: MonitorIcon },
  { mode: "light", label: "Light", icon: SunIcon },
  { mode: "dark", label: "Dark", icon: MoonIcon },
] as const;

function notifyThemeSaveFailure(): void {
  toastManager.add({
    type: "error",
    title: "Couldn't save theme selection",
    description: "Try again.",
  });
}

type OpenView = "root" | "themes";

export function CommandPalette({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialView, setInitialView] = useState<OpenView>("root");
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const { theme, themeHalves, resolvedTheme, appearanceMode, setAppearanceMode } = useTheme();

  const openPalette = useCallback((view: OpenView) => {
    setInitialView(view);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const command = resolveShortcutCommand(event, keybindings);
      if (command === "commandPalette.toggle") {
        event.preventDefault();
        event.stopPropagation();
        if (open) setOpen(false);
        else openPalette("root");
        return;
      }
      if (command === "theme.select") {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) openPalette("themes");
        return;
      }
      if (command === "appearance.cycle") {
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        const nextMode =
          appearanceMode === "system" ? "light" : appearanceMode === "light" ? "dark" : "system";
        if (!setAppearanceMode(nextMode)) {
          notifyThemeSaveFailure();
          return;
        }
        toastManager.add({
          id: "appearance-cycle",
          title: `Appearance: ${APPEARANCE_OPTIONS.find((option) => option.mode === nextMode)?.label}`,
          timeout: 1500,
        });
        return;
      }
      if (command === "themeEditor.toggle") {
        event.preventDefault();
        event.stopPropagation();
        toggleThemeEditorForTheme({ theme, themeHalves, initialAppearance: resolvedTheme });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    appearanceMode,
    keybindings,
    open,
    openPalette,
    resolvedTheme,
    setAppearanceMode,
    theme,
    themeHalves,
  ]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      {/* Block background focus calls for the entire time the palette is open. */}
      <div className="contents" inert={open}>
        {children}
      </div>
      <CommandDialogPopup
        aria-label="Command palette"
        className="overflow-hidden"
        data-command-palette="true"
        data-testid="command-palette"
        onBackdropPointerDown={() => setOpen(false)}
      >
        {open ? (
          <OpenCommandPalette initialView={initialView} close={() => setOpen(false)} />
        ) : null}
      </CommandDialogPopup>
    </CommandDialog>
  );
}

function useThemeItems(): {
  readonly theme: CommandPaletteSubmenuItem;
  readonly appearance: CommandPaletteSubmenuItem;
  readonly editor: CommandPaletteActionItem;
} {
  const {
    theme,
    themeHalves,
    resolvedTheme,
    appearanceMode,
    setAppearanceMode,
    setTheme,
    setThemeHalf,
  } = useTheme();
  const customThemes = useCustomThemes();
  const environmentThemes = useEnvironmentThemeDefinitions();
  const themeCards = useMemo(() => {
    const seen = new Set<string>();
    return [
      ...STANDARD_THEME_CARDS.map((card) => ({ ...card, id: null })),
      ...[...BUILT_IN_THEMES, ...customThemes, ...environmentThemes]
        .filter((definition) => {
          if (seen.has(definition.id)) return false;
          seen.add(definition.id);
          return true;
        })
        .map(getThemeCardDefinition),
    ];
  }, [customThemes, environmentThemes]);
  const currentThemeId = themeHalves?.[resolvedTheme] ?? getThemeDefinition(theme)?.id ?? null;

  return {
    theme: {
      kind: "submenu",
      value: "action:change-theme",
      searchTerms: ["Change theme", "appearance colors palette"],
      title: "Change theme",
      icon: <PaletteIcon className={ITEM_ICON_CLASS} />,
      shortcutCommand: "theme.select",
      groups: [
        {
          value: "themes",
          label: "Change theme",
          items: themeCards.map(({ id, label, previews }) => ({
            kind: "action",
            value: id === null ? "theme:standard" : `theme:palette:${id}`,
            title: label,
            ...(previews.length === 1 ? { description: `For ${previews[0]!.mode} mode` } : {}),
            searchTerms: [label, "theme"],
            icon: <PaletteIcon className={ITEM_ICON_CLASS} />,
            titleTrailingContent: (
              <span className="flex shrink-0 items-center gap-2">
                {currentThemeId === id ? (
                  <span className="text-xs text-muted-foreground/70">Current</span>
                ) : null}
                <span className="flex items-center gap-1" aria-hidden>
                  {previews.map((preview) => (
                    <ThemePreviewCircle
                      key={preview.mode}
                      colors={preview.colors}
                      mode={preview.mode}
                      className="size-3 border-0"
                    />
                  ))}
                </span>
              </span>
            ),
            run: () => {
              const saved =
                previews.length === 1 && id !== null
                  ? setThemeHalf(previews[0]!.mode, id)
                  : setTheme(id ?? appearanceMode);
              if (!saved) notifyThemeSaveFailure();
            },
          })),
        },
      ],
    },
    appearance: {
      kind: "submenu",
      value: "action:change-appearance",
      searchTerms: ["Change appearance", "light dark system mode"],
      title: "Change appearance",
      icon: <MonitorIcon className={ITEM_ICON_CLASS} />,
      shortcutCommand: "appearance.cycle",
      groups: [
        {
          value: "appearance",
          label: "Change appearance",
          items: APPEARANCE_OPTIONS.map(({ mode, label, icon: Icon }) => ({
            kind: "action",
            value: `appearance:${mode}`,
            title: label,
            searchTerms: [label],
            icon: <Icon className={ITEM_ICON_CLASS} />,
            ...(appearanceMode === mode
              ? {
                  titleTrailingContent: (
                    <span className="text-xs text-muted-foreground/70">Current</span>
                  ),
                }
              : {}),
            run: () => {
              if (!setAppearanceMode(mode)) notifyThemeSaveFailure();
            },
          })),
        },
      ],
    },
    editor: {
      kind: "action",
      value: "action:theme-editor",
      searchTerms: ["Toggle theme editor", "customize colors palette"],
      title: "Toggle theme editor",
      icon: <PaletteIcon className={ITEM_ICON_CLASS} />,
      shortcutCommand: "themeEditor.toggle",
      run: () =>
        toggleThemeEditorForTheme({ theme, themeHalves, initialAppearance: resolvedTheme }),
    },
  };
}

function OpenCommandPalette({ initialView, close }: { initialView: OpenView; close: () => void }) {
  const navigate = useNavigate();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const timestampFormat = useClientSettings((settings) => settings.timestampFormat);
  const environmentId = useActiveEnvironmentId();
  const { notes } = useNotes(environmentId);
  const { threads } = useAgentThreads(environmentId);
  const createNote = useCreateNote();
  const toggleAgent = useAgentPanelStore((state) => state.toggle);
  const startNewChat = useAgentPanelStore((state) => state.startNewChat);
  const openThread = useAgentPanelStore((state) => state.openThread);
  const themeItems = useThemeItems();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [submenu, setSubmenu] = useState<CommandPaletteSubmenuItem | null>(
    initialView === "themes" ? themeItems.theme : null,
  );
  const [highlightedItemValue, setHighlightedItemValue] = useState<string | null>(null);

  const rootGroups = useMemo((): CommandPaletteGroup[] => {
    const actions: CommandPaletteActionItem[] = [
      {
        kind: "action",
        value: "action:new-note",
        searchTerms: ["New note", "create write"],
        title: "New note",
        icon: <PlusIcon className={ITEM_ICON_CLASS} />,
        shortcutCommand: "notes.new",
        disabled: environmentId === null,
        run: () => createNote(),
      },
      {
        kind: "action",
        value: "action:new-chat",
        searchTerms: ["New agent chat", "ask assistant"],
        title: "New agent chat",
        icon: <MessageSquarePlusIcon className={ITEM_ICON_CLASS} />,
        shortcutCommand: "agent.new",
        run: startNewChat,
      },
      {
        kind: "action",
        value: "action:toggle-agent",
        searchTerms: ["Toggle agent panel", "assistant chat"],
        title: "Toggle agent panel",
        icon: <SparklesIcon className={ITEM_ICON_CLASS} />,
        shortcutCommand: "agent.toggle",
        run: toggleAgent,
      },
      {
        kind: "action",
        value: "action:go-notes",
        searchTerms: ["Go to Notes"],
        title: "Go to Notes",
        icon: <NotebookPenIcon className={ITEM_ICON_CLASS} />,
        run: () => navigate({ to: "/notes" }),
      },
    ];
    return [
      {
        value: "actions",
        label: "Actions",
        items: [...actions, themeItems.theme, themeItems.appearance, themeItems.editor],
      },
      {
        value: "chats",
        label: "Agent chats",
        items: threads.map((thread) => ({
          kind: "action",
          value: `chat:${thread.threadId}`,
          searchTerms: [thread.title, thread.preview],
          title: thread.title,
          timestamp: formatShortTimestamp(thread.updatedAt, timestampFormat),
          icon: <MessageSquareIcon className={ITEM_ICON_CLASS} />,
          run: () => openThread(thread.threadId),
        })),
        searchOnly: true,
      },
      {
        value: "notes",
        label: "Notes",
        items: notes.map((note) => ({
          kind: "action",
          value: `note:${note.noteId}`,
          searchTerms: [note.title, note.body.slice(0, 500)],
          title: note.title,
          timestamp: formatShortTimestamp(note.updatedAt, timestampFormat),
          icon: <NotebookPenIcon className={ITEM_ICON_CLASS} />,
          run: () => navigate({ to: "/notes/$noteId", params: { noteId: note.noteId } }),
        })),
        searchOnly: true,
      },
      {
        value: "settings",
        label: "Settings",
        items: SETTINGS_SECTIONS.map((section) => ({
          kind: "action",
          value: `settings:${section.to}`,
          searchTerms: [section.label, "settings"],
          title: section.label,
          description: "Settings",
          icon: <section.icon className={ITEM_ICON_CLASS} />,
          run: () => navigate({ to: section.to }),
        })),
        searchOnly: true,
      },
    ];
  }, [
    createNote,
    environmentId,
    navigate,
    notes,
    openThread,
    startNewChat,
    themeItems,
    threads,
    timestampFormat,
    toggleAgent,
  ]);

  const groups = filterCommandPaletteGroups(submenu?.groups ?? rootGroups, deferredQuery);

  const executeItem = (item: CommandPaletteActionItem | CommandPaletteSubmenuItem) => {
    if (item.disabled) return;
    if (item.kind === "submenu") {
      setSubmenu(item);
      setQuery("");
      setHighlightedItemValue(null);
      return;
    }
    close();
    void Promise.resolve(item.run()).catch((error: unknown) => {
      toastManager.add({
        type: "error",
        title: "Unable to run command",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && query === "" && submenu !== null) {
      event.preventDefault();
      setSubmenu(null);
    }
  };

  return (
    <CommandPaletteContent
      key={submenu?.value ?? "root"}
      aria-label="Command palette"
      autoHighlight="always"
      footerActionLabel="Run"
      inputProps={{
        placeholder: submenu ? String(submenu.title) : "Search notes, chats, and commands",
        ...(submenu
          ? {
              startAddon: (
                <button
                  type="button"
                  className="flex cursor-pointer items-center"
                  aria-label="Back"
                  onClick={() => setSubmenu(null)}
                >
                  <ArrowLeftIcon />
                </button>
              ),
            }
          : {}),
        onKeyDown: handleKeyDown,
      }}
      mode="none"
      onItemHighlighted={(value) =>
        setHighlightedItemValue(typeof value === "string" ? value : null)
      }
      onValueChange={(value) => {
        setHighlightedItemValue(null);
        setQuery(value);
      }}
      showBackHint={submenu !== null}
      value={query}
    >
      <CommandPaletteResults
        groups={groups}
        highlightedItemValue={highlightedItemValue}
        keybindings={keybindings}
        onExecuteItem={executeItem}
      />
    </CommandPaletteContent>
  );
}
