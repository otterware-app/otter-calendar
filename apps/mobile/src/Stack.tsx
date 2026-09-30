import { StackActions, useNavigation } from "@react-navigation/native";
import {
  createNativeStackNavigator,
  createNativeStackScreen,
  type NativeStackNavigationOptions,
} from "@react-navigation/native-stack";
import { BRAND } from "@t3tools/shared/brand";
import { useEffect, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, StyleSheet } from "react-native";
import { useResolveClassNames } from "uniwind";

import { AppText as Text } from "./components/AppText";
import { getCompactBrandHeaderOptions } from "./components/CompactBrandTitle";
import {
  RenderErrorBoundary,
  RenderFailureView,
  type RenderFailureProps,
} from "./components/RenderErrorBoundary";
import { AgentThreadRouteScreen } from "./features/agent/AgentThreadRouteScreen";
import { AgentThreadsRouteScreen } from "./features/agent/AgentThreadsRouteScreen";
import { ConnectOnboardingRouteScreen } from "./features/cloud/ConnectOnboardingRouteScreen";
import { useConnectOnboardingNavigation } from "./features/cloud/connectOnboardingNavigation";
import { ConnectionsNewRouteScreen } from "./features/connection/ConnectionsNewRouteScreen";
import { SettingsDiagnosticsRouteScreen } from "./features/diagnostics/SettingsDiagnosticsRouteScreen";
import { NoteRouteScreen } from "./features/notes/NoteRouteScreen";
import { NotesRouteScreen } from "./features/notes/NotesRouteScreen";
import { SettingsAboutRouteScreen } from "./features/settings/SettingsAboutRouteScreen";
import { SettingsAppearanceRouteScreen } from "./features/settings/SettingsAppearanceRouteScreen";
import { SettingsAuthRouteScreen } from "./features/settings/SettingsAuthRouteScreen";
import { SettingsClientStorageRouteScreen } from "./features/settings/SettingsClientStorageRouteScreen";
import { SettingsEnvironmentDetailRouteScreen } from "./features/settings/SettingsEnvironmentDetailRouteScreen";
import { SettingsEnvironmentsRouteScreen } from "./features/settings/SettingsEnvironmentsRouteScreen";
import { SettingsLegalRouteScreen } from "./features/settings/SettingsLegalRouteScreen";
import {
  SettingsOpenSourceLicenseRouteScreen,
  SettingsOpenSourceLicensesRouteScreen,
} from "./features/settings/SettingsOpenSourceLicensesRouteScreen";
import { SettingsRouteScreen } from "./features/settings/SettingsRouteScreen";
import {
  SettingsLegalDocumentCloseHeaderButton,
  SettingsLegalDocumentExternalHeaderButton,
} from "./features/settings/components/SettingsLegalDocumentRouteScreen";
import {
  checkForAppUpdateOnLaunch,
  startAppUpdateForegroundRecheck,
} from "./features/updates/app-updates";
import { NATIVE_LIQUID_GLASS_SUPPORTED } from "./native/native-glass";
import { nativeHeaderScrollEdgeEffects } from "./native/StackHeader";
import { FORM_SHEET_PRESENTATION_OPTIONS } from "./native/sheet-surface";

const HEADER_SCROLL_EDGE_EFFECTS = nativeHeaderScrollEdgeEffects(Platform.OS, Platform.Version);

type AppScreenOptions = NativeStackNavigationOptions & {
  readonly unstable_navigationItemStyle?: "editor";
};

// Shared header presets. Screens only override genuinely dynamic values (titles,
// subtitles, toolbar items) via NativeStackScreenOptions.
//
// GLASS: transparent header over the screen's primary scroll view on supported
// iOS versions. Pre-glass iOS gets a solid material so content is laid out below
// the bar instead of underlapping it.
const GLASS_HEADER_OPTIONS: AppScreenOptions = {
  headerBackButtonDisplayMode: "minimal",
  headerBackTitle: "",
  headerLargeTitle: false,
  headerShadowVisible: false,
  headerShown: true,
  headerStyle: NATIVE_LIQUID_GLASS_SUPPORTED ? { backgroundColor: "transparent" } : undefined,
  headerTitleStyle: { fontSize: 18, fontWeight: "800" },
  headerTransparent: NATIVE_LIQUID_GLASS_SUPPORTED,
  scrollEdgeEffects: NATIVE_LIQUID_GLASS_SUPPORTED ? HEADER_SCROLL_EDGE_EFFECTS : undefined,
  unstable_navigationItemStyle: NATIVE_LIQUID_GLASS_SUPPORTED ? "editor" : undefined,
};

