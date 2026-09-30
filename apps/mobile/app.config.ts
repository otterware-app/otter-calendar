import type { ExpoConfig } from "expo/config";

import { BRAND } from "../../packages/shared/src/brand.ts";
import { BRAND_ASSET_PATHS, mobileAppNames } from "../../scripts/lib/brand-assets.ts";
import { loadRepoEnv } from "../../scripts/lib/public-config.ts";

type AppVariant = "development" | "preview" | "production";

const repoEnv = loadRepoEnv();
Object.assign(process.env, repoEnv);

// The app's own Expo (EAS) project. Unset in local development, where updates
// are off and nothing talks to EAS.
const EAS_PROJECT_ID = repoEnv.EAS_PROJECT_ID?.trim() || undefined;
const EAS_OWNER = repoEnv.EAS_OWNER?.trim() || undefined;

const APP_VARIANT = resolveAppVariant(repoEnv.APP_VARIANT);
const isIosPersonalTeamBuild = repoEnv.T3CODE_IOS_PERSONAL_TEAM === "1";
const runtimeVersionPolicy =
  process.env.MOBILE_VERSION_POLICY ??
  (APP_VARIANT === "development" ? "appVersion" : "fingerprint");

const personalTeamBundleIdentifier = repoEnv.T3CODE_IOS_PERSONAL_TEAM_BUNDLE_ID?.trim();
const IOS_BUNDLE_IDENTIFIER_PATTERN = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

const fromRepoRoot = (relativePath: string) => `../../${relativePath}`;

if (
  isIosPersonalTeamBuild &&
  (!personalTeamBundleIdentifier ||
    !IOS_BUNDLE_IDENTIFIER_PATTERN.test(personalTeamBundleIdentifier))
) {
  throw new Error(
    `T3CODE_IOS_PERSONAL_TEAM_BUNDLE_ID must be a reverse-DNS identifier such as com.example.${BRAND.urlScheme} when T3CODE_IOS_PERSONAL_TEAM=1.`,
  );
}

const DEVELOPMENT_ASSETS = {
  appIcon: fromRepoRoot(BRAND_ASSET_PATHS.developmentIosIconPng),
  iosIcon: fromRepoRoot(BRAND_ASSET_PATHS.developmentIconComposerProject),
  splashIcon: fromRepoRoot(BRAND_ASSET_PATHS.developmentIosIconPng),
  androidAdaptiveForeground: "./assets/otter/android-icon-foreground.png",
  androidAdaptiveBackgroundColor: "#000000",
  androidAdaptiveBackgroundImage: undefined,
  androidSplashIcon: "./assets/otter/android-splash-icon.png",
  androidMonochromeIcon: "./assets/otter/android-icon-mark.png",
} as const;

const PREVIEW_ASSETS = {
  appIcon: fromRepoRoot(BRAND_ASSET_PATHS.nightlyIosIconPng),
  iosIcon: fromRepoRoot(BRAND_ASSET_PATHS.nightlyIconComposerProject),
  splashIcon: fromRepoRoot(BRAND_ASSET_PATHS.nightlyIosIconPng),
  androidAdaptiveForeground: "./assets/otter/android-icon-foreground.png",
  androidAdaptiveBackgroundColor: "#000000",
  androidAdaptiveBackgroundImage: undefined,
  androidSplashIcon: "./assets/otter/android-splash-icon.png",
  androidMonochromeIcon: "./assets/otter/android-icon-mark.png",
} as const;

const RELEASE_ASSETS = {
  appIcon: fromRepoRoot(BRAND_ASSET_PATHS.productionIosIconPng),
  iosIcon: fromRepoRoot(BRAND_ASSET_PATHS.productionIconComposerProject),
  splashIcon: fromRepoRoot(BRAND_ASSET_PATHS.productionIosIconPng),
  androidAdaptiveForeground: "./assets/otter/android-icon-foreground.png",
  androidAdaptiveBackgroundColor: "#000000",
  androidAdaptiveBackgroundImage: undefined,
  androidSplashIcon: "./assets/otter/android-splash-icon.png",
  androidMonochromeIcon: "./assets/otter/android-icon-mark.png",
} as const;

/**
 * Passkeys and app links verify against the Clerk Frontend API host, which the publishable key
 * encodes (`pk_live_<base64("clerk.example.com$")>`). Without a key there is no sign-in to verify.
 */
