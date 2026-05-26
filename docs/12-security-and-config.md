# 12 — Security & Config

## Threat model (lightweight)

We're a read-only assistant — no order placement, no payments — so the threat surface is mostly:

1. **API key exfiltration** (provider keys, AI Gateway, internal HMAC).
2. **Cost runaway** (free-tier abuse, prompt injection driving expensive tool loops).
3. **Account takeover** (Supabase Auth weaknesses).
4. **Provider TOS violations** that get our keys revoked.
5. **Prompt-injection-driven data leakage** (the agent revealing other users' journals or alerts).

## Secrets & keys

- **Never** stored in the repo, never in client bundle.
- `NEXT_PUBLIC_*` env vars are explicitly safe to expose; everything else is server-only.
- Stored in:
  - Vercel Environment Variables (per `Production` / `Preview`)
  - Fly Secrets (`flyctl secrets set ...`)
  - GitHub Actions Repository Secrets (only those CI needs)
- Rotated quarterly or on incident.
- `packages/shared/src/env.ts` validates every required var at boot using zod and throws clearly if anything is missing.

## Auth

- **Supabase Auth** with email magic links + Google OAuth.
- Session cookie is HttpOnly, Secure, SameSite=Lax, scoped to the apex.
- Middleware (`apps/web/src/middleware.ts`) enforces:
  - Authed-only `(app)/*` routes
  - Redirect to `/login?next=...`
  - Edge-fast cookie validation via Supabase server client
- Worker WS uses short-lived JWT minted by web (see `08-backend-and-api.md` § Authorization).

## Authorization (RLS)

Every user-owned table in Supabase has Row-Level Security on:

```sql
-- example: chat_messages
alter table chat_messages enable row level security;
create policy "owner_can_select" on chat_messages
  for select using (auth.uid() = user_id);
create policy "owner_can_insert" on chat_messages
  for insert with check (auth.uid() = user_id);
```

The agent **never** uses the service role key on user-scoped reads — it uses a per-request scoped client built from the user's JWT. Service role is only for cron in the worker.

## Rate limiting

`@upstash/ratelimit` configured with sliding-window:

| Scope                    | Limit                  | Reason                                |
| ------------------------ | ---------------------- | ------------------------------------- |
| `/api/chat` per user     | 30 / minute            | Prevent runaway loops                 |
| `/api/chat` global       | 600 / minute           | Cost ceiling                          |
| `/api/market/*` per user | 240 / minute           | Generous, but bounded                 |
| `/api/market/*` global   | provider-quota-aware   | Defends provider keys                 |
| `/api/news` per user     | 60 / minute            |                                       |
| Auth endpoints           | 10 / minute / IP       | Brute-force defence (Supabase also has) |

When hit, return `429` with `Retry-After`. The chat UI surfaces this with a friendly "you're going fast — try again in N seconds".

## Cost guardrails (LLM)

In addition to rate limiting:

- Token budget per turn (`MAX_TOKENS_INPUT`, `MAX_TOKENS_OUTPUT`).
- Maximum tool-loop iterations: **6** per turn, then the agent is forced to summarise.
- Daily $ budget per user (default $0.50 free tier) tracked in `chat_telemetry`. When exceeded, the chat is rate-limited harder and a friendly notice is shown.
- Global daily budget kill-switch via Upstash counter — if exceeded, AI features degrade to "data-only" mode and notify ops.

## Prompt injection defence

Strategies, layered:

1. **Tools, not prompts**, are the source of truth for prices/news. The model can't be tricked into hallucinating numbers because it must call a tool.
2. The system prompt sets a hard rule: external content (news bodies, article titles) is **data**, not instructions. We wrap any external text with explicit `<external_content>` markers.
3. The agent has **no tool that mutates other users' data** — every tool is keyed by `user_id` server-side from the session, not from tool args.
4. RAG retrieval is filtered server-side by `user_id` for personal sources; news is global but read-only.
5. We never put unsanitised user-supplied URLs into the model context — only structured DTOs.

## Web security

- Strict CSP (per `next.config.mjs`): default-src `'self'`, sensible allowlist for AI Gateway, Supabase, our worker WS, Twelve Data (only if directly fetched from browser — by default we proxy).
- HSTS on apex.
- `Permissions-Policy: camera=(), microphone=(self)`, `geolocation=()`, etc.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- COOP / COEP only enabled on routes that need them (none at MVP).
- Subresource integrity for any third-party script we inject (e.g., TradingView Advanced Widget).

## CORS

- Web API: same-origin only by default.
- Worker WS: only allows `Origin: https://hamafx-ai.app` and the preview deploy origin pattern.

## Data privacy

- We collect: email (auth), prefs, chats, alerts, journal, basic telemetry (route, latency, hashed user id).
- We **don't** collect: precise location, browser fingerprints.
- Right to delete: a `Settings → Delete account` cascade deletes all user-owned rows + Supabase auth user.
- Export: JSON dump endpoint downloads everything tied to the user.

## PII & logs

- Logs include hashed user id (`sha256(user_id + LOG_HASH_SALT)`), never the raw email.
- Provider logs may include symbols + timeframes — no PII.
- Prompt logs (when `LOG_PROMPTS=1` is briefly enabled) are redacted to mask names, emails, account numbers via a lightweight regex pass before transport.

## Dependency hygiene

- `pnpm audit` in CI; high/critical fail the build.
- Renovate / Dependabot for weekly updates.
- Lockfile committed; CI enforces frozen install.

## Observability & alerting

| Signal                                    | Where     | Action                                      |
| ----------------------------------------- | --------- | ------------------------------------------- |
| `error_rate(/api/chat) > 5% / 5min`       | Axiom     | Slack `#hamafx-alerts`, page on-call        |
| `provider.error_rate(twelve-data) > 10%` | Axiom     | Auto-disable primary, fall back; notify    |
| `cost.daily.global > $X`                  | Worker    | Disable AI for new turns; notify           |
| `worker.ws.connections > capacity`        | Fly       | Auto-scale recommendation                   |
| `auth.failed_logins.spike`                | Supabase  | Slack notification                          |

## Backup & recovery

- Supabase: daily backups (Pro plan); PITR on (when enabled).
- Drizzle migrations in repo are the second source of schema truth.
- Upstash: ephemeral cache only — no backup needed.
- News + embeddings: re-derivable from providers; we store a 60-day window; older rows are pruned.

## Compliance posture (informational)

- We are **not** a regulated financial entity; we display licensed read-only data and AI-generated commentary.
- The UI carries a clear, persistent disclaimer: "Not financial advice. Information may be delayed or inaccurate."
- We do not custody funds, do not place trades, do not solicit deposits.
