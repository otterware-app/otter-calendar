import * as Layer from "effect/Layer";

import {
  ClaudeAgentSdkQueryRunner,
  claudeAgentSdkQueryRunnerLiveLayer,
} from "../adapters/ClaudeAdapterV2.ts";
import {
  CodexAppServerClientFactory,
  codexAppServerClientFactoryFromSettingsLayer,
} from "../adapters/CodexAdapterV2.ts";
import { IdAllocatorV2, layer as idAllocatorLayer } from "../adapters/IdAllocator.ts";
import { layer as providerContinuationRequestsLayer } from "../adapters/ProviderContinuationRequests.ts";

export type ProviderOrchestrationAdapterInfrastructure =
  | ClaudeAgentSdkQueryRunner
  | CodexAppServerClientFactory
  | IdAllocatorV2;

/**
 * Infrastructure shared by the adapters materialized inside provider
 * instances. The server provides this exact layer value once, so the
 * adapters and whoever drains `ProviderContinuationRequests` share one
 * queue through layer memoization.
 */
export const ProviderOrchestrationAdapterInfrastructureLive = Layer.mergeAll(
  claudeAgentSdkQueryRunnerLiveLayer,
  codexAppServerClientFactoryFromSettingsLayer,
  idAllocatorLayer,
  providerContinuationRequestsLayer,
);
