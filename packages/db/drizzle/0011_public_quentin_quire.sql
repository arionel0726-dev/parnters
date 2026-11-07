CREATE TYPE "public"."payout_status" AS ENUM('requested', 'approved', 'paid', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."referral_order_status" AS ENUM('confirmed', 'cancelled');--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"status" "payout_status" DEFAULT 'requested' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"processed_by_user_id" uuid,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_amount_positive" CHECK ("payouts"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "referral_link_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_link_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"locale" "application_locale",
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"order_id" text NOT NULL,
	"referral_link_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"creator_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"commission_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"commission_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" "referral_order_status" DEFAULT 'confirmed' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_processed_by_user_id_users_id_fk" FOREIGN KEY ("processed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "referral_link_clicks" ADD CONSTRAINT "referral_link_clicks_referral_link_id_referral_links_id_fk" FOREIGN KEY ("referral_link_id") REFERENCES "public"."referral_links"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "referral_link_clicks" ADD CONSTRAINT "referral_link_clicks_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "referral_orders" ADD CONSTRAINT "referral_orders_referral_link_id_referral_links_id_fk" FOREIGN KEY ("referral_link_id") REFERENCES "public"."referral_links"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "referral_orders" ADD CONSTRAINT "referral_orders_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "payouts_partner_idx" ON "payouts" USING btree ("partner_id","requested_at");--> statement-breakpoint
CREATE INDEX "payouts_status_idx" ON "payouts" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "referral_link_clicks_link_idx" ON "referral_link_clicks" USING btree ("referral_link_id","clicked_at");--> statement-breakpoint
CREATE INDEX "referral_link_clicks_partner_idx" ON "referral_link_clicks" USING btree ("partner_id","clicked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_orders_event_unique" ON "referral_orders" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_orders_order_unique" ON "referral_orders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "referral_orders_partner_idx" ON "referral_orders" USING btree ("partner_id","occurred_at");--> statement-breakpoint
CREATE INDEX "referral_orders_link_idx" ON "referral_orders" USING btree ("referral_link_id","occurred_at");