CREATE TYPE "public"."agreement_status" AS ENUM('draft', 'active', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."partner_status" AS ENUM('active', 'inactive', 'banned');--> statement-breakpoint
CREATE TYPE "public"."partner_tier" AS ENUM('starter', 'growth', 'premium');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'manager', 'viewer');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"commission_rate" numeric(5, 2) NOT NULL,
	"starts_at" date NOT NULL,
	"ends_at" date,
	"status" "agreement_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_agreements_commission_rate_range" CHECK ("partner_agreements"."commission_rate" >= 0 AND "partner_agreements"."commission_rate" <= 100),
	CONSTRAINT "partner_agreements_date_range" CHECK ("partner_agreements"."ends_at" IS NULL OR "partner_agreements"."ends_at" >= "partner_agreements"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"tier" "partner_tier" DEFAULT 'starter' NOT NULL,
	"status" "partner_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_agreements" ADD CONSTRAINT "partner_agreements_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_agreements" ADD CONSTRAINT "partner_agreements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "partner_agreements_partner_idx" ON "partner_agreements" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_agreements_status_idx" ON "partner_agreements" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "partners_email_unique" ON "partners" USING btree ("email");--> statement-breakpoint
CREATE INDEX "partners_status_idx" ON "partners" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");