CREATE TYPE "public"."application_review_action" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."partner_type" AS ENUM('creator', 'referral');--> statement-breakpoint
CREATE SEQUENCE "public"."creator_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "application_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"reviewer_user_id" uuid,
	"action" "application_review_action" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"date_of_birth" date NOT NULL,
	"instagram" text,
	"tiktok" text,
	"other_social" text,
	"introduction" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"status" "application_status" DEFAULT 'pending' NOT NULL,
	"partner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partners" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "partners" ALTER COLUMN "status" SET DEFAULT 'active'::text;--> statement-breakpoint
UPDATE "partners" SET "status" = 'suspended' WHERE "status" = 'inactive';--> statement-breakpoint
DROP TYPE "public"."partner_status";--> statement-breakpoint
CREATE TYPE "public"."partner_status" AS ENUM('active', 'suspended', 'banned');--> statement-breakpoint
ALTER TABLE "partners" ALTER COLUMN "status" SET DEFAULT 'active'::"public"."partner_status";--> statement-breakpoint
ALTER TABLE "partners" ALTER COLUMN "status" SET DATA TYPE "public"."partner_status" USING "status"::"public"."partner_status";--> statement-breakpoint
ALTER TABLE "partner_agreements" ADD COLUMN "reason" text;--> statement-breakpoint
UPDATE "partner_agreements" SET "reason" = 'Legacy agreement' WHERE "reason" IS NULL;--> statement-breakpoint
ALTER TABLE "partner_agreements" ALTER COLUMN "reason" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "creator_id" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "instagram" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "tiktok" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "other_social" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "introduction" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "type" "partner_type" DEFAULT 'creator' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_reviews" ADD CONSTRAINT "application_reviews_application_id_creator_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."creator_applications"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "application_reviews" ADD CONSTRAINT "application_reviews_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "creator_applications" ADD CONSTRAINT "creator_applications_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "application_reviews_application_idx" ON "application_reviews" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "application_reviews_reviewer_idx" ON "application_reviews" USING btree ("reviewer_user_id");--> statement-breakpoint
CREATE INDEX "creator_applications_status_idx" ON "creator_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "creator_applications_email_idx" ON "creator_applications" USING btree ("email");--> statement-breakpoint
CREATE INDEX "creator_applications_partner_idx" ON "creator_applications" USING btree ("partner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partners_creator_id_unique" ON "partners" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "partners_type_idx" ON "partners" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_applications_active_email_unique" ON "creator_applications" USING btree (lower("email")) WHERE "status" IN ('pending', 'approved');--> statement-breakpoint
CREATE UNIQUE INDEX "creator_applications_active_phone_unique" ON "creator_applications" USING btree ("phone") WHERE "status" IN ('pending', 'approved');
