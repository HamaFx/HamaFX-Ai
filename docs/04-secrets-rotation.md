# Secrets Rotation

This document outlines the procedure for rotating critical secrets in the HamaFX-Ai project.

## Encryption Secrets (AES-256-GCM)
`ENCRYPTION_SECRET` is used for BYOK keys and backup encryption.
If rotated, all previously encrypted keys in the database will be unreadable unless migrated.
**Procedure:**
1. Generate a new secret: `openssl rand -hex 32`
2. Run a migration script that decrypts with the old secret and re-encrypts with the new secret.
3. Update Vercel and restart all environments.

## NextAuth Secret
`NEXTAUTH_SECRET` signs session cookies.
**Procedure:**
1. Generate: `openssl rand -base64 32`
2. Update the environment variables.
3. Users will be logged out upon the next request.

## Cron Secret
`CRON_SECRET` protects internal cron endpoints.
**Procedure:**
1. Generate a new secure string.
2. Update the variable in Vercel.
3. Update the scheduled jobs headers in `vercel.json` or external callers.

## Database Passwords
For Supabase Postgres or local setups:
1. Change password in Supabase Dashboard.
2. Update `DATABASE_URL` in Vercel.
3. Re-deploy the application.
