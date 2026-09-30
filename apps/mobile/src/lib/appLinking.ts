import { BRAND } from "@t3tools/shared/brand";

const SCHEME_ONLY_URL = new RegExp(`^${BRAND.urlScheme}(-dev|-preview)?:/*$`);

/**
 * The Expo dev client launches the app via
 * <scheme>://expo-development-client/?url=<packager> — that URL addresses
 * the launcher, not app navigation. Without this filter it falls through
 * to the NotFound wildcard route on every dev launch.
 * A scheme-only URL, as sent by iOS dictation keyboards returning to the app,
 * only wakes the app and must not reset navigation to Home.
 */
export function shouldHandleAppLink(url: string): boolean {
  return !url.includes("expo-development-client") && !SCHEME_ONLY_URL.test(url);
}

/** Every URL scheme a build variant can register. */
export const APP_LINK_SCHEMES = [
  `${BRAND.urlScheme}://`,
  `${BRAND.urlScheme}-dev://`,
  `${BRAND.urlScheme}-preview://`,
] as const;
