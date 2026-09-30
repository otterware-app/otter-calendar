import type { Icon } from "@tabler/icons-react-native/types";
/*
 * Keep these as per-icon exports. Importing the package root eagerly registers
 * the entire Tabler icon set in Metro.
 */
import IconAlertCircle from "@tabler/icons-react-native/IconAlertCircle";
import IconAlertTriangle from "@tabler/icons-react-native/IconAlertTriangle";
import IconAlignLeft from "@tabler/icons-react-native/IconAlignLeft";
import IconArrowLeft from "@tabler/icons-react-native/IconArrowLeft";
import IconArrowUp from "@tabler/icons-react-native/IconArrowUp";
import IconArrowUpCircle from "@tabler/icons-react-native/IconArrowUpCircle";
import IconArrowUpRight from "@tabler/icons-react-native/IconArrowUpRight";
import IconBolt from "@tabler/icons-react-native/IconBolt";
import IconCalendar from "@tabler/icons-react-native/IconCalendar";
import IconCalendarEvent from "@tabler/icons-react-native/IconCalendarEvent";
import IconCamera from "@tabler/icons-react-native/IconCamera";
import IconCheck from "@tabler/icons-react-native/IconCheck";
import IconCloud from "@tabler/icons-react-native/IconCloud";
import IconChevronDown from "@tabler/icons-react-native/IconChevronDown";
import IconChevronLeft from "@tabler/icons-react-native/IconChevronLeft";
import IconChevronRight from "@tabler/icons-react-native/IconChevronRight";
import IconCircle from "@tabler/icons-react-native/IconCircle";
import IconCircleCheck from "@tabler/icons-react-native/IconCircleCheck";
import IconCircleX from "@tabler/icons-react-native/IconCircleX";
import IconClock from "@tabler/icons-react-native/IconClock";
import IconCopy from "@tabler/icons-react-native/IconCopy";
import IconDatabase from "@tabler/icons-react-native/IconDatabase";
import IconDeviceDesktop from "@tabler/icons-react-native/IconDeviceDesktop";
import IconDeviceLaptop from "@tabler/icons-react-native/IconDeviceLaptop";
import IconDots from "@tabler/icons-react-native/IconDots";
import IconDotsVertical from "@tabler/icons-react-native/IconDotsVertical";
import IconEdit from "@tabler/icons-react-native/IconEdit";
import IconExternalLink from "@tabler/icons-react-native/IconExternalLink";
import IconFileText from "@tabler/icons-react-native/IconFileText";
import IconHammer from "@tabler/icons-react-native/IconHammer";
import IconHelpCircle from "@tabler/icons-react-native/IconHelpCircle";
import IconInfoCircle from "@tabler/icons-react-native/IconInfoCircle";
import IconLink from "@tabler/icons-react-native/IconLink";
import IconMapPin from "@tabler/icons-react-native/IconMapPin";
import IconMoon from "@tabler/icons-react-native/IconMoon";
import IconNetwork from "@tabler/icons-react-native/IconNetwork";
import IconPalette from "@tabler/icons-react-native/IconPalette";
import IconPencil from "@tabler/icons-react-native/IconPencil";
import IconPhoto from "@tabler/icons-react-native/IconPhoto";
import IconPin from "@tabler/icons-react-native/IconPin";
import IconPinnedOff from "@tabler/icons-react-native/IconPinnedOff";
import IconPlayerStopFilled from "@tabler/icons-react-native/IconPlayerStopFilled";
import IconPlus from "@tabler/icons-react-native/IconPlus";
import IconQrcode from "@tabler/icons-react-native/IconQrcode";
import IconRefresh from "@tabler/icons-react-native/IconRefresh";
import IconRepeat from "@tabler/icons-react-native/IconRepeat";
import IconSearch from "@tabler/icons-react-native/IconSearch";
import IconServer from "@tabler/icons-react-native/IconServer";
import IconSettings from "@tabler/icons-react-native/IconSettings";
import IconSparkles from "@tabler/icons-react-native/IconSparkles";
import IconStethoscope from "@tabler/icons-react-native/IconStethoscope";
import IconSun from "@tabler/icons-react-native/IconSun";
import IconTerminal2 from "@tabler/icons-react-native/IconTerminal2";
import IconTextDecrease from "@tabler/icons-react-native/IconTextDecrease";
import IconTextIncrease from "@tabler/icons-react-native/IconTextIncrease";
import IconTrash from "@tabler/icons-react-native/IconTrash";
import IconTypography from "@tabler/icons-react-native/IconTypography";
import IconUserCircle from "@tabler/icons-react-native/IconUserCircle";
import IconUsers from "@tabler/icons-react-native/IconUsers";
import IconVideo from "@tabler/icons-react-native/IconVideo";
import IconWifiOff from "@tabler/icons-react-native/IconWifiOff";
import IconWorld from "@tabler/icons-react-native/IconWorld";
import IconX from "@tabler/icons-react-native/IconX";
import type { AndroidSymbol, SFSymbol, SymbolViewProps } from "expo-symbols";
import { withUniwind } from "uniwind";

