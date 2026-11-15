CREATE TABLE "legacy_creator_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"legacy_client_id" text NOT NULL,
	"partner_id" uuid NOT NULL,
	"scopes" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "legacy_referral_link_idempotency" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grant_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"referral_link_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "legacy_creator_access_grants" ADD CONSTRAINT "legacy_creator_access_grants_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "legacy_referral_link_idempotency" ADD CONSTRAINT "legacy_referral_link_idempotency_grant_id_legacy_creator_access_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."legacy_creator_access_grants"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "legacy_referral_link_idempotency" ADD CONSTRAINT "legacy_referral_link_idempotency_referral_link_id_referral_links_id_fk" FOREIGN KEY ("referral_link_id") REFERENCES "public"."referral_links"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_creator_access_grants_token_hash_unique" ON "legacy_creator_access_grants" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_creator_access_grants_active_client_unique" ON "legacy_creator_access_grants" USING btree ("legacy_client_id") WHERE "legacy_creator_access_grants"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_creator_access_grants_active_partner_unique" ON "legacy_creator_access_grants" USING btree ("partner_id") WHERE "legacy_creator_access_grants"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "legacy_creator_access_grants_partner_idx" ON "legacy_creator_access_grants" USING btree ("partner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_referral_link_idempotency_grant_key_unique" ON "legacy_referral_link_idempotency" USING btree ("grant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "legacy_referral_link_idempotency_link_idx" ON "legacy_referral_link_idempotency" USING btree ("referral_link_id");