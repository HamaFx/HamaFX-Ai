# Row Level Security (RLS) Policy Plan

> **Status:** Planning — not yet implemented. This document defines the
> roadmap for enabling PostgreSQL Row Level Security on all user-scoped
> tables in the HamaFX-Ai database.

## Background

HamaFX-Ai uses Supabase in production, which provides PostgreSQL RLS.
Currently, no RLS policies are defined on any table. All data access is
enforced at the application layer via `withUserScope()` and explicit
`WHERE user_id = ?` filters.

This means:
1. If the Supabase service role key is compromised, all data is accessible.
2. If the anon key is accidentally used for a query, all users' data is exposed.
3. There is no defense-in-depth at the database level.

## Goal

Enable RLS on all user-scoped tables and create policies that enforce
`user_id = auth.uid()` so that even if the application layer has a bug,
the database prevents cross-tenant data access.

## User-Scoped Tables

The following tables contain per-user data and must have RLS enabled:

| Table | User Column | Notes |
|-------|-------------|-------|
| `user_settings` | `user_id` (PK) | |
| `user_symbols` | `user_id` | Composite PK with `symbol` |
| `user_sessions` | `user_id` | |
| `chat_threads` | `user_id` | |
| `chat_messages` | `user_id` (via thread) | Needs join policy |
| `chat_telemetry` | `user_id` | |
| `memory_embeddings` | `user_id` | |
| `journal_entries` | `user_id` | |
| `portfolio_positions` | `user_id` | |
| `portfolio_settings` | `user_id` | |
| `alerts` | `user_id` | |
| `decision_signals` | `user_id` | |
| `decision_signal_outcomes` | `user_id` (via signal) | Needs join policy |
| `agent_opinions` | `user_id` | |
| `cot_reports` | `user_id` | |
| `snapshots` | `user_id` | |
| `briefings_emitted` | `user_id` | |
| `news_articles` | — | Global, no RLS needed |
| `candles_1m` | — | Global, no RLS needed |
| `live_ticks` | — | Global, no RLS needed |

## Implementation Plan

### Phase A: Enable RLS (Non-Breaking)

1. Enable RLS on all user-scoped tables with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
2. Create permissive policies that allow all access (`USING (true) WITH CHECK (true)`).
   This is a no-op that makes RLS "active" without changing behavior.
3. Verify the application still works correctly with RLS enabled.

```sql
-- Example: Enable RLS with permissive policy
ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_settings_all" ON "user_settings"
  FOR ALL USING (true) WITH CHECK (true);
```

### Phase B: Enforce User Isolation

1. Replace permissive policies with restrictive ones:
   ```sql
   CREATE POLICY "user_settings_isolated" ON "user_settings"
     FOR ALL
     USING (user_id = auth.uid())
     WITH CHECK (user_id = auth.uid());
   ```
2. For tables where `user_id` is not a direct column (e.g. `chat_messages`
   references `chat_threads` which has `user_id`), use subquery policies:
   ```sql
   CREATE POLICY "chat_messages_isolated" ON "chat_messages"
     FOR ALL
     USING (
       thread_id IN (
         SELECT id FROM chat_threads WHERE user_id = auth.uid()
       )
     )
     WITH CHECK (
       thread_id IN (
         SELECT id FROM chat_threads WHERE user_id = auth.uid()
       )
     );
   ```
3. Test each table individually with `SET ROLE anon` and verify isolation.

### Phase C: Service Role Bypass

The application connects with the service role key, which bypasses RLS by
default. This is correct — the application enforces user isolation via
`withUserScope()`. RLS is a defense-in-depth measure for when the anon
key is accidentally used or the service key is compromised.

For any direct-to-database client queries (e.g. Supabase client in the
browser), use the anon key with RLS policies enforcing `auth.uid()`.

### Phase D: Migration Strategy

1. Create a single migration `0030_rls_enable.sql` that enables RLS with
   permissive policies (Phase A).
2. Deploy and monitor for 1 week. No behavior change expected.
3. Create migration `0031_rls_enforce.sql` with restrictive policies (Phase B).
4. Deploy and run full test suite. Monitor for access denied errors.

## Prerequisites

- Supabase Auth must be configured so `auth.uid()` returns the correct user ID.
- The application's `user_id` values must match Supabase Auth user IDs
  (they already do — NextAuth v5 uses the same `text` user IDs).
- All existing data must have correct `user_id` values (audit before enabling).

## Risks

- **Performance:** RLS adds a per-row check. For tables with many rows,
  ensure `user_id` is indexed (most already are).
- **Service role queries:** The service role bypasses RLS, so application
  queries are unaffected. But if any query uses the anon key, it will be
  filtered by RLS policies.
- **Supabase migrations:** RLS policies are schema-level objects. They
  should be created via Drizzle migrations, not Supabase dashboard.

## References

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/16/ddl-rowsecurity.html)
- Database Architecture Analysis §6 (SEC-1)