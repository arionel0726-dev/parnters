CREATE TYPE "public"."creator_partnership_format" AS ENUM('blogger_influencer', 'ugc_creator', 'both');--> statement-breakpoint
ALTER TABLE "creator_applications" ADD COLUMN "partnership_format" "creator_partnership_format";--> statement-breakpoint
ALTER TABLE "creator_applications" ADD COLUMN "content_description" text;--> statement-breakpoint
ALTER TABLE "creator_applications" ADD COLUMN "partnership_reason" text;