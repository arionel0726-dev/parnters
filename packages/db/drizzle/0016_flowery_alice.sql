CREATE TABLE "legacy_account_link_initiations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_hash" text NOT NULL,
	"legacy_client_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"pkce_challenge" text NOT NULL,
	"state" text NOT NULL,
	"state_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_account_link_initiations_ticket_unique" ON "legacy_account_link_initiations" USING btree ("ticket_hash");--> statement-breakpoint
CREATE INDEX "legacy_account_link_initiations_expiry_idx" ON "legacy_account_link_initiations" USING btree ("expires_at");