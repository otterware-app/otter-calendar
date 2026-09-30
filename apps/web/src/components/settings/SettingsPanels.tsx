import { useAtomValue } from "@effect/atom-react";
import {
  type BackgroundActivityProfile,
  type DesktopUpdateChannel,
  type ServerSettingsPatch,
} from "@t3tools/contracts";
import {
  DEFAULT_CLIENT_SETTINGS,
  DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE,
  DEFAULT_SERVER_SETTINGS,
  type EnvironmentIdentificationMode,
  MAX_APPEARANCE_CONTRAST,
  MAX_CODE_FONT_SIZE,
  MAX_GLASS_OPACITY,
  MAX_INTERFACE_FONT_SIZE,
  MAX_PANEL_ANIMATION_DURATION_MS,
  MAX_PROMPT_FONT_SIZE,
  MIN_APPEARANCE_CONTRAST,
  MIN_CODE_FONT_SIZE,
  MIN_GLASS_OPACITY,
  MIN_INTERFACE_FONT_SIZE,
  MIN_PANEL_ANIMATION_DURATION_MS,
  MIN_PROMPT_FONT_SIZE,
  type QuitConfirmationMode,
} from "@t3tools/contracts/settings";
import { resolveServerBackgroundActivitySettings } from "@t3tools/shared/backgroundActivitySettings";
import { BRAND } from "@t3tools/shared/brand";
import { Link } from "@tanstack/react-router";
import * as Equal from "effect/Equal";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DEFAULT_CODE_FONT_STACK,
  DEFAULT_SANS_FONT_STACK,
  isFontFamilyAvailable,
  isMonospaceFamily,
  resolveDefaultFamilyLabel,
} from "../../appearanceFonts";
import { APP_VERSION, HOSTED_APP_CHANNEL, HOSTED_APP_CHANNEL_LABEL } from "../../branding";
import {
  canCheckForUpdate,
  getDesktopUpdateButtonTooltip,
  getDesktopUpdateInstallConfirmationMessage,
  isDesktopUpdateButtonDisabled,
  resolveDesktopUpdateButtonAction,
} from "../desktopUpdate.logic";
import { isElectron } from "../../env";
import { buildHostedChannelSelectionUrl, type HostedAppChannel } from "../../hostedPairing";
import { useCustomThemes } from "../../hooks/useCustomThemes";
import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import { useTheme } from "../../hooks/useTheme";
import { toastCommandFailure } from "../../lib/commandFailureToast";
import { isMacPlatform } from "../../lib/utils";
import { ensureLocalApi } from "../../localApi";
import { useActiveEnvironmentId } from "../../state/activeEnvironment";
import { useDesktopUpdateState } from "../../state/desktopUpdate";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  resolveEnvironmentIdentificationPillLabel,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { discoverInstalledFonts, FontFamilyPicker, useFontEnumeration } from "./FontFamilyPicker";
import { PanelAnimationsPreview } from "./PanelAnimationsPreview";
import { CodeFontPreview, PromptFontPreview } from "./SettingsFontPreviews";
import {
  PolicyTooltip,
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { ThemeLibrary } from "./ThemeSettings";

const ENVIRONMENT_IDENTIFICATION_LABELS: Record<EnvironmentIdentificationMode, string> = {
  artwork: "Artwork",
  pill: "Version pill",
  none: "None",
};

const TIMESTAMP_FORMAT_LABELS = {
  locale: "System default",
  "12-hour": "12-hour",
  "24-hour": "24-hour",
} as const;

const QUIT_CONFIRMATION_MODE_LABELS: Record<QuitConfirmationMode, string> = {
  direct: "Direct",
  hold: "Hold",
  "double-click": "Double press",
};

const BACKGROUND_ACTIVITY_PROFILE_LABELS: Record<BackgroundActivityProfile, string> = {
  balanced: "Balanced",
  performance: "Performance",
  "battery-saver": "Battery saver",
};

const BACKGROUND_ACTIVITY_PROFILE_DESCRIPTIONS: Record<BackgroundActivityProfile, string> = {
  balanced: "Pauses probes for idle clients, locked hosts, or low power mode.",
  performance: "Allows scoped background probes while any subscribed client remains connected.",
  "battery-saver": "Also pauses background probes when the host or client is on battery.",
};

/** Slider fill for the settings range inputs. */
function sliderStyle(value: number, min: number, max: number): CSSProperties {
  const ratio = (value - min) / (max - min);
  return {
    "--settings-slider-progress": `${ratio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - ratio}rem`,
  } as CSSProperties;
}

function SettingsSlider({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex w-full items-center gap-3 sm:w-52">
      <output
        className="min-w-14 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
        htmlFor={id}
      >
        {value}
        {unit}
      </output>
      <input
        aria-label={label}
        className="settings-slider min-w-0 flex-1"
        id={id}
        max={max}
        min={min}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (Number.isInteger(next) && next >= min && next <= max) onChange(next);
        }}
        step={step}
        style={sliderStyle(value, min, max)}
        type="range"
        value={value}
      />
    </div>
  );
}

