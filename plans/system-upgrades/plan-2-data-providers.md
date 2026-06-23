# Plan 2 — Data Providers & API Key Management Upgrade

**Priority:** P1 — Core infrastructure upgrade
**Estimated files touched:** 15
**Goal:** Upgrade data provider management to support better symbol management, improve API key UX, and harden the market data pipeline.

---

## Current Architecture

The system has **two separate provider concepts**:

### AI Providers (BYOK — Bring Your Own Key)
- **Storage:** `userSettings.aiApiKeys` — encrypted with AES-256-GCM via `encryptByok`/`decryptByok`
- **Providers:** OpenAI, Google, Anthropic, Groq, Mistral, Cohere, Vertex AI, Fireworks, etc.
- **Settings page:** `settings/api-keys/page.tsx` — server component with `updateApiKeys` action
- **Components:** `ApiKeyCard`, `BulkTestButton`, `SaveBar`, `ApiKeysLandingBanner`
- **Model selection:** `settings/models/page.tsx` — chat/vision/embedding model pickers
- **Catalog:** `lib/catalog-server.ts` — `buildCatalogForUser()` merges provider registry + user keys + health
- **Health tracking:** `providerTests` DB table — stores last test result per provider
- **Usage tracking:** `computeUsage()` from `@hamafx/ai` — 30-day turns + cost per provider

### Market Data Providers
- **Client:** `lib/market-client.ts` — typed fetch wrapper for `/api/market/*` routes
- **API routes:** `api/market/candles`, `api/market/price`, `api/market/indicators`, `api/market/structure`
- **External data:** BiQuote (or similar) for live prices/candles
- **No provider selection UI** — market data source is hardcoded server-side
- **No fallback/retry** — single provider, no redundancy

---

## 🔴 Bugs (8)

### Bug 1: `void Info;` dead code in api-key-card.tsx
**File:** `api-keys/_components/api-key-card.tsx`
Dead code that serves no purpose. The `Info` import should be removed entirely.

**Fix:** Remove `Info` from imports and delete `void Info;`.

### Bug 2: Models page redirects to `/auth/login` instead of `/login`
**File:** `settings/models/page.tsx`
```ts
if (!session?.user?.id) {
  redirect('/auth/login');  // ← wrong path
}
```

**Fix:** `redirect('/login');`

### Bug 3: No CSRF token on test-provider fetch in wizard
**File:** `onboarding/wizard.tsx`
The onboarding wizard fetches `/api/settings/test-provider` without a CSRF token, causing 403 on all tests.

**Fix:** Add `...withCsrf()` to the fetch call.

### Bug 4: `parse()` in market-client.ts doesn't handle non-JSON responses
**File:** `lib/market-client.ts`
If the server returns HTML (e.g., 500 error page), `JSON.parse` throws an unhelpful `SyntaxError`.

**Fix:** Wrap JSON.parse in try-catch with meaningful error message.

### Bug 5: No AbortController timeout on market data fetches
**File:** `lib/market-client.ts`
All fetch calls have no timeout. If the market data provider hangs, the request hangs indefinitely.

**Fix:** Add a timeout wrapper with configurable ms (default 10s).

### Bug 6: Save bar doesn't warn about unsaved changes on navigation
**File:** `api-keys/_components/save-bar.tsx`
User can navigate away from the page with unsaved API key changes. No `beforeunload` warning.

**Fix:** Add `beforeunload` listener when `hasUnsavedChanges` is true.

### Bug 7: Bulk test button has no progress feedback
**File:** `api-keys/_components/bulk-test-button.tsx`
Tests all keys sequentially but shows no progress. User doesn't know how long to wait.

**Fix:** Show `{current}/{total}` progress indicator.

### Bug 8: No retry logic on market data fetches
**File:** `lib/market-client.ts`
If a fetch fails (network error, 5xx), there's no retry. The hook level may retry via React Query, but the client itself gives up immediately.

**Fix:** Add optional retry with exponential backoff (2 retries, 500ms * 2^i).

---

## 🟡 Improvements (9)

### Imp 1: Add provider health dashboard
Show a summary card at the top of the API keys page with overall health status, last test timestamp, quick "Test all" button, and failed providers highlighted in red.

### Imp 2: Add auto-test on key save
After saving a new API key, automatically test it and show the result immediately — don't require the user to click "Test" manually.

### Imp 3: Add provider-specific setup instructions
Each `ApiKeyCard` should have an expandable section with how to get an API key, link to provider's dashboard, free tier information, and rate limits.

### Imp 4: Add usage limits and alerts
Show per-provider usage with configurable alerts: spending threshold notifications via email/telegram.

### Imp 5: Add provider fallback chain
Let users configure a fallback order: "If OpenAI fails, use Google; if Google fails, use Groq." The chat API should automatically try the next provider on failure.

### Imp 6: Add key rotation reminders
Track when each key was last updated. Show a reminder after 90 days: "Consider rotating your OpenAI API key (last updated 95 days ago)."

### Imp 7: Improve catalog server caching
`buildCatalogForUser()` runs on every page load. Add a 5-minute TTL cache.

### Imp 8: Add market data provider configuration
Currently market data source is hardcoded. Add a settings card for selecting market data provider, showing subscription status, and testing connectivity.

### Imp 9: Add encrypted key export/import
Let users export their encrypted API keys for backup (requires password) and import on another device.

---

## 🔵 Polish (5)

1. **Show provider logos/icons** — visual recognition for each provider card
2. **Add "free tier" badge** — Google Gemini and Groq should show "Free" badge
3. **Add keyboard shortcut to test keys** — press `T` on focused card to test
4. **Show estimated monthly cost** — "Based on your last 7 days, you're on track to spend ~$X"
5. **Add copy-to-clipboard for API key** — with confirmation dialog

---

## 🟢 Upgrades (8)

### Upgrade 1: Add provider capability matrix
Show a comparison table: Provider × Chat/Vision/Embedding/Streaming/Tool Calls/Free Tier.

### Upgrade 2: Add per-model usage breakdown
Show usage per model, not just per provider: "GPT-4o: 450 turns, $12.30".

### Upgrade 3: Add provider-specific rate limit display
Show remaining rate limits for providers that expose them via headers.

### Upgrade 4: Add market data provider abstraction
Create a `MarketDataProvider` interface so the system can support multiple data sources (BiQuote, Alpha Vantage, Polygon, etc.).

### Upgrade 5: Add WebSocket support for live prices
Replace 1.5s polling with WebSocket subscriptions for real-time price updates.

### Upgrade 6: Add provider health monitoring cron job
A cron job that tests all configured providers every hour and stores results.

### Upgrade 7: Add cost projection and budget alerts
Set monthly budget, get alerts at 50%, 80%, 100%. Auto-disable non-essential features when approaching limit.

### Upgrade 8: Add multi-region market data routing
Route market data requests to the nearest provider region for lower latency.

---

## Implementation Order

1. **Fix bugs 1-4** (dead code, wrong redirect, CSRF, parse error) — quick wins
2. **Bug 5 + 8** (timeout + retry) — harden market data pipeline
3. **Imp 7** (catalog caching) — performance
4. **Imp 1 + 2** (health dashboard + auto-test) — UX improvement
5. **Imp 3** (setup instructions) — onboarding for new providers
6. **Upgrade 1** (capability matrix) — help users choose
7. **Imp 5** (fallback chain) — reliability
8. **Upgrade 4** (market data abstraction) — extensibility
9. **Remaining polish + upgrades** — iterative improvement