// SOLID: opaque header for screens whose content scrolls internally (the chat
// list and the note editor), where there is nothing for glass to sample.
const SOLID_HEADER_OPTIONS: AppScreenOptions = {
  headerBackButtonDisplayMode: "minimal",
  headerBackTitle: "",
  headerLargeTitle: false,
  headerShadowVisible: false,
  headerShown: true,
  headerTitleStyle: { fontSize: 18, fontWeight: "800" },
  headerTransparent: false,
};

// Solid header variant for screens inside sheets (centered title, no editor style).
const SHEET_SOLID_HEADER_OPTIONS: AppScreenOptions = {
  ...SOLID_HEADER_OPTIONS,
  unstable_navigationItemStyle: undefined,
};

const LEGAL_DOCUMENT_HEADER_OPTIONS: AppScreenOptions = {
  ...SHEET_SOLID_HEADER_OPTIONS,
  headerBackVisible: false,
  headerLeft: SettingsLegalDocumentCloseHeaderButton,
  headerRight: () => <SettingsLegalDocumentExternalHeaderButton />,
  presentation: "fullScreenModal",
};

const SettingsContentStack = createNativeStackNavigator({
  initialRouteName: "Settings",
  screenOptions: {
    ...GLASS_HEADER_OPTIONS,
    // Sheets read better with the iOS-default centered title (no editor style).
    unstable_navigationItemStyle: undefined,
  },
  screens: {
    Settings: createNativeStackScreen({
      screen: SettingsRouteScreen,
      linking: "",
      options: { title: "Settings" },
    }),
    SettingsEnvironments: createNativeStackScreen({
      screen: SettingsEnvironmentsRouteScreen,
      linking: "environments",
      options: { title: "Environments" },
    }),
    SettingsEnvironmentDetail: createNativeStackScreen({
      screen: SettingsEnvironmentDetailRouteScreen,
      linking: "environments/:environmentId",
      options: { title: "Environment" },
    }),
    SettingsEnvironmentNew: createNativeStackScreen({
      screen: ConnectionsNewRouteScreen,
      linking: "environment-new",
      options: { title: "Add Environment" },
    }),
    SettingsAbout: createNativeStackScreen({
      screen: SettingsAboutRouteScreen,
      linking: "about",
      options: { title: `About ${BRAND.displayName}` },
    }),
    SettingsAppearance: createNativeStackScreen({
      screen: SettingsAppearanceRouteScreen,
      linking: "appearance",
      options: { title: "Appearance" },
    }),
    SettingsClientStorage: createNativeStackScreen({
      screen: SettingsClientStorageRouteScreen,
      linking: "client-storage",
      options: { title: "Client Storage" },
    }),
    SettingsDiagnostics: createNativeStackScreen({
      screen: SettingsDiagnosticsRouteScreen,
      linking: "diagnostics",
      options: { title: "Diagnostics" },
    }),
    SettingsOpenSourceLicenses: createNativeStackScreen({
      screen: SettingsOpenSourceLicensesRouteScreen,
      linking: "open-source-licenses",
      options: { title: "Open source licenses" },
    }),
    SettingsOpenSourceLicense: createNativeStackScreen({
      screen: SettingsOpenSourceLicenseRouteScreen,
      linking: "open-source-licenses/:entryKey",
      options: { title: "License notice" },
    }),
  },
});

// The outer stack never owns visible chrome. Settings routes render inside a
// nested stack whose native header remains mounted, while Clerk owns auth chrome.
// Keeping bar visibility invariant avoids iOS 26's headerless-to-headered jump.
const SettingsSheetStack = createNativeStackNavigator({
  initialRouteName: "SettingsContent",
  screenOptions: {
    headerShown: false,
  },
  screens: {
    SettingsContent: createNativeStackScreen({
      screen: SettingsContentStack,
      linking: "",
    }),
    SettingsAuth: createNativeStackScreen({
      screen: SettingsAuthRouteScreen,
      linking: "auth",
    }),
  },
});

function RootStackLayout(props: { readonly children: ReactNode }) {
  // Presents the Connect onboarding sheet after an in-session sign-in.
  useConnectOnboardingNavigation();
  useEffect(() => {
    void checkForAppUpdateOnLaunch();
    startAppUpdateForegroundRecheck();
  }, []);
  return <>{props.children}</>;
}

