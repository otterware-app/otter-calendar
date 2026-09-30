import { BRAND } from "@t3tools/shared/brand";
import Constants from "expo-constants";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { Platform, View } from "react-native";

import { AppText as Text } from "./AppText";
import { resolveMobileStageLabel } from "../lib/mobileBranding";
import { useAndroidControlSizing } from "./useAndroidControlSizing";

const [BRAND_LEAD, ...BRAND_REST] = BRAND.displayName.split(" ");

/**
 * Compact brand lockup sized for native navigation bars: the first word of the app's name,
 * the rest muted, then the build stage.
 */
export function CompactBrandTitle(
  props: {
    readonly allowFontScaling?: boolean;
  } = {},
) {
  const stageLabel = resolveMobileStageLabel(Constants.expoConfig?.extra?.appVariant);
  const { scale } = useAndroidControlSizing();

  return (
    <View
      aria-level={1}
      accessibilityLabel={BRAND.displayName}
      accessible
      role="heading"
      className="flex-row items-center gap-1.5"
      style={Platform.OS === "android" ? { gap: 5.25 * scale } : undefined}
    >
      <Text
        allowFontScaling={props.allowFontScaling}
        className="font-t3-medium text-foreground"
        style={{ fontSize: 21 * scale, letterSpacing: -0.5 * scale }}
      >
        {BRAND_LEAD}
      </Text>
      <Text
        allowFontScaling={props.allowFontScaling}
        className="font-t3-medium text-foreground-muted"
        style={{ fontSize: 21 * scale, letterSpacing: -0.5 * scale }}
      >
        {BRAND_REST.join(" ")}
      </Text>
      <View
        className="rounded-full bg-subtle px-1.5 py-0.5"
        style={
          Platform.OS === "android"
            ? { paddingHorizontal: 5.25 * scale, paddingVertical: 1.75 * scale }
            : undefined
        }
      >
        <Text
          allowFontScaling={props.allowFontScaling}
          className="font-t3-bold text-foreground-muted uppercase"
          style={{ fontSize: 9 * scale, letterSpacing: 0.9 * scale }}
        >
          {stageLabel}
        </Text>
      </View>
    </View>
  );
}

export function renderCompactBrandTitle() {
  return <CompactBrandTitle allowFontScaling={Platform.OS === "ios"} />;
}

export function getCompactBrandHeaderOptions(
  fallbackTitleStyle?: NativeStackNavigationOptions["headerTitleStyle"],
): NativeStackNavigationOptions {
  return {
    headerTitle: renderCompactBrandTitle,
    headerTitleStyle: fallbackTitleStyle,
    title: BRAND.displayName,
    unstable_headerLeftItems: undefined,
  };
}
