import { describe, expect, it } from "vite-plus/test";
import { providerAuthReturnUrl } from "./providerAuthReturnUrl.ts";
import { BRAND } from "./brand.ts";

describe("provider auth return destinations", () => {
  it.each([BRAND.urlScheme, `${BRAND.urlScheme}-dev`])(
    "returns to %s Welcome and the selected settings instance",
    (scheme) => {
      expect(providerAuthReturnUrl(`${scheme}://app/welcome?code=secret#agents:machine-id`)).toBe(
        `${scheme}://app/welcome#agents:machine-id`,
      );
      expect(
        providerAuthReturnUrl(`${scheme}://app/settings/providers?instanceId=work&code=secret`),
      ).toBe(`${scheme}://app/settings/providers?instanceId=work`);
    },
  );
  it.each([
    `${BRAND.urlScheme}://attacker/welcome`,
    `${BRAND.urlScheme}://app:123/welcome`,
    `${BRAND.urlScheme}://app/auth/callback`,
    `${BRAND.urlScheme}://user@ app/welcome`,
    `${BRAND.urlScheme}://app/welcome/../evil`,
    "https://attacker.example/welcome",
    "file:///welcome",
    "javascript:alert(1)",
  ])("rejects %s", (url) => expect(providerAuthReturnUrl(url)).toBeUndefined());
});
