# HamaFX-Ai Multi-User Migration Guide (v2.0)

This document provides step-by-step instructions for self-hosters to upgrade an existing single-user `v1.x` deployment to the new `v2.0` multi-user architecture.

## Overview
HamaFX-Ai v2.0 introduces proper multi-tenancy, replacing the single `APP_PASSWORD` with `NextAuth.js`. This requires migrating the database schema to associate all existing data with a default "User Zero" and updating your `.env` file to support the new authentication flows.

> [!WARNING]
> Do NOT use `drizzle-kit push` for this upgrade. You must run the automated backfill script before enforcing the new `NOT NULL` constraints on the `user_id` columns, otherwise your database migration will fail or result in data loss.

---

## Step 1: Backup Your Database
Before proceeding, take a complete backup of your Postgres database using `pg_dump`:
```bash
pg_dump -U hamafx -W -F c hamafx > hamafx_v1_backup.dump
```
If you are using Docker Compose with PGlite or a managed service like Supabase, ensure you have a snapshot ready.

---

## Step 2: Update Environment Variables
The `.env` configuration requires new authentication secrets.

**Remove:**
- `APP_PASSWORD` (Deprecated)

**Add / Update:**
- `AUTH_SECRET`: A random 32+ character string used to encrypt JWT sessions. Generate one with `openssl rand -base64 32`.
- `AUTH_URL`: Your full application URL (e.g., `https://copilot.yourdomain.com`).
- `ADMIN_EMAIL`: The email address for the initial "User Zero" (Defaults to `admin@localhost`).

### Legacy Fallback Mode
If you need to instantly restore single-user behaviour without troubleshooting NextAuth:
```env
AUTH_MODE=legacy
```
This forces the application to completely bypass authentication and assume all actions belong to `__system__`.

---

## Step 3: Run the Migration Backfill
Start your database container, but do not boot the main web application yet. Run the dedicated `v2.0` migration script to inject your default user and backfill `user_id` across all tables:

```bash
# Execute the backfill script
npx tsx packages/db/scripts/migrate-v2.ts
```

You should see output indicating that `user_id` was backfilled across tables like `chat_threads`, `alerts`, and `journal`.

---

## Step 4: Apply the Final Schema
Once the backfill is complete, apply the final Drizzle migrations to enforce `NOT NULL` constraints on `user_id`:
```bash
pnpm turbo run db:migrate
```

---

## Step 5: Start the V2 Application
You can now start the full stack:
```bash
docker compose up -d
```
Navigate to `/login` and authenticate using the credentials for your `ADMIN_EMAIL`. All your previous data (threads, journals) will be securely attached to your new user account.

---

## Rollback Procedure
If the upgrade fails and you need to restore your `v1.x` instance:

1. **Revert the Codebase:** Switch your git branch or docker image tag back to `v1.x`.
2. **Restore the Database:** Drop the current schema and restore from your `pg_dump` backup created in Step 1.
```bash
pg_restore -U hamafx -d hamafx -1 hamafx_v1_backup.dump
```
3. **Restore Environment Variables:** Ensure `APP_PASSWORD` is re-added to your `.env` file.
4. Restart the `v1.x` application.
