import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { BRAND } from "@t3tools/shared/brand";

import {
  managedEndpointDigestInput,
  managedEndpointForHostname,
  managedEndpointHostname,
  isManagedEndpointHostname,
  managedEndpointTunnelName,
  managedEndpointTunnelNamePrefix,
  relayOwnsManagedEndpointZone,
  RelayPublicDomainLabelTooLongError,
  relayPublicDomainForStage,
  relayResourceNameForStage,
} from "./deploymentConfig.ts";

const isRelayPublicDomainLabelTooLongError = Schema.is(RelayPublicDomainLabelTooLongError);

describe("relayPublicDomainForStage", () => {
  it("uses the canonical relay hostname for production", () => {
    expect(relayPublicDomainForStage("prod", ".example.com.")).toBe("relay.example.com");
  });

  it("isolates personal stages below the imported zone", () => {
    expect(relayPublicDomainForStage("dev_julius", "example.com")).toBe(
      "relay-dev-julius.example.com",
    );
  });

  it("reports the stage and derived DNS label when the label is too long", () => {
    const stage = `dev_${"x".repeat(60)}`;
    let error: unknown;

    try {
      relayPublicDomainForStage(stage, "example.com");
    } catch (cause) {
      error = cause;
    }

    if (!isRelayPublicDomainLabelTooLongError(error)) {
      throw error;
    }
    expect(error).toMatchObject({
      stage,
      label: `relay-dev-${"x".repeat(60)}`,
      maxLength: 63,
    });
    expect(error.message).toBe(
      `Relay stage '${stage}' produces custom domain label 'relay-dev-${"x".repeat(60)}' (70 characters), exceeding the DNS label limit of 63.`,
    );
  });
});

describe("relayOwnsManagedEndpointZone", () => {
  it("keeps the shared Cloudflare zone owned by production", () => {
    expect(relayOwnsManagedEndpointZone("prod")).toBe(true);
    expect(relayOwnsManagedEndpointZone("dev_julius")).toBe(false);
  });
});

describe("relayResourceNameForStage", () => {
  it("isolates production and personal stages", () => {
    expect(relayResourceNameForStage("relay-traces", "prod")).toBe("relay-traces-prod");
    expect(relayResourceNameForStage("relay-traces", "dev_julius")).toBe("relay-traces-dev-julius");
  });
});

describe("managed endpoint names", () => {
  it("uses the brand, the stage slug, and a stable stage-scoped digest suffix", () => {
    const hash = "ABCDEF0123456789ABCDEF0123456789";

    expect(managedEndpointDigestInput("dev_julius", "user_123", "env_123")).toBe(
      "dev_julius:user_123:env_123",
    );
    expect(managedEndpointHostname("dev_julius", ".example.com.", hash)).toBe(
      `${BRAND.slug}-dev-julius-abcdef0123456789.example.com`,
    );
    expect(managedEndpointHostname("prod", "tunnels.example.com", hash)).toBe(
      `${BRAND.slug}-prod-abcdef0123456789.tunnels.example.com`,
    );
    expect(managedEndpointTunnelName("dev_julius", hash)).toBe(
      `${BRAND.slug}-managedendpoint-dev-julius-abcdef0123456789`,
    );
    expect(managedEndpointTunnelNamePrefix("dev_julius")).toBe(
      `${BRAND.slug}-managedendpoint-dev-julius-`,
    );
  });

  it("keeps the DNS label within the provider limit for long stage names", () => {
    const hostname = managedEndpointHostname(
      "dev_" + "x".repeat(100),
      "example.com",
      "a".repeat(64),
    );

    expect(hostname.split(".")[0]?.length).toBeLessThanOrEqual(63);
    expect(hostname).toMatch(/-a{16}\.example\.com$/);
  });

  it("accepts allocated hostnames within the relay zone", () => {
    expect(
      isManagedEndpointHostname("dev-julius-abcdef0123456789.example.com", "example.com"),
    ).toBe(true);
    expect(managedEndpointForHostname("dev-julius-abcdef0123456789.example.com")).toEqual({
      httpBaseUrl: "https://dev-julius-abcdef0123456789.example.com/",
      wsBaseUrl: "wss://dev-julius-abcdef0123456789.example.com/ws",
      providerKind: "cloudflare_tunnel",
    });
  });

  it("rejects hostnames outside the relay zone", () => {
    expect(isManagedEndpointHostname("internal.example.net", "example.com")).toBe(false);
    expect(isManagedEndpointHostname("example.com.attacker.test", "example.com")).toBe(false);
    expect(isManagedEndpointHostname("dev-julius.example.com.", "example.com")).toBe(false);
  });
});
