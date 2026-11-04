CREATE TYPE "public"."application_email_event" AS ENUM('submitted', 'in_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."application_locale" AS ENUM('ru', 'ro');--> statement-breakpoint
CREATE TYPE "public"."email_delivery_status" AS ENUM('queued', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"event_type" "application_email_event" NOT NULL,
	"recipient_email" text NOT NULL,
	"encrypted_payload" text NOT NULL,
	"status" "email_delivery_status" DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creator_applications" ADD COLUMN "locale" "application_locale" DEFAULT 'ru' NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_applications" ADD COLUMN "review_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_application_id_creator_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."creator_applications"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "email_deliveries_event_key_unique" ON "email_deliveries" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "email_deliveries_application_idx" ON "email_deliveries" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "email_deliveries_due_idx" ON "email_deliveries" USING btree ("status","next_attempt_at");