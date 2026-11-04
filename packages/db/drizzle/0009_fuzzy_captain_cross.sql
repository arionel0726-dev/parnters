CREATE TABLE "api_rate_limits" (
	"bucket_key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_rate_limits_request_count_positive" CHECK ("api_rate_limits"."request_count" >= 1)
);
--> statement-breakpoint
ALTER TABLE "referral_links" ADD COLUMN "label" text DEFAULT 'Моя ссылка' NOT NULL;--> statement-breakpoint
CREATE INDEX "api_rate_limits_expires_at_idx" ON "api_rate_limits" USING btree ("expires_at");