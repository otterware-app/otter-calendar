import { BRAND } from "@t3tools/shared/brand";
import { describe, expect, it } from "vite-plus/test";

import { isLegalDocumentUrl } from "./legal-document-url";

describe("isLegalDocumentUrl", () => {
  it.each([
    `${BRAND.hostedAppUrl}/legal`,
    `${BRAND.hostedAppUrl}/legal/`,
    `${BRAND.hostedAppUrl}/privacy-policy?source=app`,
    `${BRAND.hostedAppUrl}/terms-of-service#updates`,
    `${BRAND.hostedAppUrl}/security-policy`,
  ])("allows a configured legal document: %s", (url) => {
    expect(isLegalDocumentUrl(url)).toBe(true);
  });

  it.each([
    `${BRAND.hostedAppUrl}/download`,
    "https://example.com/legal",
    "javascript:alert(1)",
    "not-a-url",
  ])("rejects a URL outside the legal-document allowlist: %s", (url) => {
    expect(isLegalDocumentUrl(url)).toBe(false);
  });
});
