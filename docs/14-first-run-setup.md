# First-Run Setup

> How a new user gets from a fresh clone to a working app.

The quick start covers the commands; this page explains what's actually
happening and what the choices mean.

## TL;DR

```bash
git clone https://github.com/HamaFx/HamaFX-Ai
cd HamaFX-Ai
pnpm install
echo 'GOOGLE_GENERATIVE_AI_API_KEY=*** >> .env.local
pnpm dev:local                # http://localhost:3000
```

That's it for native dev. The rest of this page is "what does that
actually do" and "what if I want to use a different provider / Docker /
production".

---

## What gets auto-generated

In `NODE_ENV !== 'production'` (i.e. local dev and tests), the web
app's `getServerEnv()` and `getAuthEnv()` helpers fill in three
secrets if they're missing:

| Secret | Purpose | Min length |
|--------|---------|------------|
| `NEXTAUTH_SECRET` | Sign NextAuth.js v5 JWTs | 32 chars |
| `ENCRYPTION_SECRET` | AES-256-GCM key for BYOK payloads | 32 bytes (64 hex chars) |
| `CRON_SECRET` | Bearer token for `/api/cron/*` | 16 chars |

They're generated with `crypto.randomBytes(N)`, persisted to
`.hamafx/dev-secrets.json` (gitignored), and reloaded on the next
boot. This means **encrypted BYOK keys survive restarts** in dev —
the encrypted data and the encryption key move together.

In production every secret **must** be set explicitly via env. The
schema's refinement rejects a missing value with a clear error
message naming the variable.

## What's actually required

For local dev to start, the schema only requires:

- **One AI provider key** — the simplest path is Google Gemini's free
  tier: `GOOGLE_GENERATIVE_AI_API_KEY=AIza...`
- Nothing else. The PGlite database auto-creates on first boot.
  Migrations auto-apply. Auth secrets auto-generate. Everything else
  has defaults.

## Choosing a provider

The web app's BYOK registry supports 8 providers (Phase 10). The
registry lives in `packages/ai/src/byok-providers.ts`.

| Provider | Free tier | Notes |
|----------|-----------|-------|
| Google AI (Gemini) | ✓ | Easiest to start, generous quota |
| Groq | ✓ | Fast Llama/Mixtral inference |
| Anthropic (Claude) | – | Best reasoning, paid |
| OpenAI (ChatGPT) | – | GPT-4o, vision + embedding |
| Mistral | – | EU-hosted option |
| OpenRouter | – | One key for 100+ models |
| xAI (Grok) | – | Strong reasoning |
| DeepSeek | – | Low-cost open weights |

You can also pass an `OPENAI_API_KEY`-style env var directly
without going through the registry — `resolveUserModel()` will surface
operator-provided keys as a fallback when no BYOK is configured yet.

## The /onboarding wizard

First-time users land on `/onboarding` after `/auth/register`. The
wizard has four steps:

1. **Display name** — what the agent calls you
2. **Trading preferences** — timezone, default symbol (XAUUSD / EURUSD / GBPUSD)
3. **AI provider** — pick one of the 8 cards, paste your key, hit **Test Connection** to verify, or skip and configure later in Settings
4. **Confirmation** — review and finish

You can return to any step via Settings. The wizard never blocks —
the chat works as long as you have *some* AI key set, either via
wizard, Settings, or env.

## Docker / production paths

- **Docker compose** (`docker compose -f docker-compose.prod.yml up -d`):
  Postgres 16 + pgvector + the app. Follow the env file instructions
  in the compose file. PGVector requires this mode — PGlite doesn't
  ship the vector extension.
- **Cloud** (Vercel + GCE VM): see `docs/08-deployment.md`. All
  three secrets must be set in Vercel's dashboard; the VM reads from
  `/opt/hamafx/.env` on disk.

## What about the existing /settings/api-keys page?

It's still there and now uses the same provider registry. Per-provider
controls:

- Show / hide key toggle
- **Test Connection** button (calls `/api/settings/test-provider` to
  instantiate the provider SDK)
- Dirty-state indicator ("Unsaved changes — click Save")
- Last-validated indicator when the SDK instantiates successfully

You can mix and match providers — the routing layer in
`packages/ai/src/model.ts` picks the strongest configured provider
per domain and falls back to others when a provider doesn't support
a specific capability (e.g. DeepSeek has no vision model).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|---------------|-----|
| `Invalid environment configuration: NEXTAUTH_SECRET must be at least 32 chars` | Production env, secrets weren't auto-gen'd | Set the secret explicitly in your deployment env |
| `No AI API keys configured` | You finished onboarding without picking a provider | Visit `/settings/api-keys`, paste a key |
| `Daily AI budget exceeded (X / Y)` | You burned through today's quota | Wait until UTC midnight or raise `MAX_DAILY_USD` |
| `relation does not exist` on a fresh DB | PGlite migration didn't run | `rm -rf .hamafx/data && pnpm dev:local` to start over |
| Encrypted keys unreadable after restart | Dev secrets file got out of sync | `rm .hamafx/dev-secrets.json .hamafx/data/dev-secrets.json` to regenerate |

## Source map

| Concern | File |
|---------|------|
| Schema validation | `packages/shared/src/env.ts` |
| Secret generation + persistence | `packages/shared/src/env-secrets.ts`, `apps/web/src/lib/env.ts` |
| BYOK registry (8 providers) | `packages/ai/src/byok-providers.ts` |
| Provider routing / fallback | `packages/ai/src/model.ts` |
| Onboarding wizard | `apps/web/src/components/onboarding/wizard.tsx` |
| API keys UI | `apps/web/src/app/(app)/settings/api-keys/` |
| Test connection route | `apps/web/src/app/api/settings/test-provider/route.ts` |
| Encryption helpers | `packages/shared/src/encryption.ts` |