import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderInstanceEnvironment,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

export class ProviderAdapterDriverCreateError extends Schema.TaggedError<ProviderAdapterDriverCreateError>()(
  "ProviderAdapterDriverCreateError",
  {
    driver: ProviderDriverKind,
    instanceId: ProviderInstanceId,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Failed to create orchestration-v2 provider adapter ${this.instanceId} (${this.driver}): ${this.detail}`;
  }
}

export interface ProviderAdapterDriverCreateInput<Config> {
  readonly instanceId: ProviderInstanceId;
  readonly displayName: string | undefined;
  readonly accentColor?: string | undefined;
  readonly environment: ProviderInstanceEnvironment;
  readonly enabled: boolean;
  readonly config: Config;
}
