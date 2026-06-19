---
"@hamafx/ai": major
"@hamafx/db": major
"@hamafx/shared": major
"web": major
"worker": major
---

Welcome to HamaFX-Ai v2.0! This major release transitions the platform to a fully multi-tenant architecture.
- Replaced `APP_PASSWORD` with `NextAuth.js` enabling multiple users to safely login.
- Strong isolation via Row Level Security boundaries enforced across all databases and caching layers.
- Playwright end-to-end tests are fully multi-tenant capable.
- Legacy rollback and backwards compatibility modes supported via `AUTH_MODE=legacy`.
- Database Statement Timeouts to protect instance stability.
- Internal telemetry and audit logging added for system tracking.
