CREATE TYPE "public"."referral_link_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."referral_link_type" AS ENUM('homepage', 'product', 'category', 'brand');--> statement-breakpoint
CREATE TABLE "partner_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"partner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"code" text NOT NULL,
	"target_protocol" text NOT NULL,
	"target_host" text NOT NULL,
	"target_path" text NOT NULL,
	"link_type" "referral_link_type" NOT NULL,
	"status" "referral_link_status" DEFAULT 'active' NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_links_target_protocol_check" CHECK ("referral_links"."target_protocol" in ('http', 'https'))
);
--> statement-breakpoint
ALTER TABLE "partner_accounts" ADD CONSTRAINT "partner_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_accounts" ADD CONSTRAINT "partner_accounts_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "referral_links" ADD CONSTRAINT "referral_links_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_accounts_partner_unique" ON "partner_accounts" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_accounts_partner_idx" ON "partner_accounts" USING btree ("partner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_links_code_unique" ON "referral_links" USING btree ("code");--> statement-breakpoint
CREATE INDEX "referral_links_partner_idx" ON "referral_links" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "referral_links_status_idx" ON "referral_links" USING btree ("status");