function NotFoundScreen() {
  const navigation = useNavigation();
  const screenBgStyle = StyleSheet.flatten(useResolveClassNames("bg-screen"));
  const primaryBgStyle = StyleSheet.flatten(useResolveClassNames("bg-primary"));

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        paddingHorizontal: 24,
        paddingVertical: 32,
      }}
      style={[{ flex: 1 }, screenBgStyle]}
    >
      <Text className="text-3xl font-t3-bold text-foreground" selectable>
        Route not found
      </Text>
      <Pressable
        style={[{ borderRadius: 999, paddingHorizontal: 20, paddingVertical: 14 }, primaryBgStyle]}
        onPress={() => navigation.dispatch(StackActions.replace("Home"))}
      >
        <Text className="text-base font-t3-bold text-primary-foreground">Return home</Text>
      </Pressable>
    </ScrollView>
  );
}

const RootStackConfig = createNativeStackNavigator({
  initialRouteName: "Home",
  layout: RootStackLayout,
  screenLayout: GuardedScreenLayout,
  screenOptions: {
    headerShown: false,
  },
  screens: {
    Home: createNativeStackScreen({
      screen: NotesRouteScreen,
      linking: "",
      options: {
        ...GLASS_HEADER_OPTIONS,
        headerBackVisible: false,
        ...getCompactBrandHeaderOptions(),
      },
    }),
    Note: createNativeStackScreen({
      screen: NoteRouteScreen,
      linking: "notes/:environmentId/:noteId?",
      options: SOLID_HEADER_OPTIONS,
    }),
    AgentThreads: createNativeStackScreen({
      screen: AgentThreadsRouteScreen,
      linking: "agent",
      options: { ...GLASS_HEADER_OPTIONS, title: "Agent" },
    }),
    AgentThread: createNativeStackScreen({
      screen: AgentThreadRouteScreen,
      linking: "agent/:environmentId/:threadId?",
      options: SOLID_HEADER_OPTIONS,
    }),
    SettingsSheet: createNativeStackScreen({
      screen: SettingsSheetStack,
      linking: "settings",
      options: {
        gestureEnabled: true,
        headerShown: false,
        ...(Platform.OS === "android"
          ? { presentation: "card" as const }
          : {
              ...FORM_SHEET_PRESENTATION_OPTIONS,
              sheetAllowedDetents: [0.92],
              sheetGrabberVisible: true,
            }),
      },
    }),
    SettingsLegal: createNativeStackScreen({
      screen: SettingsLegalRouteScreen,
      linking: "settings/legal",
      options: {
        ...LEGAL_DOCUMENT_HEADER_OPTIONS,
        title: "Legal",
      },
    }),
    ConnectOnboarding: createNativeStackScreen({
      screen: ConnectOnboardingRouteScreen,
      linking: "connect-onboarding",
      options: {
        // A root-level Android formSheet does not host the native stack bar;
        // the route renders an embedded AndroidSheetHeader instead.
        ...(Platform.OS === "android" ? { headerShown: false } : SHEET_SOLID_HEADER_OPTIONS),
        title: `Set up ${BRAND.connectName}`,
        gestureEnabled: true,
        ...FORM_SHEET_PRESENTATION_OPTIONS,
        sheetAllowedDetents: [0.6, 0.95],
        sheetGrabberVisible: true,
      },
    }),
    NotFound: createNativeStackScreen({
      screen: NotFoundScreen,
      linking: "*",
    }),
  },
});

function GuardedScreenLayout(props: {
  readonly children: ReactNode;
  readonly route: { readonly name: string; readonly params?: object | undefined };
}) {
  return (
    <RenderErrorBoundary
      resetKeys={[props.route.params]}
      renderFallback={(fallback) => (
        <ScreenRenderFallback {...fallback} routeName={props.route.name} />
      )}
    >
      {props.children}
    </RenderErrorBoundary>
  );
}

function ScreenRenderFallback(props: RenderFailureProps & { readonly routeName: string }) {
  const navigation = useNavigation();
  const exit = navigation.canGoBack()
    ? { label: "Go back", onPress: () => navigation.goBack() }
    : props.routeName === "Home"
      ? { label: "Open settings", onPress: () => navigation.navigate("SettingsSheet") }
      : { label: "Return home", onPress: () => navigation.dispatch(StackActions.replace("Home")) };

  return <RenderFailureView {...props} exit={exit} />;
}

export const RootStack = RootStackConfig;

type RootStackType = typeof RootStack;

declare module "@react-navigation/native" {
  interface RootNavigator extends RootStackType {}
}