function clerkFrontendApiHost(publishableKey: string | undefined): string | null {
  const encoded = publishableKey?.trim().split("_")[2];
  if (!encoded) return null;
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  return /^[a-z0-9.-]+\$$/i.test(decoded) ? decoded.slice(0, -1) : null;
}

const CLERK_RELYING_PARTY = clerkFrontendApiHost(repoEnv.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY);

const APP_NAMES = mobileAppNames(BRAND.displayName);

const VARIANT_CONFIG = {
  development: {
    appName: APP_NAMES.development,
    scheme: `${BRAND.urlScheme}-dev`,
    iosBundleIdentifier: `${BRAND.appId}.dev`,
    androidPackage: `${BRAND.appId}.dev`,
    assets: DEVELOPMENT_ASSETS,
  },
  preview: {
    appName: APP_NAMES.preview,
    scheme: `${BRAND.urlScheme}-preview`,
    iosBundleIdentifier: `${BRAND.appId}.preview`,
    androidPackage: `${BRAND.appId}.preview`,
    assets: PREVIEW_ASSETS,
  },
  production: {
    appName: APP_NAMES.production,
    scheme: BRAND.urlScheme,
    iosBundleIdentifier: BRAND.appId,
    androidPackage: BRAND.appId,
    assets: RELEASE_ASSETS,
  },
} as const;

function resolveAppVariant(value: string | undefined): AppVariant {
  switch (value) {
    case "development":
    case "preview":
    case "production":
      return value;
    default:
      return "production";
  }
}

const variant = VARIANT_CONFIG[APP_VARIANT];
const iosBundleIdentifier = isIosPersonalTeamBuild
  ? personalTeamBundleIdentifier!
  : variant.iosBundleIdentifier;

const dmSansFonts = {
  regular: "@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf",
  medium: "@expo-google-fonts/dm-sans/500Medium/DMSans_500Medium.ttf",
  bold: "@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf",
} as const;

// These aliases match the fonts' PostScript names on iOS. Register the same
// names on Android so React Native and the native composer use one set of
// family names without waiting for runtime font loading.