function AboutVersionTitle() {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span>Version</span>
      <code className="text-2xs font-medium text-muted-foreground">{APP_VERSION}</code>
    </span>
  );
}

function AboutVersionSection() {
  const updateState = useDesktopUpdateState();
  const [isChangingUpdateChannel, setIsChangingUpdateChannel] = useState(false);
  const [isUpdateActionPending, setIsUpdateActionPending] = useState(false);

  const hasDesktopBridge = typeof window !== "undefined" && Boolean(window.desktopBridge);
  const selectedUpdateChannel = updateState?.channel ?? "latest";
  const selectedHostedAppChannel = hasDesktopBridge ? null : HOSTED_APP_CHANNEL;

  const handleUpdateChannelChange = useCallback(
    (channel: DesktopUpdateChannel) => {
      const bridge = window.desktopBridge;
      if (
        !bridge ||
        typeof bridge.setUpdateChannel !== "function" ||
        channel === selectedUpdateChannel
      ) {
        return;
      }

      setIsChangingUpdateChannel(true);
      void bridge
        .setUpdateChannel(channel)
        .catch((error: unknown) => {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not change update track",
              description: error instanceof Error ? error.message : "Update track change failed.",
            }),
          );
        })
        .finally(() => {
          setIsChangingUpdateChannel(false);
        });
    },
    [selectedUpdateChannel],
  );

  const handleButtonClick = useCallback(async () => {
    const bridge = window.desktopBridge;
    if (!bridge) return;

    const action = updateState ? resolveDesktopUpdateButtonAction(updateState) : "none";

    if (action === "download") {
      void bridge.downloadUpdate().catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not download update",
            description: error instanceof Error ? error.message : "Download failed.",
          }),
        );
      });
      return;
    }

    if (action === "install") {
      if (isUpdateActionPending) return;
      setIsUpdateActionPending(true);
      let confirmed = false;
      try {
        confirmed = await ensureLocalApi().dialogs.confirm(
          getDesktopUpdateInstallConfirmationMessage(
            updateState ?? { availableVersion: null, downloadedVersion: null },
          ),
        );
      } catch (error) {
        setIsUpdateActionPending(false);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not confirm update",
            description: error instanceof Error ? error.message : "Update confirmation failed.",
          }),
        );
        return;
      }
      if (!confirmed) {
        setIsUpdateActionPending(false);
        return;
      }
      void bridge
        .installUpdate()
        .catch((error: unknown) => {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not install update",
              description: error instanceof Error ? error.message : "Install failed.",
            }),
          );
        })
        .finally(() => setIsUpdateActionPending(false));
      return;
    }

    if (typeof bridge.checkForUpdate !== "function") return;
    void bridge
      .checkForUpdate()
      .then((result) => {
        if (!result.checked) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not check for updates",
              description:
                result.state.message ?? "Automatic updates are not available in this build.",
            }),
          );
        }
      })
      .catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not check for updates",
            description: error instanceof Error ? error.message : "Update check failed.",
          }),
        );
      });
  }, [isUpdateActionPending, updateState]);

  const action = updateState ? resolveDesktopUpdateButtonAction(updateState) : "none";
  const buttonTooltip = updateState ? getDesktopUpdateButtonTooltip(updateState) : null;
  const buttonDisabled =
    action === "none"
      ? !canCheckForUpdate(updateState)
      : isDesktopUpdateButtonDisabled(updateState);

  const actionLabel: Record<string, string> = { download: "Download", install: "Install" };
  const statusLabel: Record<string, string> = {
    checking: "Checking…",
    downloading: "Downloading…",
    "up-to-date": "Up to Date",
  };
  const buttonLabel =
    actionLabel[action] ?? statusLabel[updateState?.status ?? ""] ?? "Check for Updates";
  const description =
    action === "download" || action === "install"
      ? "Update available."
      : "Current version of the application.";

  return (
    <>
      <SettingsRow
        title={<AboutVersionTitle />}
        description={description}
        control={
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  variant="outline"
                  disabled={buttonDisabled || isUpdateActionPending}
                  onClick={handleButtonClick}
                >
                  {buttonLabel}
                </Button>
              }
            />
            {buttonTooltip ? <TooltipPopup>{buttonTooltip}</TooltipPopup> : null}
          </Tooltip>
        }
      />
      {hasDesktopBridge ? (
        <SettingsRow
          title="Update track"
          description="Use stable releases or nightly builds. Switch back anytime."
          control={
            <Select
              value={selectedUpdateChannel}
              onValueChange={(value) => {
                handleUpdateChannelChange(value as DesktopUpdateChannel);
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full sm:w-40"
                aria-label="Update track"
                disabled={isChangingUpdateChannel}
              >
                <SelectValue>
                  {selectedUpdateChannel === "nightly" ? "Nightly" : "Stable"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="latest">
                  Stable
                </SelectItem>
                <SelectItem hideIndicator value="nightly">
                  Nightly
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
      ) : selectedHostedAppChannel ? (
        <SettingsRow
          title="Update track"
          description="Switches the hosted app release channel."
          control={
            <Select
              value={selectedHostedAppChannel}
              onValueChange={(value) => {
                if (value === selectedHostedAppChannel) return;
                window.location.assign(
                  buildHostedChannelSelectionUrl({ channel: value as HostedAppChannel }),
                );
              }}
            >
              <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="Update track">
                <SelectValue>{HOSTED_APP_CHANNEL_LABEL}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="latest">
                  Latest
                </SelectItem>
                <SelectItem hideIndicator value="nightly">
                  Nightly
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
      ) : null}
    </>
  );
}

/** Client settings that differ from their defaults, and a way to put them all back. */
export function useSettingsRestore(onRestored?: () => void) {
  const { theme, setTheme, followSystem, setFollowSystem, clearThemeHalves, themeHalves } =
    useTheme();
  const settings = useClientSettings();
  const updateSettings = useUpdateClientSettings();
  const changedSettingLabels = useMemo(() => {
    const labels: string[] = [];
    if (theme !== "system") labels.push("Theme");
    if (!followSystem) labels.push("Follow system");
    if (themeHalves !== null) labels.push("Theme mix");
    const defaults = DEFAULT_CLIENT_SETTINGS;
    const named: ReadonlyArray<readonly [keyof typeof defaults, string]> = [
      ["appearanceContrast", "Contrast"],
      ["glassOpacity", "Glass opacity"],
      ["panelAnimationDurationMs", "Panel animations"],
      ["environmentIdentificationMode", "Environment identification"],
      ["timestampFormat", "Time format"],
      ["sendShortcut", "Send shortcut"],
      ["confirmQuit", "Quit confirmation"],
      ["confirmThreadDelete", "Chat delete confirmation"],
      ["fontFamilySans", "Interface font"],
      ["fontSizeInterface", "Interface font size"],
      ["fontFamilyComposer", "Prompt font"],
      ["fontSizePrompt", "Prompt font size"],
      ["fontFamilyCode", "Code font"],
      ["fontSizeCode", "Code font size"],
      ["fontSmoothing", "Font smoothing"],
    ];
    for (const [key, label] of named) {
      if (!Equal.equals(settings[key], defaults[key])) labels.push(label);
    }
    return labels;
  }, [followSystem, settings, theme, themeHalves]);

  const restoreDefaults = useCallback(async () => {
    if (changedSettingLabels.length === 0) return;
    const confirmed = await ensureLocalApi().dialogs.confirm(
      ["Restore default settings?", `This will reset: ${changedSettingLabels.join(", ")}.`].join(
        "\n",
      ),
    );
    if (!confirmed) return;
    setTheme("system");
    setFollowSystem(true);
    clearThemeHalves();
    const {
      favorites: _favorites,
      providerModelPreferences: _preferences,
      ...defaults
    } = DEFAULT_CLIENT_SETTINGS;
    updateSettings(defaults);
    onRestored?.();
  }, [
    changedSettingLabels,
    clearThemeHalves,
    onRestored,
    setFollowSystem,
    setTheme,
    updateSettings,
  ]);

  return { changedSettingLabels, restoreDefaults };
}

export function AppearanceSettingsPanel() {
  const {
    appearanceMode,
    refreshTheme,
    resolvedTheme,
    setAppearanceMode,
    setTheme,
    setThemeHalf,
    theme,
    themeHalves,
  } = useTheme();
  const customThemes = useCustomThemes();
  const [isImportThemeOpen, setIsImportThemeOpen] = useState(false);
  const settings = useClientSettings();
  const updateSettings = useUpdateClientSettings();
  const environmentStageLabel = useEnvironmentStageLabel();
  const showEnvironmentIdentification =
    resolveEnvironmentIdentificationPillLabel(environmentStageLabel) !== null;
  const defaults = DEFAULT_CLIENT_SETTINGS;

  return (
    <SettingsPageContainer>
      <SettingsSection title="Colors & themes" variant="plain" hideTitle>
        <ThemeLibrary
          appearanceMode={appearanceMode}
          customThemes={customThemes}
          initialAppearance={resolvedTheme}
          refreshTheme={refreshTheme}
          isImportOpen={isImportThemeOpen}
          setAppearanceMode={setAppearanceMode}
          setTheme={setTheme}
          setThemeHalf={setThemeHalf}
          theme={theme}
          themeHalves={themeHalves}
          onImportOpenChange={setIsImportThemeOpen}
        />
      </SettingsSection>

      <SettingsSection title="Interface">
        <SettingsRow
          title="Contrast"
          description="Adjust the contrast of colors and borders across the interface."
          resetAction={
            settings.appearanceContrast !== defaults.appearanceContrast ? (
              <SettingResetButton
                label="contrast"
                onClick={() => updateSettings({ appearanceContrast: defaults.appearanceContrast })}
              />
            ) : null
          }
          control={
            <SettingsSlider
              id="appearance-contrast"
              label="Contrast"
              value={settings.appearanceContrast}
              min={MIN_APPEARANCE_CONTRAST}
              max={MAX_APPEARANCE_CONTRAST}
              step={5}
              unit="%"
              onChange={(appearanceContrast) => updateSettings({ appearanceContrast })}
            />
          }
        />
        <SettingsRow
          title="Glass opacity"
          description="Higher values make menus, dialogs, and panels more solid."
          resetAction={
            settings.glassOpacity !== defaults.glassOpacity ? (
              <SettingResetButton
                label="glass opacity"
                onClick={() => updateSettings({ glassOpacity: defaults.glassOpacity })}
              />
            ) : null
          }
          control={
            <SettingsSlider
              id="glass-opacity"
              label="Glass opacity"
              value={settings.glassOpacity}
              min={MIN_GLASS_OPACITY}
              max={MAX_GLASS_OPACITY}
              step={5}
              unit="%"
              onChange={(glassOpacity) => updateSettings({ glassOpacity })}
            />
          }
        />
        {showEnvironmentIdentification ? (
          <SettingsRow
            title="Environment identification"
            description="Choose how Dev and Nightly environments are identified."
            resetAction={
              settings.environmentIdentificationMode !== DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE ? (
                <SettingResetButton
                  label="environment identification"
                  onClick={() =>
                    updateSettings({
                      environmentIdentificationMode: DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE,
                    })
                  }
                />
              ) : null
            }
            control={
              <Select
                value={settings.environmentIdentificationMode}
                onValueChange={(value) => {
                  if (value === "artwork" || value === "pill" || value === "none") {
                    updateSettings({ environmentIdentificationMode: value });
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full sm:w-40"
                  aria-label="Environment identification"
                >
                  <SelectValue>
                    {ENVIRONMENT_IDENTIFICATION_LABELS[settings.environmentIdentificationMode]}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {Object.entries(ENVIRONMENT_IDENTIFICATION_LABELS).map(([value, label]) => (
                    <SelectItem hideIndicator key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            }
          />
        ) : null}
      </SettingsSection>

      <SettingsSection title="Motion">
        <SettingsRow
          title="Panel animations"
          description="Set how fast panels open and close."
          resetAction={
            settings.panelAnimationDurationMs !== defaults.panelAnimationDurationMs ? (
              <SettingResetButton
                label="panel animations"
                onClick={() =>
                  updateSettings({ panelAnimationDurationMs: defaults.panelAnimationDurationMs })
                }
              />
            ) : null
          }
          control={
            <div className="grid w-full grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 sm:w-auto sm:grid-cols-[7rem_13rem] sm:gap-4">
              <PanelAnimationsPreview durationMs={settings.panelAnimationDurationMs} />
              <SettingsSlider
                id="panel-animation-duration"
                label="Panel animation duration"
                value={settings.panelAnimationDurationMs}
                min={MIN_PANEL_ANIMATION_DURATION_MS}
                max={MAX_PANEL_ANIMATION_DURATION_MS}
                step={25}
                unit=" ms"
                onChange={(panelAnimationDurationMs) =>
                  updateSettings({ panelAnimationDurationMs })
                }
              />
            </div>
          }
        />
      </SettingsSection>

      <TypographySection />
    </SettingsPageContainer>
  );
}

function useFontDefaultFamilies() {
  const fontFamilySans = useClientSettings((settings) => settings.fontFamilySans);
  // An unset preference shows the font it resolves to on this machine.
  const defaults = useMemo(
    () => ({
      sans: resolveDefaultFamilyLabel(DEFAULT_SANS_FONT_STACK) ?? "System default",
      code: resolveDefaultFamilyLabel(DEFAULT_CODE_FONT_STACK) ?? "System monospace",
    }),
    [],
  );
  return {
    sans: defaults.sans,
    code: defaults.code,
    // The composer inherits whatever the interface preference resolves to.
    interfaceFamily: fontFamilySans.trim() || defaults.sans,
  };
}

function TypographySection() {
  const settings = useClientSettings();
  const updateSettings = useUpdateClientSettings();
  const fontDefaults = useFontDefaultFamilies();
  const defaults = DEFAULT_CLIENT_SETTINGS;
  return (
    <SettingsSection title="Typography">
      <FontFamilySettingsRow
        title="Interface font"
        description="Everything outside code blocks."
        defaultFamily={fontDefaults.sans}
        defaultValue={defaults.fontFamilySans}
        value={settings.fontFamilySans}
        onValueChange={(fontFamilySans) => updateSettings({ fontFamilySans })}
        onReset={() =>
          updateSettings({
            fontFamilySans: defaults.fontFamilySans,
            fontSizeInterface: defaults.fontSizeInterface,
          })
        }
        size={{
          label: "Interface font size",
          min: MIN_INTERFACE_FONT_SIZE,
          max: MAX_INTERFACE_FONT_SIZE,
          value: settings.fontSizeInterface,
          defaultValue: defaults.fontSizeInterface,
          onChange: (fontSizeInterface) => updateSettings({ fontSizeInterface }),
        }}
      />
      <FontFamilySettingsRow
        title="Prompt font"
        description="The box you write to the agent in."
        defaultFamily={fontDefaults.interfaceFamily}
        defaultValue={defaults.fontFamilyComposer}
        value={settings.fontFamilyComposer}
        onValueChange={(fontFamilyComposer) => updateSettings({ fontFamilyComposer })}
        onReset={() =>
          updateSettings({
            fontFamilyComposer: defaults.fontFamilyComposer,
            fontSizePrompt: defaults.fontSizePrompt,
          })
        }
        size={{
          label: "Prompt font size",
          min: MIN_PROMPT_FONT_SIZE,
          max: MAX_PROMPT_FONT_SIZE,
          value: settings.fontSizePrompt,
          defaultValue: defaults.fontSizePrompt,
          onChange: (fontSizePrompt) => updateSettings({ fontSizePrompt }),
        }}
        preview={<PromptFontPreview />}
      />
      <FontFamilySettingsRow
        title="Code font"
        description="Code blocks and tool output."
        defaultFamily={fontDefaults.code}
        defaultValue={defaults.fontFamilyCode}
        value={settings.fontFamilyCode}
        onValueChange={(fontFamilyCode) => updateSettings({ fontFamilyCode })}
        onReset={() =>
          updateSettings({
            fontFamilyCode: defaults.fontFamilyCode,
            fontSizeCode: defaults.fontSizeCode,
          })
        }
        requireMonospace
        size={{
          label: "Code font size",
          min: MIN_CODE_FONT_SIZE,
          max: MAX_CODE_FONT_SIZE,
          value: settings.fontSizeCode,
          defaultValue: defaults.fontSizeCode,
          onChange: (fontSizeCode) => updateSettings({ fontSizeCode }),
        }}
        preview={<CodeFontPreview />}
      />
      {isMacPlatform(navigator.platform) ? (
        <SettingsRow
          title="Font smoothing"
          description="Use thinner grayscale text smoothing instead of the macOS default."
          resetAction={
            settings.fontSmoothing !== defaults.fontSmoothing ? (
              <SettingResetButton
                label="font smoothing"
                onClick={() => updateSettings({ fontSmoothing: defaults.fontSmoothing })}
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.fontSmoothing}
              onCheckedChange={(checked) => updateSettings({ fontSmoothing: Boolean(checked) })}
              aria-label="Font smoothing"
            />
          }
        />
      ) : null}
    </SettingsSection>
  );
}

function FontFamilySettingsRow({
  title,
  description,
  defaultFamily,
  defaultValue,
  preview,
  value,
  onValueChange,
  onReset,
  requireMonospace = false,
  size,
}: {
  title: string;
  description: string;
  /** What an unset preference renders as, e.g. "Menlo". */
  defaultFamily: string;
  /** The persisted family value supplied by the unified settings defaults. */
  defaultValue: string;
  preview?: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  onReset: () => void;
  requireMonospace?: boolean;
  size: {
    label: string;
    min: number;
    max: number;
    value: number;
    defaultValue: number;
    onChange: (v: number) => void;
  };
}) {
  const trimmed = value.trim();
  // The fallback input edits a draft; the preference only commits once typing
  // pauses and the text probes as an available font (or is an explicit
  // clear), so the current font holds and nothing reflows mid-word.
  const [draft, setDraft] = useState(value);
  const [draftSettled, setDraftSettled] = useState(true);
  const commitTimerRef = useRef<number | null>(null);
  const lastValueRef = useRef(value);
  if (lastValueRef.current !== value) {
    // The committed value changed externally (hydration, reset, picker
    // selection); adopt it and drop any pending commit of a stale draft.
    lastValueRef.current = value;
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    setDraft(value);
    setDraftSettled(true);
  }
  useEffect(
    () => () => {
      if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
    },
    [],
  );
  const acceptsFamily = (candidate: string) =>
    isFontFamilyAvailable(candidate) && (!requireMonospace || isMonospaceFamily(candidate));
  const commitDraft = (next: string) => {
    setDraftSettled(true);
    // A rejected name stays in the field, flagged: the terminal would silently
    // fall back to its default, so the row must not claim it took the value.
    if (next.trim().length === 0 || acceptsFamily(next)) {
      onValueChange(next);
    }
  };
  const flushDraft = () => {
    if (commitTimerRef.current === null) return;
    window.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = null;
    commitDraft(draft);
  };
  const draftTrimmed = draft.trim();
  // Flag an unknown name only once typing pauses, and never for an empty
  // field - that is the starting state, not a rejected entry.
  const draftPending = draftSettled && draftTrimmed.length > 0 && draftTrimmed !== trimmed;
  const resetToDefault = () => {
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    setDraft(defaultValue);
    setDraftSettled(true);
    onReset();
  };
  const resetAction =
    value !== defaultValue || size.value !== size.defaultValue ? (
      <SettingResetButton label={title.toLowerCase()} onClick={resetToDefault} />
    ) : null;
  const fontEnumeration = useFontEnumeration();
  // Everyone starts on the plain input; focusing it is the user gesture that
  // runs font discovery. Where the engine can enumerate, the control then
  // upgrades to the picker - popped open when the swap happens under focus,
  // so the interaction continues without a second click.
  const inputFocusedRef = useRef(false);
  const familyControl =
    fontEnumeration.status === "granted" ? (
      <FontFamilyPicker
        ariaLabel={`${title} family`}
        defaultFamily={defaultFamily}
        selectedFamily={trimmed}
        requireMonospace={requireMonospace}
        initialOpen={inputFocusedRef.current}
        onSelect={onValueChange}
      />
    ) : (
      <Input
        size="sm"
        aria-label={`${title} family`}
        aria-invalid={draftPending || undefined}
        autoCapitalize="off"
        autoComplete="off"
        className="min-w-0 flex-1"
        maxLength={200}
        onFocus={() => {
          inputFocusedRef.current = true;
          discoverInstalledFonts();
        }}
        onBlur={() => {
          inputFocusedRef.current = false;
          flushDraft();
        }}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setDraft(next);
          setDraftSettled(false);
          if (commitTimerRef.current !== null) {
            window.clearTimeout(commitTimerRef.current);
          }
          commitTimerRef.current = window.setTimeout(() => {
            commitTimerRef.current = null;
            commitDraft(next);
          }, 400);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") flushDraft();
          if (event.key === "Escape") {
            // Discard uncommitted typing without closing the settings page,
            // which is what an unhandled Escape does.
            event.preventDefault();
            event.stopPropagation();
            if (commitTimerRef.current !== null) {
              window.clearTimeout(commitTimerRef.current);
              commitTimerRef.current = null;
            }
            setDraft(value);
            setDraftSettled(true);
          }
        }}
        placeholder={defaultFamily}
        spellCheck={false}
        value={draft}
      />
    );
  const control = (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">{familyControl}</div>
      <Select
        value={String(size.value)}
        onValueChange={(next) => {
          if (typeof next !== "string") return;
          const parsed = Number(next);
          if (Number.isInteger(parsed) && parsed >= size.min && parsed <= size.max) {
            size.onChange(parsed);
          }
        }}
      >
        <SelectTrigger size="sm" className="w-22 shrink-0" aria-label={size.label}>
          <SelectValue>{size.value} px</SelectValue>
        </SelectTrigger>
        <SelectPopup align="end" alignItemWithTrigger={false}>
          {Array.from({ length: size.max - size.min + 1 }, (_, index) => size.min + index).map(
            (px) => (
              <SelectItem hideIndicator key={px} value={String(px)}>
                {px} px
              </SelectItem>
            ),
          )}
        </SelectPopup>
      </Select>
    </div>
  );
  return (
    <SettingsRow
      title={title}
      description={description}
      resetAction={resetAction}
      control={control}
    >
      {preview}
    </SettingsRow>
  );
}

/** The active environment's server settings and a patch writer for them. */
function useActiveServerSettings() {
  const environmentId = useActiveEnvironmentId();
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const update = useAtomCommand(serverEnvironment.updateSettings);
  const updateServerSettings = useCallback(
    (patch: ServerSettingsPatch) => {
      if (environmentId === null) return;
      void update({ environmentId, input: { patch } }).then((result) =>
        toastCommandFailure("Could not save the setting", result),
      );
    },
    [environmentId, update],
  );
  return { settings: config?.settings ?? null, updateServerSettings };
}

export function GeneralSettingsPanel() {
  const modifierLabel = isMacPlatform(navigator.platform) ? "⌘" : "Ctrl";
  const sendShortcutLabels = {
    enter: "Enter",
    "mod-enter-multiline": `${modifierLabel} + Enter for multiline prompts`,
    "mod-enter": `${modifierLabel} + Enter always`,
  } as const;
  const settings = useClientSettings();
  const updateSettings = useUpdateClientSettings();
  const defaults = DEFAULT_CLIENT_SETTINGS;
  const { settings: serverSettings, updateServerSettings } = useActiveServerSettings();
  const backgroundProfile = serverSettings
    ? resolveServerBackgroundActivitySettings(serverSettings).profile
    : null;

  return (
    <SettingsPageContainer>
      <SettingsSection title="Behavior">
        <SettingsRow
          title="Send messages with"
          description="How the agent composer sends; the other way inserts a new line."
          resetAction={
            settings.sendShortcut !== defaults.sendShortcut ? (
              <SettingResetButton
                label="send shortcut"
                onClick={() => updateSettings({ sendShortcut: defaults.sendShortcut })}
              />
            ) : null
          }
          control={
            <Select
              value={settings.sendShortcut}
              onValueChange={(value) => {
                if (value === "enter" || value === "mod-enter-multiline" || value === "mod-enter") {
                  updateSettings({ sendShortcut: value });
                }
              }}
            >
              <SelectTrigger size="sm" className="w-full sm:w-64" aria-label="Send shortcut">
                <SelectValue>{sendShortcutLabels[settings.sendShortcut]}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {Object.entries(sendShortcutLabels).map(([value, label]) => (
                  <SelectItem hideIndicator key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          title="Time format"
          description="System default follows your browser or OS clock preference."
          resetAction={
            settings.timestampFormat !== defaults.timestampFormat ? (
              <SettingResetButton
                label="time format"
                onClick={() => updateSettings({ timestampFormat: defaults.timestampFormat })}
              />
            ) : null
          }
          control={
            <Select
              value={settings.timestampFormat}
              onValueChange={(value) => {
                if (value === "locale" || value === "12-hour" || value === "24-hour") {
                  updateSettings({ timestampFormat: value });
                }
              }}
            >
              <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="Timestamp format">
                <SelectValue>{TIMESTAMP_FORMAT_LABELS[settings.timestampFormat]}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {Object.entries(TIMESTAMP_FORMAT_LABELS).map(([value, label]) => (
                  <SelectItem hideIndicator key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          title="Confirm before deleting chats"
          description="Ask before an agent chat is deleted."
          control={
            <Switch
              checked={settings.confirmThreadDelete}
              onCheckedChange={(checked) =>
                updateSettings({ confirmThreadDelete: Boolean(checked) })
              }
              aria-label="Confirm before deleting chats"
            />
          }
        />
        {isElectron ? (
          <SettingsRow
            title="Quit confirmation"
            description="How quitting the desktop app is confirmed."
            resetAction={
              settings.confirmQuit !== defaults.confirmQuit ? (
                <SettingResetButton
                  label="quit confirmation"
                  onClick={() => updateSettings({ confirmQuit: defaults.confirmQuit })}
                />
              ) : null
            }
            control={
              <Select
                value={settings.confirmQuit}
                onValueChange={(value) => {
                  if (value === "direct" || value === "hold" || value === "double-click") {
                    updateSettings({ confirmQuit: value });
                  }
                }}
              >
                <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="Quit confirmation">
                  <SelectValue>{QUIT_CONFIRMATION_MODE_LABELS[settings.confirmQuit]}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {Object.entries(QUIT_CONFIRMATION_MODE_LABELS).map(([value, label]) => (
                    <SelectItem hideIndicator key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            }
          />
        ) : null}
      </SettingsSection>

      {serverSettings ? (
        <SettingsSection title="Environment">
          <SettingsRow
            title="Check provider versions"
            description="Check installed agent CLIs for newer versions."
            resetAction={
              serverSettings.enableProviderUpdateChecks !==
              DEFAULT_SERVER_SETTINGS.enableProviderUpdateChecks ? (
                <SettingResetButton
                  label="provider update checks"
                  onClick={() =>
                    updateServerSettings({
                      enableProviderUpdateChecks:
                        DEFAULT_SERVER_SETTINGS.enableProviderUpdateChecks,
                    })
                  }
                />
              ) : null
            }
            control={
              <Switch
                checked={serverSettings.enableProviderUpdateChecks}
                onCheckedChange={(checked) =>
                  updateServerSettings({ enableProviderUpdateChecks: Boolean(checked) })
                }
                aria-label="Check provider versions"
              />
            }
          />
          <SettingsRow
            title={
              <span className="inline-flex items-center gap-1.5">
                Background activity
                <PolicyTooltip>
                  This shared policy gates background work such as provider health probes after
                  their individual intervals elapse.
                </PolicyTooltip>
              </span>
            }
            description={
              backgroundProfile ? BACKGROUND_ACTIVITY_PROFILE_DESCRIPTIONS[backgroundProfile] : null
            }
            control={
              <Select
                value={backgroundProfile}
                onValueChange={(value) => {
                  if (
                    value === "balanced" ||
                    value === "performance" ||
                    value === "battery-saver"
                  ) {
                    updateServerSettings({
                      backgroundActivity: { schemaVersion: 1, profile: value, overrides: {} },
                    });
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full sm:w-40"
                  aria-label="Background activity profile"
                >
                  <SelectValue>
                    {backgroundProfile ? BACKGROUND_ACTIVITY_PROFILE_LABELS[backgroundProfile] : ""}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {Object.entries(BACKGROUND_ACTIVITY_PROFILE_LABELS).map(([value, label]) => (
                    <SelectItem hideIndicator key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            }
          />
        </SettingsSection>
      ) : null}

      <SettingsSection title="About">
        {isElectron || HOSTED_APP_CHANNEL ? (
          <AboutVersionSection />
        ) : (
          <SettingsRow
            title={<AboutVersionTitle />}
            description="Current version of the application."
          />
        )}
        <SettingsRow
          title="Diagnostics"
          description="Inspect processes and logs on the active environment."
          control={
            <Button render={<Link to="/settings/diagnostics" />} size="sm" variant="outline">
              View diagnostics
            </Button>
          }
        />
        <SettingsRow
          title="Open source licenses"
          description={`Notices for dependencies and assets used by ${BRAND.displayName}.`}
          control={
            <Button
              render={<Link to="/settings/open-source-licenses" />}
              size="sm"
              variant="outline"
            >
              View licenses
            </Button>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
