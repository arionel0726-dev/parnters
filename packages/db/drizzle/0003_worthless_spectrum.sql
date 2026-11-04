CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TABLE "partner_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"token_hash" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partner_invitations" ADD CONSTRAINT "partner_invitations_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_invitations" ADD CONSTRAINT "partner_invitations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_invitations_token_hash_unique" ON "partner_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "partner_invitations_partner_idx" ON "partner_invitations" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_invitations_status_idx" ON "partner_invitations" USING btree ("status");
