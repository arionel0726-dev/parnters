ALTER TABLE "referral_links" ADD COLUMN "legacy_entity_id" text;--> statement-breakpoint
ALTER TABLE "referral_links" ADD COLUMN "legacy_product_guid" text;--> statement-breakpoint
ALTER TABLE "referral_links" ADD COLUMN "preferred_locale" "application_locale";--> statement-breakpoint
ALTER TABLE "referral_links" ADD COLUMN "fallback_locale" "application_locale";--> statement-breakpoint
ALTER TABLE "referral_links" ADD COLUMN "fallback_path" text;--> statement-breakpoint
ALTER TABLE "referral_links" ADD COLUMN "canonical_ru_path" text;--> statement-breakpoint
ALTER TABLE "referral_links" ADD COLUMN "canonical_ro_path" text;--> statement-breakpoint
ALTER TABLE "referral_links" ADD COLUMN "resolver_version" smallint;--> statement-breakpoint
ALTER TABLE "referral_links" ADD COLUMN "resolved_at" timestamp with time zone;