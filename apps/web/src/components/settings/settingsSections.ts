import {
  ActivityIcon,
  BotIcon,
  KeyboardIcon,
  Link2Icon,
  PaletteIcon,
  ScaleIcon,
  Settings2Icon,
  type LucideIcon,
} from "lucide-react";

export type SettingsPath =
  | "/settings/general"
  | "/settings/appearance"
  | "/settings/keybindings"
  | "/settings/providers"
  | "/settings/connections"
  | "/settings/diagnostics"
  | "/settings/open-source-licenses";

/** Settings pages, in navigation order. Providers read as "Agents" to users. */
export const SETTINGS_SECTIONS: ReadonlyArray<{
  readonly to: SettingsPath;
  readonly label: string;
  readonly icon: LucideIcon;
}> = [
  { to: "/settings/general", label: "General", icon: Settings2Icon },
  { to: "/settings/appearance", label: "Appearance", icon: PaletteIcon },
  { to: "/settings/keybindings", label: "Keybindings", icon: KeyboardIcon },
  { to: "/settings/providers", label: "Agents", icon: BotIcon },
  { to: "/settings/connections", label: "Connections", icon: Link2Icon },
  { to: "/settings/diagnostics", label: "Diagnostics", icon: ActivityIcon },
  { to: "/settings/open-source-licenses", label: "Open source licenses", icon: ScaleIcon },
];

export function settingsSectionLabel(pathname: string): string | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return SETTINGS_SECTIONS.find((section) => section.to === normalized)?.label ?? null;
}
