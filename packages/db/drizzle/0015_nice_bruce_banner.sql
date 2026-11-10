CREATE TABLE "legacy_account_link_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"partner_id" uuid NOT NULL,
	"legacy_client_id" text,
	"redirect_uri" text NOT NULL,
	"pkce_challenge" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "legacy_account_link_nonces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_id" text NOT NULL,
	"nonce" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "legacy_account_link_codes" ADD CONSTRAINT "legacy_account_link_codes_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_account_link_codes_hash_unique" ON "legacy_account_link_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "legacy_account_link_codes_partner_idx" ON "legacy_account_link_codes" USING btree ("partner_id","created_at");--> statement-breakpoint
CREATE INDEX "legacy_account_link_codes_expiry_idx" ON "legacy_account_link_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_account_link_nonces_key_nonce_unique" ON "legacy_account_link_nonces" USING btree ("key_id","nonce");--> statement-breakpoint
CREATE INDEX "legacy_account_link_nonces_expiry_idx" ON "legacy_account_link_nonces" USING btree ("expires_at");