const config: ExpoConfig = {
  name: variant.appName,
  slug: BRAND.slug,
  platforms: ["ios", "android"],
  scheme: variant.scheme,
  version: "1.3.1",
  runtimeVersion: {
    // Development manifests resolve on every launch, so avoid fingerprint's
    // expensive native-project calculation there. Preview and production stay
    // fingerprinted so OTAs only reach binaries with matching native projects.
    policy: runtimeVersionPolicy,
  },
  orientation: "portrait",
  icon: variant.assets.appIcon,
  userInterfaceStyle: "automatic",
  updates:
    EAS_PROJECT_ID === undefined
      ? { enabled: false }
      : {
          enabled: repoEnv.T3CODE_MOBILE_UPDATES_ENABLED !== "0",
          url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
          checkAutomatically: "ON_LOAD",
          fallbackToCacheTimeout: 0,
        },
  ios: {
    icon: variant.assets.iosIcon,
    supportsTablet: true,
    bundleIdentifier: iosBundleIdentifier,
    // Pin code signing to the Clary team so non-interactive `expo run:ios`
    // does not fall back to a personal team (which cannot sign keychain groups
    // or Sign in with Apple entitlements).
    appleTeamId: repoEnv.APPLE_TEAM_ID?.trim() || "YNJ5WLH965",
    ...(CLERK_RELYING_PARTY === null
      ? {}
      : {
          associatedDomains: [
            `applinks:${CLERK_RELYING_PARTY}`,
            `webcredentials:${CLERK_RELYING_PARTY}`,
          ],
        }),
    entitlements: {
      "keychain-access-groups": [`$(AppIdentifierPrefix)${variant.iosBundleIdentifier}`],
    },
    infoPlist: {
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
      },
      NSLocalNetworkUsageDescription: `Allow ${BRAND.displayName} to connect to ${BRAND.displayName} servers on your local network or tailnet.`,
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    icon: variant.assets.appIcon,
    package: variant.androidPackage,
    adaptiveIcon: {
      backgroundColor: variant.assets.androidAdaptiveBackgroundColor,
      ...(variant.assets.androidAdaptiveBackgroundImage
        ? { backgroundImage: variant.assets.androidAdaptiveBackgroundImage }
        : {}),
      foregroundImage: variant.assets.androidAdaptiveForeground,
      monochromeImage: variant.assets.androidMonochromeIcon,
    },
    // Opts into OnBackInvokedCallback-based back dispatch (Android 13+).
    // JS back handling survives it via react-native's Android 16 shim plus
    // withAndroidPredictiveBackCompat on Android 13-15.
    predictiveBackGestureEnabled: true,
  },
  web: {
    favicon: variant.assets.appIcon,
  },
  plugins: [
    "expo-asset",
    [
      "expo-font",
      {
        ios: {
          fonts: [dmSansFonts.regular, dmSansFonts.medium, dmSansFonts.bold],
        },
        android: {
          fonts: [
            {
              fontFamily: "DMSans-Regular",
              fontDefinitions: [{ path: dmSansFonts.regular, weight: 400 }],
            },
            {
              fontFamily: "DMSans-Medium",
              fontDefinitions: [{ path: dmSansFonts.medium, weight: 500 }],
            },
            {
              fontFamily: "DMSans-Bold",
              fontDefinitions: [{ path: dmSansFonts.bold, weight: 700 }],
            },
          ],
        },
      },
    ],
    "expo-secure-store",
    "expo-sqlite",
    // Personal Teams cannot sign Sign in with Apple.
    ["@clerk/expo", { theme: "./clerk-theme.json", appleSignIn: !isIosPersonalTeamBuild }],
    "expo-web-browser",
    [
      "expo-camera",
      {
        cameraPermission: `Allow ${BRAND.displayName} to access your camera so you can scan pairing QR codes.`,
        microphonePermission: false,
        barcodeScannerEnabled: true,
        recordAudioAndroid: false,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: variant.assets.splashIcon,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        imageWidth: 220,
        dark: {
          image: variant.assets.splashIcon,
          backgroundColor: "#0a0a0a",
        },
        android: {
          // Android 12+ masks the splash icon to a circle over the central two thirds of
          // its 288dp canvas, so the iOS export's corners get cut. A full-canvas image of
          // the composed adaptive layers puts the wordmark in the same frame the launcher
          // icon uses.
          image: variant.assets.androidSplashIcon,
          imageWidth: 288,
          dark: { image: variant.assets.androidSplashIcon },
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          // Keep the supported floor explicit.
          minSdkVersion: 24,
        },
        ios: {
          deploymentTarget: "18.0",
          // AppCheckCore 11.3+ includes Swift and needs module maps for these Objective-C dependencies.
          extraPods: [
            { name: "GoogleUtilities", modular_headers: true },
            { name: "RecaptchaInterop", modular_headers: true },
          ],
        },
      },
    ],
    "./plugins/withIosCocoaPodsUuidCache.cjs",
    "./plugins/withIosSceneLifecycle.cjs",
    "./plugins/withAndroidCleartextTraffic.cjs",
    "./plugins/withAndroidGradleHeap.cjs",
    "./plugins/withAndroidInputBackground.cjs",
    "./plugins/withAndroidModernPopupMenu.cjs",
    "./plugins/withAndroidModernAlertDialog.cjs",
    "./plugins/withAndroidPredictiveBackCompat.cjs",
    "./plugins/withAndroidTabletOrientation.cjs",
  ],
  extra: {
    appVariant: APP_VARIANT,
    iosPersonalTeamBuild: isIosPersonalTeamBuild,
    relay: {
      url: repoEnv.T3CODE_RELAY_URL ?? null,
    },
    clerk: {
      publishableKey: repoEnv.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? null,
      jwtTemplate: repoEnv.EXPO_PUBLIC_CLERK_JWT_TEMPLATE ?? null,
    },
    // Native Google sign-in credentials. @clerk/expo reads these from `extra`
    // under their exact env-var names (not nested), and its config plugin reads
    // the iOS URL scheme at prebuild to register it in Info.plist.
    // Unset values must be omitted (not null): the public manifest serializes
    // null to {}, which is truthy and would defeat Clerk's fallback checks.
    EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID: repoEnv.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID,
    EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID: repoEnv.EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID,
    EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID: repoEnv.EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID,
    EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME: repoEnv.EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME,
    observability: {
      tracesUrl: repoEnv.EXPO_PUBLIC_OTLP_TRACES_URL ?? "https://api.axiom.co/v1/traces",
      tracesDataset: repoEnv.EXPO_PUBLIC_OTLP_TRACES_DATASET ?? null,
      tracesToken: repoEnv.EXPO_PUBLIC_OTLP_TRACES_TOKEN ?? null,
    },
    ...(EAS_PROJECT_ID === undefined ? {} : { eas: { projectId: EAS_PROJECT_ID } }),
  },
  ...(EAS_OWNER === undefined ? {} : { owner: EAS_OWNER }),
};

export default config;
