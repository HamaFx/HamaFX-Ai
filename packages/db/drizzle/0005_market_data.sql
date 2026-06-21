-- Phase 8 — worker-driven live tick + 1m-candle persistence.
--
-- `live_ticks` holds at most one row per supported symbol; the worker's
-- BiQuote SignalR consumer UPSERTs it at ≤1 Hz. The Vercel
-- `/api/market/price` route reads from here first, falling through to the
-- existing REST failover chain only when the row is missing or stale.
--
-- `candles_1m` holds finished 1-minute bars written by the worker's
-- in-process aggregator on minute rollover. The composite PK
-- (symbol, t) plus the `INSERT … ON CONFLICT DO NOTHING` write path makes
-- duplicate writes from a worker restart idempotent. Retention is enforced
-- by a tail step in the nightly `snapshots` job (PR-11).
--
-- Note: this migration does NOT touch `memory_embeddings` or
-- `chat_tool_telemetry` — those were created by 0004_phase_7b_memory_index.
-- A snapshot-drift quirk caused drizzle-kit to re-emit them on generate;
-- the SQL is hand-edited to match the actual production state.

CREATE TABLE "live_ticks" (
	"symbol" text PRIMARY KEY NOT NULL,
	"bid" double precision NOT NULL,
	"ask" double precision NOT NULL,
	"mid" double precision NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candles_1m" (
	"symbol" text NOT NULL,
	"t" timestamp with time zone NOT NULL,
	"o" double precision NOT NULL,
	"h" double precision NOT NULL,
	"l" double precision NOT NULL,
	"c" double precision NOT NULL,
	"v" double precision,
	"tick_volume" integer NOT NULL,
	"source" text DEFAULT 'biquote-signalr' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candles_1m_symbol_t_pk" PRIMARY KEY("symbol","t")
);
--> statement-breakpoint
CREATE INDEX "candles_1m_symbol_t_idx" ON "candles_1m" USING btree ("symbol","t");
