CREATE TABLE "password_reset_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"recipient_email" text NOT NULL,
	"encrypted_payload" text NOT NULL,
	"status" "email_delivery_status" DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"first_provider_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "password_reset_deliveries" ADD CONSTRAINT "password_reset_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_deliveries_event_key_unique" ON "password_reset_deliveries" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "password_reset_deliveries_user_idx" ON "password_reset_deliveries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_deliveries_due_idx" ON "password_reset_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_partner_idempotency_key_unique" ON "payouts" USING btree ("partner_id","idempotency_key");