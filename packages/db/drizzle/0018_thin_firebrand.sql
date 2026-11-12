CREATE TYPE "public"."referral_analytics_event_name" AS ENUM('add_to_cart', 'order.created', 'order.updated', 'order.confirmed', 'order.cancelled');--> statement-breakpoint
CREATE TYPE "public"."referral_analytics_source" AS ENUM('browser', 'legacy');--> statement-breakpoint
CREATE TABLE "referral_analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"event_name" "referral_analytics_event_name" NOT NULL,
	"attribution_id" uuid,
	"referral_link_id" uuid,
	"partner_id" uuid,
	"source" "referral_analytics_source" NOT NULL,
	"legacy_order_id" text,
	"status" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_analytics_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"legacy_product_id" text,
	"legacy_product_guid" text,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2),
	"currency" text DEFAULT 'MDL' NOT NULL,
	"line_total" numeric(12, 2),
	CONSTRAINT "referral_analytics_items_quantity_positive" CHECK ("referral_analytics_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "referral_attributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"referral_link_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"visit_key_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "referral_link_clicks" ADD COLUMN "attribution_id" uuid;--> statement-breakpoint
ALTER TABLE "referral_analytics_events" ADD CONSTRAINT "referral_analytics_events_attribution_id_referral_attributions_id_fk" FOREIGN KEY ("attribution_id") REFERENCES "public"."referral_attributions"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "referral_analytics_events" ADD CONSTRAINT "referral_analytics_events_referral_link_id_referral_links_id_fk" FOREIGN KEY ("referral_link_id") REFERENCES "public"."referral_links"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "referral_analytics_events" ADD CONSTRAINT "referral_analytics_events_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "referral_analytics_items" ADD CONSTRAINT "referral_analytics_items_event_id_referral_analytics_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."referral_analytics_events"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_referral_link_id_referral_links_id_fk" FOREIGN KEY ("referral_link_id") REFERENCES "public"."referral_links"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "referral_analytics_events_event_unique" ON "referral_analytics_events" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_analytics_events_dedupe_unique" ON "referral_analytics_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "referral_analytics_events_attribution_idx" ON "referral_analytics_events" USING btree ("attribution_id","occurred_at");--> statement-breakpoint
CREATE INDEX "referral_analytics_events_link_idx" ON "referral_analytics_events" USING btree ("referral_link_id","occurred_at");--> statement-breakpoint
CREATE INDEX "referral_analytics_events_partner_idx" ON "referral_analytics_events" USING btree ("partner_id","occurred_at");--> statement-breakpoint
CREATE INDEX "referral_analytics_events_order_idx" ON "referral_analytics_events" USING btree ("legacy_order_id","occurred_at");--> statement-breakpoint
CREATE INDEX "referral_analytics_items_event_idx" ON "referral_analytics_items" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "referral_analytics_items_product_idx" ON "referral_analytics_items" USING btree ("legacy_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_attributions_token_hash_unique" ON "referral_attributions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "referral_attributions_link_idx" ON "referral_attributions" USING btree ("referral_link_id","created_at");--> statement-breakpoint
CREATE INDEX "referral_attributions_partner_idx" ON "referral_attributions" USING btree ("partner_id","created_at");--> statement-breakpoint
CREATE INDEX "referral_attributions_visit_idx" ON "referral_attributions" USING btree ("referral_link_id","visit_key_hash","created_at");--> statement-breakpoint
CREATE INDEX "referral_attributions_expiry_idx" ON "referral_attributions" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "referral_link_clicks" ADD CONSTRAINT "referral_link_clicks_attribution_id_referral_attributions_id_fk" FOREIGN KEY ("attribution_id") REFERENCES "public"."referral_attributions"("id") ON DELETE set null ON UPDATE cascade;