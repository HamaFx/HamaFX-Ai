# Security, Authentication, and Compliance

This document describes the security boundaries that operators must preserve when deploying the single-user BYOK OSS release of Kestrel.

## Secure self-hosted defaults

A fresh Docker installation is intentionally configured as:

- `BYOK_ENABLED=1`: users provide their own AI provider keys.
- `MULTI_USER_ENABLED=0`: the deployment is single-user by default.
- `REGISTRATION_MODE=owner-first`: the first account is the owner; later public registration is closed.
- `HAMAFX_ENABLE_RLS=0`: RLS mode is disabled in this OSS release because not every query path establishes tenant context.
- Sentry and Langfuse are opt-in; no external telemetry is enabled by default.

Do not expose a fresh deployment to the public internet without setting up TLS, host firewall rules, backups, and a strong operator-managed secret store.

## Authentication

The web application uses NextAuth.js v5 with credentials authentication, bcrypt password hashing, JWT sessions, account lockout, optional TOTP 2FA, token-version invalidation, and signed request user headers. `AUTH_SECRET`, `CRON_SECRET`, and `ENCRYPTION_SECRET` are required in production.

## Registration modes

`REGISTRATION_MODE` accepts:

- `owner-first` (default): only the first active user can register. The initial-user check and insert are serialized in PostgreSQL.
- `open`: reserved for a future release; it is rejected in this OSS release.
- `disabled`: all new account creation is blocked.

OAuth provisioning follows the same policy. Admin invitations are not yet a separate workflow. Keep the default owner-first mode for production self-hosting; open/shared mode is not available in this OSS release.

## BYOK encryption

User-provided AI keys are encrypted at rest with AES-256-GCM using `ENCRYPTION_SECRET`. Keep this secret stable and backed up. If it is lost, stored BYOK credentials cannot be decrypted. Never log or commit plaintext provider keys.

## Multi-user PostgreSQL isolation

Shared/multi-user deployment is intentionally not supported by this OSS release. The environment parser and runtime migration entrypoint reject `MULTI_USER_ENABLED=1` or `HAMAFX_ENABLE_RLS=1` before the application starts or mutates the database. This is a safety boundary, not a claim that the current RLS implementation is complete. PGlite is supported only for local single-user development. The migration role must own the application tables or have equivalent `ALTER TABLE` privileges because the single-user migrator removes the unconditional RLS policies after applying the schema.

## Observability and data egress

Sentry and Langfuse are optional. They are initialized only when their corresponding credentials are explicitly configured. The default Compose stack does not start Langfuse; use `docker compose --profile observability up -d` when you intentionally want a local observability service, and only after running `./docker/init-secrets.sh` so its dedicated secrets are non-empty. Review provider retention and prompt-data policies before enabling external telemetry.

## Network and containers

The default Compose file binds web, database, and optional Langfuse ports to loopback. The web and worker images run as the unprivileged `node` user. Internet-facing operators must provide a reverse proxy with TLS, rate limiting, firewalling, and secure headers.

## Secrets and recovery

Back up, rotate, and restore-test:

- `AUTH_SECRET` / `NEXTAUTH_SECRET`
- `CRON_SECRET`
- `ENCRYPTION_SECRET`
- database credentials and database backups
- `ADMIN_DATABASE_URL` credentials when multi-user mode is enabled

Never commit `.env`, `.env.local`, `.hamafx/`, or provider credentials.

## Vulnerability reporting

Do not disclose vulnerabilities in public issues. Follow [SECURITY.md](../SECURITY.md) for the reporting process.
