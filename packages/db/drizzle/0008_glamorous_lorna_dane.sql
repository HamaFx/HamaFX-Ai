CREATE TABLE "intermarket_resonance" (
	"date" date PRIMARY KEY NOT NULL,
	"real_yield_pct" double precision,
	"breakeven_inflation_pct" double precision,
	"dxy_index" double precision,
	"gold_close" double precision,
	"divergence_score" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
