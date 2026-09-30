import {
  RelayManagedEndpointOrigin,
  RelayManagedEndpointRuntimeConfig,
} from "@t3tools/contracts/relay";
import * as Schema from "effect/Schema";

export const CLOUD_MINT_PUBLIC_KEY = "cloud-mint-ed25519-public-key";
export const CLOUD_ENDPOINT_RUNTIME_CONFIG = "cloud-endpoint-runtime-config";
export const CLOUD_ENDPOINT_CONFIRMED_ORIGIN = "cloud-endpoint-confirmed-origin";
export const CLOUD_LINKED_USER_ID = "cloud-linked-user-id";
export const RELAY_URL_SECRET = "cloud-relay-url";
export const RELAY_ISSUER_SECRET = "cloud-relay-issuer";
export const RELAY_ENVIRONMENT_CREDENTIAL_SECRET = "cloud-relay-environment-credential";

export const encodeEndpointRuntimeConfigJson = Schema.encodeEffect(
  Schema.fromJsonString(RelayManagedEndpointRuntimeConfig),
);

export const decodeRuntimeConfig = Schema.decodeUnknownOption(
  Schema.fromJsonString(RelayManagedEndpointRuntimeConfig),
);

export const ManagedEndpointConfirmedOrigin = Schema.Struct({
  config: RelayManagedEndpointRuntimeConfig,
  origin: RelayManagedEndpointOrigin,
});

export const encodeConfirmedOriginJson = Schema.encodeEffect(
  Schema.fromJsonString(ManagedEndpointConfirmedOrigin),
);

export const decodeConfirmedOrigin = Schema.decodeUnknownOption(
  Schema.fromJsonString(ManagedEndpointConfirmedOrigin),
);