const ANDROID_ICON_BY_SF_SYMBOL = {
  "arrow.left": IconArrowLeft,
  "arrow.clockwise": IconRefresh,
  "arrow.up": IconArrowUp,
  "arrow.up.circle": IconArrowUpCircle,
  "arrow.up.right": IconArrowUpRight,
  "bolt.horizontal.circle": IconBolt,
  calendar: IconCalendar,
  "calendar.day.timeline.left": IconCalendarEvent,
  camera: IconCamera,
  checkmark: IconCheck,
  "checkmark.circle": IconCircleCheck,
  circle: IconCircle,
  cloud: IconCloud,
  "chevron.down": IconChevronDown,
  "chevron.left": IconChevronLeft,
  "chevron.right": IconChevronRight,
  clock: IconClock,
  desktopcomputer: IconDeviceDesktop,
  "doc.on.doc": IconCopy,
  "doc.text": IconFileText,
  ellipsis: IconDots,
  moon: IconMoon,
  "exclamationmark.triangle": IconAlertTriangle,
  "exclamationmark.circle": IconAlertCircle,
  gearshape: IconSettings,
  globe: IconWorld,
  hammer: IconHammer,
  "info.circle": IconInfoCircle,
  internaldrive: IconDatabase,
  laptopcomputer: IconDeviceLaptop,
  link: IconLink,
  "mappin.and.ellipse": IconMapPin,
  // Tabler has no Apple desktops; the closest silhouettes stand in on Android.
  macmini: IconServer,
  macstudio: IconDeviceDesktop,
  magnifyingglass: IconSearch,
  paintbrush: IconPalette,
  pencil: IconPencil,
  "person.crop.circle": IconUserCircle,
  "person.2": IconUsers,
  photo: IconPhoto,
  pin: IconPin,
  "pin.slash": IconPinnedOff,
  plus: IconPlus,
  "qrcode.viewfinder": IconQrcode,
  "questionmark.circle": IconHelpCircle,
  repeat: IconRepeat,
  "point.3.connected.trianglepath.dotted": IconNetwork,
  safari: IconExternalLink,
  "server.rack": IconServer,
  stethoscope: IconStethoscope,
  sparkles: IconSparkles,
  "square.and.pencil": IconEdit,
  "sun.max": IconSun,
  "stop.fill": IconPlayerStopFilled,
  terminal: IconTerminal2,
  "text.alignleft": IconAlignLeft,
  "textformat.size": IconTypography,
  "textformat.size.larger": IconTextIncrease,
  "textformat.size.smaller": IconTextDecrease,
  trash: IconTrash,
  video: IconVideo,
  "wifi.slash": IconWifiOff,
  xmark: IconX,
  "xmark.circle": IconCircleX,
} satisfies Partial<Record<SFSymbol, Icon>>;
const SF_ICON_LOOKUP: Partial<Record<SFSymbol, Icon>> = ANDROID_ICON_BY_SF_SYMBOL;

// Callers can pass `{ ios, android }` names where `android` is a Material
// icon name (the raw expo-symbols contract). Resolve those here too so the
// android key keeps working through this wrapper — it wins over the SF map
// when both match (e.g. folder vs folder_open for expanded project groups).
const ANDROID_ICON_BY_MATERIAL_NAME = {
  check: IconCheck,
  content_copy: IconCopy,
  more_vert: IconDotsVertical,
} satisfies Partial<Record<AndroidSymbol, Icon>>;

export type { SFSymbol } from "expo-symbols";
export type AppSymbolName =
  | keyof typeof ANDROID_ICON_BY_SF_SYMBOL
  | {
      ios: SFSymbol;
      android: keyof typeof ANDROID_ICON_BY_MATERIAL_NAME;
    };

export type AppSymbolViewProps = Omit<SymbolViewProps, "name"> & { name: AppSymbolName };

export function isAppSymbolName(name: string): name is Extract<AppSymbolName, string> {
  return Object.prototype.hasOwnProperty.call(ANDROID_ICON_BY_SF_SYMBOL, name);
}

function AppSymbolView(props: AppSymbolViewProps) {
  const materialName = typeof props.name === "string" ? undefined : props.name.android;
  const sfSymbol = typeof props.name === "string" ? props.name : props.name.ios;
  const AndroidIcon =
    (materialName ? ANDROID_ICON_BY_MATERIAL_NAME[materialName] : undefined) ??
    (sfSymbol ? SF_ICON_LOOKUP[sfSymbol] : undefined);

  if (!AndroidIcon) {
    return props.fallback ?? null;
  }

  return (
    <AndroidIcon
      accessibilityLabel={props.accessibilityLabel}
      color={props.tintColor}
      size={props.size}
      strokeWidth={2}
      style={props.style}
      testID={props.testID}
    />
  );
}

/**
 * expo-symbols and the Android Tabler fallback both expose tint as a native
 * prop rather than a React Native style. Keep that third-party boundary here
 * so callers can use Uniwind's `tintColorClassName` instead of subscribing to
 * theme variables in every parent component.
 */
export const SymbolView = withUniwind(AppSymbolView);
