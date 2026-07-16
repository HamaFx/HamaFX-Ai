CREATE TABLE "provider_daily_quota" (
	"provider" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "provider_daily_quota_provider_day_pk" PRIMARY KEY("provider","day")
);
