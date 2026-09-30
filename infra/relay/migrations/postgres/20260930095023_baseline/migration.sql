CREATE TABLE "relay_dpop_proofs" (
	"thumbprint" varchar(128),
	"jti" varchar(255),
	"iat" integer NOT NULL,
	"expires_at" varchar(64) NOT NULL,
	"created_at" varchar(64) NOT NULL,
	CONSTRAINT "relay_dpop_proofs_pkey" PRIMARY KEY("thumbprint","jti")
);
--> statement-breakpoint
CREATE TABLE "relay_environment_credentials" (
	"credential_id" varchar(64) PRIMARY KEY,
	"environment_id" varchar(191) NOT NULL,
	"environment_public_key" text NOT NULL,
	"credential_hash" varchar(191) NOT NULL,
	"revoked_at" varchar(64),
	"created_at" varchar(64) NOT NULL,
	"updated_at" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relay_environment_links" (
	"user_id" varchar(191),
	"environment_id" varchar(191),
	"environment_label" text DEFAULT 'T3 Environment' NOT NULL,
	"environment_public_key" text NOT NULL,
	"endpoint_http_base_url" text NOT NULL,
	"endpoint_ws_base_url" text NOT NULL,
	"endpoint_provider_kind" varchar(32) NOT NULL,
	"managed_tunnels_enabled" boolean DEFAULT false NOT NULL,
	"created_by_device_id" varchar(191),
	"revoked_at" varchar(64),
	"created_at" varchar(64) NOT NULL,
	"updated_at" varchar(64) NOT NULL,
	CONSTRAINT "relay_environment_links_pkey" PRIMARY KEY("user_id","environment_id")
);
--> statement-breakpoint
CREATE TABLE "relay_managed_endpoint_allocations" (
	"user_id" varchar(191),
	"environment_id" varchar(191),
	"hostname" text NOT NULL,
	"tunnel_id" varchar(191),
	"tunnel_name" text NOT NULL,
	"dns_record_id" varchar(191),
	"ready_at" varchar(64),
	"recovery_enabled_at" varchar(64),
	"recovery_environment_public_key" text,
	"origin" jsonb,
	"generation" integer DEFAULT 0 NOT NULL,
	"created_at" varchar(64) NOT NULL,
	"updated_at" varchar(64) NOT NULL,
	CONSTRAINT "relay_managed_endpoint_allocations_pkey" PRIMARY KEY("user_id","environment_id")
);
--> statement-breakpoint
CREATE TABLE "relay_managed_tunnel_limits" (
	"user_id" varchar(191) PRIMARY KEY,
	"max_tunnels" integer NOT NULL,
	"created_at" varchar(64) NOT NULL,
	"updated_at" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_relay_dpop_proofs_expires_at" ON "relay_dpop_proofs" ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_relay_environment_credentials_hash" ON "relay_environment_credentials" ("credential_hash");--> statement-breakpoint
CREATE INDEX "idx_relay_environment_credentials_environment" ON "relay_environment_credentials" ("environment_id","revoked_at");--> statement-breakpoint
CREATE INDEX "idx_relay_environment_credentials_environment_key" ON "relay_environment_credentials" ("environment_id","environment_public_key","revoked_at");--> statement-breakpoint
CREATE INDEX "idx_relay_environment_links_environment" ON "relay_environment_links" ("environment_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_relay_managed_endpoint_allocations_hostname" ON "relay_managed_endpoint_allocations" ("hostname");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_relay_managed_endpoint_allocations_tunnel_name" ON "relay_managed_endpoint_allocations" ("tunnel_name");