# Chat Telemetry Partitioning Plan

> **Status:** Planning document only — do not execute yet.
> **Created:** Phase 8 §45 of the Database Architecture Remediation Plan.

## Problem

The `chat_telemetry` table grows unbounded — one row per assistant turn
plus one row per Title_Generator/routing event. At current scale (~100
turns/day per active user), the table will exceed 1M rows within 6–12
months, at which point analytical queries (e.g. `computeUsage()` which
scans a 30-day window) will slow down significantly.

## Recommendation

Add **monthly partitioning** to `chat_telemetry` using native PostgreSQL
declarative partitioning once the table exceeds ~1M rows.

## Approach

### 1. Create a partitioned parent table

```sql
CREATE TABLE chat_telemetry_partitioned (
  id uuid DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  thread_id uuid,
  message_id uuid,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  tool_calls integer NOT NULL DEFAULT 0,
  ms integer NOT NULL DEFAULT 0,
  est_cost_usd double precision NOT NULL DEFAULT 0,
  kind text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
```

Note: `created_at` must be part of the primary key for partitioned tables.

### 2. Create monthly partitions

```sql
CREATE TABLE chat_telemetry_2026_01
  PARTITION OF chat_telemetry_partitioned
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

### 3. Automate with pg_partman (recommended)

Use [pg_partman](https://github.com/pgpartman/pg_partman) to automate
partition creation and old partition archival/dropping:

```sql
SELECT partman.create_parent(
  'public.chat_telemetry_partitioned',
  'created_at',
  'native',
  'monthly',
  p_premake => 3
);
```

### 4. Migrate existing data

```sql
INSERT INTO chat_telemetry_partitioned
  SELECT * FROM chat_telemetry;

ALTER TABLE chat_telemetry RENAME TO chat_telemetry_old;
ALTER TABLE chat_telemetry_partitioned RENAME TO chat_telemetry;

CREATE INDEX telemetry_created_idx ON chat_telemetry (created_at);
CREATE INDEX telemetry_thread_idx ON chat_telemetry (thread_id);
CREATE INDEX telemetry_user_created_idx ON chat_telemetry (user_id, created_at);
```

### 5. Set up partition maintenance

- **New partitions:** pg_partman auto-creates future partitions.
- **Old partitions:** Set a retention policy to detach and archive
  partitions older than 12 months.

## Drizzle ORM Considerations

- Drizzle ORM works transparently with partitioned tables — the parent
  table is the one Drizzle references.
- The `id` column can no longer be a simple primary key (it must include
  `created_at`). This affects Drizzle's `.findUnique()` which uses the PK.
  Workaround: use `.where(eq(id, ...))` instead of `.findUnique()`.

## When to Execute

- **Trigger:** Table exceeds 1M rows OR `computeUsage()` p95 > 500ms
- **Prerequisite:** pg_partman extension installed on Supabase
- **Downtime:** Minimal — the migration is a rename + data copy

## Alternative: TimescaleDB

If we need more sophisticated time-series features (continuous
aggregates, data retention policies, compression), consider TimescaleDB
instead of native partitioning. Supabase supports TimescaleDB as an
extension. However, native partitioning is simpler and sufficient for
our current needs.