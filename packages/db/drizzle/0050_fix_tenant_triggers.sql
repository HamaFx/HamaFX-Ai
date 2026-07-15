ALTER TABLE "verificationToken" DROP CONSTRAINT "verificationToken_identifier_token_pk";--> statement-breakpoint
ALTER TABLE "verificationToken" ADD CONSTRAINT "verificationToken_identifier_purpose_token_pk" PRIMARY KEY("identifier","purpose","token");--> statement-breakpoint
ALTER TABLE "verificationToken" ADD COLUMN "purpose" text NOT NULL;