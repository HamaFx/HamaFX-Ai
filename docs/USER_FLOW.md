HamaFX-Ai — Comprehensive User Flow
====================================

A single reference describing every primary journey through HamaFX-Ai:
onboarding, chat, market analysis, alerts, journal, sharing, and
account lifecycle. Each flow is grounded in the actual source under
apps/web and packages/ai (NextAuth v5 + Edge middleware + AI SDK v5 +
Drizzle + PGlite/Postgres).

Notation used in flow diagrams:

  (start)        Oval — entry / exit point
  [process]      Rectangle — system step / user action
  <decision>     Diamond — branching condition
  --- arrow ---> Sequential flow
  == label ==    Edge label / parallel branch marker


====================================================================
1. Flow Overview
====================================================================

1.1 Primary User Goal
---------------------
Get a domain-aware, evidence-backed answer to a question about a
gold or forex market — bias, structure, news, calendar, an actionable
alert, a journal entry, or a shareable snapshot — and re-enter the
same conversation later with full history.

1.2 Product Surfaces (13 authenticated routes + 2 public)
----------------------------------------------------------
Public:
  /login, /register             NextAuth credentials
  /share/[id]?t=<hmac>          Public analysis snapshot (HMAC gated)

Authenticated (under /(app)/):
  /                            Redirect to /chat (or /onboarding)
  /chat                        Redirect to most-recent thread
  /chat/[threadId]?prompt=...   Full-screen chat surface
  /chart/[symbol]              Candlesticks + indicators + SMC
  /chart/[symbol]/pro          TradingView advanced widget (env-gated)
  /news                        Headline feed w/ sentiment filter
  /calendar                    Economic event list
  /alerts                      Alert CRUD
  /journal                     Trade log + R-multiples
  /settings                    System status, usage, agent, prefs,
                               notifications, preferences, data, about
  /settings/api-keys           BYOK key management
  /settings/agent              Per-tool 24h telemetry
  /settings/usage              Budget gauge + 7-day bar
  /settings/profile            Display name, timezone, default symbol
  /settings/symbols            Watchlist management
  /onboarding                  4-step first-run wizard (after register)
  /offline                     SW navigation fallback

1.3 Entry Points
----------------
  a. Cold open     → /login  → /onboarding  → /chat
  b. Returning     → /  → /chat  → /chat/[latest]
  c. PWA install   → standalone, start_url=/chat
  d. Deep link     → /chat/[id]?prompt=<q>     (Ask AI affordances)
  e. Shared link   → /share/[id]?t=<hmac>      (no auth required)
  f. Public chart  → blocked: middleware redirects to /login

1.4 Success Criteria
--------------------
  - User can register, verify email (implicit — no email verify
    enforced yet), complete onboarding, and reach a chat with a
    working AI provider within 4 minutes.
  - User can ask a free-form question and receive a streaming
    answer that uses real tools (price, candles, news, calendar)
    rather than fabricated numbers — citation guard enforces this.
  - User can pin a symbol, open a chart, set an alert via chat
    or form, and receive an email when the alert fires.
  - User can log a trade and see win-rate / R-multiples update
    without page reload.
  - User can share an analysis with a non-authenticated counter-
    party via HMAC-signed link.
  - User can sign out and lose access (JWT cleared, cookie gone).

1.5 Key Personas
----------------
  Gold trader (primary)
    Daily user. Wants bias + structure on XAUUSD. Will chat 10x/day,
    set 2-3 alerts, log 1-2 trades. Touch-first, phone-first.
    Cares about latency, citation quality, and "did the answer
    actually use the live price?"

  Forex scalper (secondary)
    EURUSD/GBPUSD trader. Timeframe-sensitive. Wants fast LLM
    responses on flash news. Often willing to pay for Pro models.
    Cares about regenerate-with-different-model.

  Analyst / power user
    Uses all 32 tools. Reads committee deliberation. Cross-references
    intermarket data. Logs trades with full annotations. Shares
    analysis links to colleagues.

  Casual evaluator
    Lands on /share/[id] from a forwarded link. No account. Expects
    the page to render and chart to draw without login.

  Self-hoster / OSS contributor
    Runs their own instance. May set AUTH_MODE=legacy for single-
    user mode. Wants BYOK so they don't pay our bills.


====================================================================
2. Step-by-Step Flows
====================================================================

----------------------------------------------------------------------
2.1 Cold-Start Onboarding
----------------------------------------------------------------------

Purpose: turn a freshly-registered account into a working chat
session with at least one AI provider configured.

  (start)
     |
     v
  [User visits /]
     |
     |  (server component, root page)
     v
  <session exists?>
     |-- no --> redirect /chat
     |             | (chat page itself redirects /login)
     |             v
     |          /login → register flow → see 2.2
     |
     |-- yes --> <onboardingCompleted?>
                      |-- yes --> redirect /chat
                      |-- no  --> render /onboarding (4 steps)
                                     |
                                     v
                                  (Step 1) Display name
                                     - Input: name (required, ≥1 char)
                                     - Action: Continue
                                     |
                                     v
                                  (Step 2) Trading preferences
                                     - Input: timezone (auto-prefilled
                                       from Intl)
                                     - Input: default symbol (XAUUSD
                                       | EURUSD | GBPUSD | BTCUSD)
                                     - Action: Back | Continue
                                     |
                                     v
                                  (Step 3) Connect AI provider
                                     - Provider grid: 8 providers
                                       (google/anthropic/openai/groq/
                                        mistral/openrouter/xai/deepseek)
                                       grouped free-tier vs paid
                                     - Click card → highlight + reveal
                                       API key input
                                     - Eye/EyeOff toggle visibility
                                     - "Test Connection" button
                                       (disabled until key ≥ 8 chars)
                                       → POST /api/settings/test-provider
                                       → response { ok | error }
                                       → success: green check
                                       → error: red message
                                     - "Skip for now" link → step 4
                                       with empty keys
                                     - Action: Back | Continue
                                       (Continue disabled until
                                        provider selected AND key
                                        ≥ 8 chars)
                                     |
                                     v
                                  (Step 4) All set (review)
                                     - Read-only summary of inputs
                                     - Action: Back | "Finish Setup"
                                       (loading spinner while
                                        completeOnboardingAction
                                        runs)
                                     |
                                     v
                                  [completeOnboardingAction]
                                     - server action (transaction):
                                       1. decryptByok(existing)
                                       2. merge new keys (empty
                                          string = keep existing)
                                       3. upsert user_settings
                                          (onboardingCompleted=true)
                                       4. insert default watchlist
                                          (XAUUSD/EURUSD/GBPUSD)
                                       5. revalidatePath('/')
                                     |
                                     v
                                  router.push('/chat') + refresh
                                     |
                                     v
                                  (end) — user lands on empty chat

  Error paths:
    - Validation (name blank): Continue disabled
    - Test connection fails: red message in place, Continue still
      disabled (forces explicit Test pass) — user can edit key or
      switch provider
    - Skip path: empty keys saved; first chat turn will surface
      "no provider configured" and bounce to /settings/api-keys
    - DB failure: server action throws, client catches, loading
      resets to false, error logged to console (no toast — the
      action surfaces in the form on next attempt)


----------------------------------------------------------------------
2.2 Authentication (login / register / logout)
----------------------------------------------------------------------

  (start)
     |
     v
  [User visits /login]
     |
     |  page.tsx: server-rendered shell + client <LoginForm>
     v
  <has ?next= param?>
     |-- yes --> hidden input preserves next URL
     |-- no  --> next = ''
     |
     v
  [User submits email + password]
     |
     |  form.action = loginAction (server action)
     v
  <zod schema validates>
     |-- invalid --> return { error: 'Invalid email' | 'Password required' }
     |
     v
  [signIn('credentials', { email, password, redirectTo })]
     |
     |  Edge middleware has already minted hfx_csrf cookie.
     v
  <Credentials.authorize()>
     |-- withRateLimit('login:<email>', 10/min)
     |     |-- exceeded --> return null (no info leak)
     |-- db.users WHERE email
     |     |-- not found --> return null
     |-- bcrypt.compare(password, hash)
     |     |-- mismatch --> return null
     |-- ok --> return { id, email, name? }
     |
     v
  <NextAuth JWT>
     jwt callback folds { id } into token
     session callback projects token.id → session.user.id
     |
     v
  redirect (server) → next || /chat
     |
     |  chat/page.tsx: <onboardingCompleted?>
     |     |-- no  --> redirect /onboarding
     |     |-- yes --> redirect /chat/[latest] or /chat/[new]
     v
  (end) — chat surface

  Registration:
    /register → name (≥2 chars) + email + password (≥8 chars)
    server action: insert users (bcrypt hash, dicebear avatar)
                  + insert userSettings (onboardingCompleted=false,
                    defaultSymbol='XAUUSD')
                  + auto signIn(credentials, redirectTo='/onboarding')

  Logout:
    NavDrawer footer "Sign out" → next-auth signOut() → /login
    Clear session cookie, server-side JWT invalidation (stateless
    strategy means deletion happens on next request — token won't
    validate after secret rotation).

  Brute-force protection:
    10 attempts/email/min via withRateLimit. Counts failures too,
    so an attacker can't escape the cap with rapid retries. Silent
    generic 401 on limit exceeded — no enumeration oracle.


----------------------------------------------------------------------
2.3 Chat Turn Lifecycle (the primary happy path)
----------------------------------------------------------------------

Purpose: user asks a question, agent streams an answer.

  (start) /chat/[threadId]?prompt=...
     |
     v
  [RSC: chat/[threadId]/page.tsx]
     - auth() → userId
     - getThread(userId, threadId) → thread or 404
     - listMessages(userId, threadId, 200) → UIMessage[]
     - listThreads(userId, 50) → sidebar list
     - <ChatScreen> hydrated with all of the above
     |
     v
  [ChatScreen mount]
     - useChat({ id: threadId, transport, messages: initialMessages })
     - useEffect: if autoSubmitPrompt present AND thread empty AND
       not already submitted AND not streaming → sendMessage(prompt)
     - initial scrollTop = scrollHeight (instant, NOT smooth)
     |
     v
  <User types in Composer>
     - textarea auto-resizes (field-sizing: content) up to 40dvh
     - max 8000 chars (soft warning at 7500)
     - Enter sends, Shift+Enter new line
     - Drag-drop or click image icon: max 4, 5MB each
       → POST /api/upload (Supabase) → public URL
     - Mic icon: Web Speech API, "Listening…" pill + mic pulse
     - Send button morphs ArrowUp → Square when streaming
     |
     v
  [User clicks Send]
     |
     |  useChat's DefaultChatTransport.prepareSendMessagesRequest
     v
  [POST /api/chat] with body:
     { threadId, messages, modelOverride? }
     headers:
       X-CSRF-Token = hfx_csrf cookie
       X-AI-Prefs = localStorage('hamafx:ai-prefs')
     |
     |  Edge middleware: CSRF check + auth + x-user-id injection
     v
  [Route handler /api/chat/route.ts]
     - withRateLimit(userId, 'ai_chat', 30/min)
       |-- exceeded --> 429 + Retry-After: 60
     - BodySchema validation
     - last message must be role='user'
     - getServerEnv()
     - X-AI-Prefs parsed → override AI_FUNDAMENTAL_MODEL etc.
     |
     v
  [runChat({ threadId, userId, userMessage, env, ... })]

     STAGE 1 — tryReserveBudget()
        atomic INSERT..ON CONFLICT DO UPDATE on daily counter
        reserve $0.01 against cap
        |-- exceeded --> BudgetExceededError → 503

     STAGE 2 — appendUserMessage()
        persist prompt in chat_messages (transaction)
        bump chat_threads.updatedAt

     STAGE 3 — parallel fetch
        history (60 most recent) + liveSnapshot (price, session,
        health, indicators)

     STAGE 4 — compactThread()
        if > 30 messages, oldest portion → rolling summary
        last 12 messages always kept verbatim

     STAGE 5 — routeTurn() → resolveModel()
        classify message into domain:
          fundamental → AI_FUNDAMENTAL_MODEL (default gemini-2.5-pro)
          technical   → AI_TECHNICAL_MODEL  (default gemini-2.5-flash)
          summary     → AI_SUMMARY_MODEL    (default gemini-2.5-flash-lite)
          vision      → AI_VISION_MODEL     (default gemini-2.5-pro)
        if modelOverride set by regenerate-with-... popover,
        skip classification and use the override

     STAGE 5b — runPlanner() [optional]
        if planRequired (fundamental | technical domains):
          cheap LLM call → JSON plan
          persisted as system message
          rendered as collapsible "Thinking" pill in UI

     STAGE 6 — streamText() with 32 tools
        AsyncLocalStorage withToolContext({ threadId, env, signal,
                                            budgetSnapshot })
        stopWhen: stepCountIs(MAX_TOOL_ITERATIONS)
        tools invoked by id:
          get_price, get_candles, get_indicators, get_market_structure,
          get_session_levels, analyze_technical, analyze_fundamental,
          analyze_chart_image, annotate_chart, get_news, get_calendar,
          get_correlation, get_intermarket, get_seasonality, get_cot,
          forecast_volatility, get_intermarket_resonance,
          compute_risk, compute_position_health, verify_call,
          replay_setup, search_knowledge, summarize_thread,
          set_alert, log_journal, get_journal_stats, share_snapshot,
          convene_committee, get_system_diagnostics, run_system_action
        onFinish:
          - persist UIMessage
          - enforceCitations() — append data-citation-warning part
            if any unsupported price/event claim detected
          - chat_telemetry write
          - applyBudgetDelta() — reconcile reservation with real cost
          - waitUntil(runAutoTitleBackground()) — slow LLM title gen

     SSE stream → client
     |
     v
  [Client ChatScreen]
     - useChat appends tokens → re-renders message list
     - Auto-scroll: only if user within 240px of bottom
       (so they can read history without the page yanking)
     - Tool parts rendered as type-specific cards (parts/registry)
       each card: loading skeleton → done (data) → error
     - Empty chat shows QuickPrompts chips; clicking sends the chip
     - "Stop" button (Square) cancels stream
     |
     v
  [After status='ready']
     useEffect refetches /api/chat/threads/[id]
     picks up LLM-generated title (titleSource='llm')
     updates document.title and ChatTopBar
     |
     v
  (end) — user sees completed turn

  Error paths (each handled without crashing the stream):
    - 429 rate limit: error banner with Retry button
    - Budget exceeded: 503 with BUDGET_EXCEEDED code
    - Provider failure: tool card shows red error; other tools
      continue to work (mid-stream graceful degradation)
    - Citation guard fires: data-citation-warning part appears
      inline (yellow tone card) — doesn't block the answer
    - Network drop: error in ChatScreen state, "Retry" button
      re-sends lastUserTextRef


----------------------------------------------------------------------
2.4 Deep Link "Ask AI" (auto-submit prompt)
----------------------------------------------------------------------

  (start) any UI surface with an "Ask AI" affordance
     |
     v
  [Tap: "Ask about XAUUSD above 2400"]
     |
     |  navigation: /chat?prompt=<encoded>
     v
  /chat landing → /chat/page.tsx
     - auth check
     - if ?prompt= → createThread(userId) → redirect /chat/[id]?prompt=
     |
     v
  /chat/[threadId]?prompt=... → ChatScreen
     - useEffect: if thread empty AND not streamed AND not submitted
       for this threadId → sendMessage(prompt)
     - autoSubmittedRef guards: fires exactly once per thread
     |
     v
  [Normal chat turn pipeline (2.3)]


----------------------------------------------------------------------
2.5 Chart Page (live candles + indicators + overlays)
----------------------------------------------------------------------

  (start) /chart/[symbol]
     |
     v
  [RSC: chart/[symbol]/page.tsx]
     - isSymbol(symbol) → if not, notFound()
     - render <ChartView symbol={symbol} />
     |
     v
  [ChartView mount — client]
     - useTimeframe(): URL state ?tf= (default 1h)
     - useChartData(symbol, tf, indicators, 300, { enabled: visible })
       TanStack Query → GET /api/market/candles
         per-TF refetch:
           1m  → 5s
           5m-4h → 30s
           1d-1w → 5min
         adjacent TFs prefetched in background
         paused via IntersectionObserver when off-screen (128px root)
     - usePrice(symbol) → 1.5s polling → live tick merges into last candle
     - useStructure(symbol, tf) → SMC overlays (conditional fetch)
     - localStorage hfx_chart_config carries indicators + settings
     |
     v
  [Chart (lightweight-charts v5) renders]
     - candlestick series
     - dynamic decimal precision per symbol
     - sub-panes: RSI (70/30 OB/OS), MACD, ATR
     - 4 themes × 3 grid styles × custom bull/bear colors
     - timeseries synchronized across panes
     |
     v
  [Toolbar interactions]
     SymbolPicker   → /chart/XAUUSD | EURUSD | GBPUSD
     PriceTag       → live bid/ask + change vs reference
     TimeframePicker→ 1m | 5m | 15m | 30m | 1h | 4h | 1d | 1w
     StaleIndicator → pulses while fetching
     OverlaySheet   → SMC overlays: swings, BOS/CHoCH, FVG, OB, liquidity
     ChartSettings  → indicators + theme + grid
     "Pro" link     → /chart/[symbol]/pro (TradingView widget)

  Error states:
    - chart-empty.tsx → no data yet, friendly prompt
    - chart-error.tsx → fetch failed, retry CTA
    - chart-skeleton.tsx → shimmer while loading


----------------------------------------------------------------------
2.6 Alert Creation (two paths: form + chat)
----------------------------------------------------------------------

A. Alert form (direct)

  /alerts → tap "+ New alert"
     |
     v
  [AlertForm drawer]
     Step 1: rule type
       Segmented control: priceCross | candleClose | indicatorCross
     Step 2: symbol (default XAUUSD, prefilled if coming from chart)
     Step 3: depending on type:
       priceCross     → direction (above/below) + price
       candleClose    → + timeframe (1m..1w)
       indicatorCross → + indicator (rsi:14, ema:50, ema:200,
                         sma:50, atr:14) + cross direction + level
     Step 4: channels (toggle email/push) + optional note
     |
     v
  [POST /api/alerts]
     - withAuth → userId
     - zod parse { rule, channels, note }
     - createAlert({ userId, rule, channels, note })
     - returns 201 { alert }
     |
     v
  /alerts list refreshes; new alert appears
  Toast: "Alert created"

B. Chat-driven (natural language)

  User: "Alert me when XAUUSD closes above 2400 on the 1h"
     |
     v
  [runChat agent invokes set_alert tool]
     - tool validates symbol/tf/direction/threshold
     - createAlert({ userId, rule, channels: ['email'], note })
     - returns { alertId, describes }
     |
     v
  [ChatScreen renders SetAlertPart]
     - card: "🔔 Alert created" + describes string
     - deep link → /alerts?id=<alertId> (prefetched)

  Evaluation: cron worker runs /api/cron/alerts every minute
     - scans active alerts where rule matches latest tick/candle
     - on fire: dispatch via email (Resend) + push (web push)
     - marks alert as triggered (one-shot by default)


----------------------------------------------------------------------
2.7 Trade Journal
----------------------------------------------------------------------

  /journal
     |
     v
  [JournalView]
     - stats summary: win rate, avg R, expectancy
     - entries list (most recent first)
     - "+ New trade" button → JournalForm drawer
     |
     v
  [JournalForm fields]
     symbol, side (long/short), entry, stop, target, qty
     notes (free text), tags, screenshot (optional)
     |
     v
  [POST /api/journal]
     - zod parse + create
     - on close: log_journal tool fires → embed in memory index
     |
     v
  [List refreshes]
     - R-multiple auto-computed: (exit - entry) / (entry - stop)
       sign by side
     - stats update incrementally

  Chat-driven:
    User: "I just went long XAUUSD at 2398, stop 2395, target 2405"
    → log_journal tool → entry created
    → LogJournalPart card with link to /journal?id=<entryId>


----------------------------------------------------------------------
2.8 News & Calendar
----------------------------------------------------------------------

  /news
     - RSC fetches listRecentArticles(120)
     - SentimentSummary aggregates
     - NewsView (client) filters by sentiment, source, symbol
     - Each ArticleCard: bookmark toggle (localStorage hfx_news_bookmarks)
     - "Ask AI" button on card → /chat?prompt=<article context>
     - empty state + manual refresh → POST /api/cron/news

  /calendar
     - economic events filtered by watched currencies
     - EventCard: time (user tz from settings), impact (H/M/L),
       forecast/previous/actual, "Ask AI" deep link


----------------------------------------------------------------------
2.9 Settings & API Key Management
----------------------------------------------------------------------

  /settings (dashboard of cards)
     1. SystemStatusCard    → DB connectivity, worker health
     2. UsageGlance         → today's spend, remaining budget
     3. AgentCard           → AI provider routing + custom
                              instructions editor
                              writes localStorage hamafx:ai-prefs
     4. AIPrefsCard         → per-domain model override
     5. NotificationsCard   → push permission + subscribe
                              (POST /api/push/subscribe)
     6. PreferencesCard     → theme, reduce-motion, chart defaults
     7. DataCard            → export/clear personal data
     8. AboutCard           → version, build, links

  /settings/api-keys
     - grouped: Free tier (Google, Groq) | Paid tier (others)
     - ApiKeyCard per provider:
       * pre-fills current value (decryptByok)
       * password input + eye toggle
       * "Test" button → POST /api/settings/test-provider
       * save submits form → updateApiKeys server action
         → re-encrypt merged payload → DB update
         → revalidatePath

  /settings/agent
     - table of all 32 tools + last-24h count / failures / p50/p95
     - diagnostic value for power users

  /settings/usage
     - BudgetGauge (today's spend vs MAX_DAILY_USD)
     - 7-day bar chart (daily spend)
     - per-model breakdown table
     - recent turns list


----------------------------------------------------------------------
2.10 Share Snapshot (public read)
----------------------------------------------------------------------

  User in chat: "Share this analysis"
     |
     v
  share_snapshot tool → generate HMAC token, snapshot record (TTL)
     returns share URL: /share/[id]?t=<token>
     |
     v
  [Recipient visits link]
     |
     v
  /share/[id]/page.tsx (no auth required — bypasses middleware)
     - verifyShareToken(token, AUTH_COOKIE_SECRET)
       <-- invalid --> 401 page: "Link expired or invalid"
     - getActiveSnapshot(id)
       <-- not found / expired --> 410: "Snapshot not available"
     - <-- valid --> render ShareShell with title + body +
       optional overlay-on-chart preview (symbol/tf/markers/lines)
     |
     v
  (end) — public, read-only view of analysis


----------------------------------------------------------------------
2.11 Sign Out
----------------------------------------------------------------------

  NavDrawer → footer "Sign out"
     |
     v
  next-auth signOut()
     - clears session cookie (NextAuth handles JWT)
     - redirects to /login
     |
     v
  (end)


====================================================================
3. Interaction Details
====================================================================

3.1 Common UI primitives
------------------------
  TopBar             sticky glass pill, hidden on /chat
  ChatTopBar         replaces TopBar on /chat, same drawer context
  NavDrawer          left slide-in (vaul), single global instance
  Composer           sticky bottom: textarea + image + voice + send
  QuickPrompts       5 chips in empty chat state
  Tool card          loading skeleton → done (data) → error (red)
                     copy/edit/regenerate hover actions
  CitationWarning    yellow card appended when LLM cites numbers
                     without corresponding tool calls
  OfflineBanner      sticky pill, appears when SW detects offline
  Toaster            bottom-center sonner, success/error/info
  ConfirmDrawer      modal-style confirmation for destructive actions
  EmptyState         icon + title + description + optional CTA

3.2 Input validation points
---------------------------
  email              zod .email()
  password (login)   min 1
  password (reg)     min 8, bcrypt rounds = 10
  display name       min 2 chars
  API key            min 8 chars client-side + 8..512 server-side
  message text       max 8000 chars (soft 7500)
  image upload       max 4 images, 5 MB each, MIME validated
  alert note         max 280 chars
  share token        HMAC-SHA256, TTL set by tool caller

3.3 Feedback mechanisms
-----------------------
  Loading:
    - Button morphs to spinner + disabled
    - Form fields disabled during pending
    - TopBar streaming pill: "thinking…" + animated Sparkles
  Success:
    - sonner toast (bottom-center, auto-dismiss 4s)
    - Variant=success on button: green check + "Welcome back"
  Error:
    - Inline role="alert" message (red)
    - Tool card error state with red border
    - Toaster.error with description
  Streaming:
    - Tokens render inline as they arrive
    - Auto-scroll only when within 240px of bottom
    - Smooth scroll on new content; instant on mount
  Offline:
    - OfflineBanner sticky pill
    - SW falls back to cached /chat → /offline → 503


====================================================================
4. Edge Cases
====================================================================

4.1 Authentication
------------------
  - Cookie expired mid-session: next request → middleware redirect
    /login?next=<original URL> — original deep-link preserved
  - Login while already logged in: middleware sees isLoggedIn=true
    and lets the request through (no infinite redirect)
  - Logout while a chat is streaming: stream aborts (signal), error
    banner shown
  - Two browsers, same user: independent sessions (JWT strategy)

4.2 Onboarding
--------------
  - User closes tab on step 2: settings.onboardingCompleted=false,
    next visit to / redirects back to /onboarding step 1
  - Skip "Connect AI provider" step: empty apiKeys saved; first
    chat turn surfaces "no provider" → bounces to /settings/api-keys
  - Test Connection fails: user can edit key, switch provider, or
    skip (skip accepts the failure as a known state)

4.3 Chat
--------
  - Empty thread + ?prompt=: autoSubmittedRef ensures one-shot send
  - User scrolls up during streaming: page does NOT yank them back
    (distance > 240px guard)
  - Stream abort via Stop: useChat status='ready' immediately,
    partial response persisted as-is
  - Rate limit hit (30/min): 429 with Retry-After: 60 header;
    inline banner + Retry button re-sends last user text
  - Daily budget exhausted: 503 with BUDGET_EXCEEDED; UI shows
    "Resets at UTC midnight"
  - Provider failure mid-stream: tool card red, other tools
    continue (graceful degradation)
  - Citation violation: data-citation-warning part appended
    inline; user sees "Claim X is not supported by current data"
  - 8000-char limit reached: composer blocks further input,
    red soft-limit pill appears at 7500

4.4 Chart
---------
  - First load with no DB rows: chart-empty.tsx
  - Symbol outside universe (e.g. /chart/UNKNOWN): notFound() 404
  - Network drop while polling: TanStack Query retries 1× then
    surfaces chart-error.tsx
  - Off-screen chart: IntersectionObserver pauses polling,
    resumes on visibility

4.5 Alerts
----------
  - Duplicate rule (same symbol/tf/threshold): silently upserts
    (idempotent)
  - Alert fired + user offline: SW push notification wakes them;
    cron marks as triggered regardless of delivery success
  - User deletes account: alerts cascade delete via FK

4.6 Journal
----------
  - Open trade missing exit: stats ignore it (won't count as
    win/loss until closed)
  - Entry with negative R (loss): correctly aggregated in expectancy

4.7 Share
--------
  - Token tampered: HMAC fails → 401 "Link expired or invalid"
  - Snapshot expired (TTL passed): 410 "Snapshot not available"
  - Snapshot deleted by owner: same 410

4.8 Offline / PWA
-----------------
  - Cold open while offline: SW serves cached /chat, or /offline
    fallback if not precached
  - Slow network (3s+): SW timeout → cached page
  - API call while offline: SW bypasses cache; app surfaces
    network error; OfflineBanner shows


====================================================================
5. Visual Flow Diagrams
====================================================================

----------------------------------------------------------------------
5.1 First-Run Journey (register → onboarding → chat)
----------------------------------------------------------------------

   (start)
     |
     v
   [Visit /]
     |
     v
   <auth session?>
     |---no--->  [Visit /login] ---> <has account?>
     |                |                       |---yes---> loginAction
     |                |                       |              |
     |                v                       |              v
     |            [register form]             |        /onboarding
     |                |                       |              |
     |                v                       v              v
     |          registerAction ----> auto signIn -------> [wizard step 1]
     |                                                         |
     |                                                         v
     |                                                   [wizard step 2]
     |                                                         |
     |                                                         v
     |                                                   [wizard step 3]
     |                                                  /              \
     |                                            [test key]      [skip]
     |                                                |                |
     |                                                v                |
     |                                          [wizard step 4] <-----/
     |                                                |
     |                                                v
     |                                       completeOnboardingAction
     |                                                |
     |                                                v
     +--------------------------------------------> /chat/[new]
                                                          |
                                                          v
                                                       (end)

----------------------------------------------------------------------
5.2 Chat Turn Pipeline
----------------------------------------------------------------------

   (User clicks Send)
     |
     v
   [Composer builds message + files]
     |
     v
   [DefaultChatTransport.prepareSendMessagesRequest]
     |  injects X-CSRF-Token + X-AI-Prefs
     v
   [POST /api/chat] ---> Edge middleware
     |  (CSRF + auth + x-user-id)
     v
   <rate limit OK?>
     |---no---> [429 + Retry-After]
     |
     v
   [runChat pipeline]
     |
     |--1--> tryReserveBudget() -----<budget OK?>---no---> BudgetExceededError
     |                                                    |
     |--2--> appendUserMessage()                          v
     |                                              (503 BUDGET_EXCEEDED)
     |--3--> [history || liveSnapshot] (parallel)
     |
     |--4--> compactThread() ----<thread > 30 messages?>---yes---> rolling summary
     |
     |--5--> routeTurn() → resolveModel()
     |       |
     |       v
     |   <domain classification>
     |     fundamental → AI_FUNDAMENTAL_MODEL
     |     technical   → AI_TECHNICAL_MODEL
     |     summary     → AI_SUMMARY_MODEL
     |     vision      → AI_VISION_MODEL
     |     override    → modelOverride param
     |
     |--5b--> runPlanner() ---<planRequired?>---yes---> JSON plan
     |                                              (system message + UI pill)
     |
     |--6--> streamText() with 32 tools
     |       |
     |       v
     |   [tool call loop] (≤ MAX_TOOL_ITERATIONS)
     |       |
     |       v
     |   <tool name?>
     |     data tools   → fetch + return
     |     action tools → mutate DB (set_alert, log_journal, share_snapshot)
     |     committee    → multi-agent deliberation
     |
     v
   [SSE stream → ChatScreen]
     |
     v
   <status?='ready'>
     |---streaming---> [append tokens + render tool cards]
     |
     v
   [onFinish]
     - persist UIMessage
     - enforceCitations() → maybe append warning part
     - chat_telemetry write
     - applyBudgetDelta()
     - waitUntil(runAutoTitleBackground)
     |
     v
   (end — user sees complete turn)

----------------------------------------------------------------------
5.3 Alert Creation — Two Paths
----------------------------------------------------------------------

   (A) Direct form

   /alerts → [+ New alert]
     |
     v
   [AlertForm drawer]
     |
     v
   <rule type?>
     priceCross    → [price + direction]
     candleClose   → [price + direction + timeframe]
     indicatorCross→ [indicator + level + direction]
     |
     v
   [POST /api/alerts] → createAlert()
     |
     v
   /alerts list refreshes (toast: "Alert created")
     |
     v
   (cron /api/cron/alerts evaluates every minute)


   (B) Natural language via chat

   User message: "Alert XAUUSD above 2400"
     |
     v
   [runChat agent]
     |
     v
   <invoke set_alert tool>
     |
     v
   createAlert({ userId, rule, channels: ['email'] })
     |
     v
   [SetAlertPart card rendered]
     "🔔 Alert created — XAUUSD above 2400"
     deep link → /alerts?id=<alertId>
     |
     v
   (cron evaluates + notifies)


----------------------------------------------------------------------
5.4 Auth + Middleware Gate
----------------------------------------------------------------------

   (any incoming request)
     |
     v
   [Edge middleware matcher]
     excluded: /auth, /share, /api/auth, /api/cron, /api/telegram,
              sw.js, _next/static, icons, manifest, robots, sitemap
     |
     v
   [CSRF check] — POST/PUT/DELETE/PATCH on /api/*
     X-CSRF-Token header must == hfx_csrf cookie
     |---mismatch---> [403 Forbidden]
     |
     v
   [NextAuth authorized callback]
     <logged in?>
       |---no---> <on /login or /register?>
       |                |---yes---> [allow through]
       |                |---no----> [redirect /login?next=<original>]
       |---yes---> [allow through + inject x-user-id header]
     |
     v
   [Route handler runs]
     - getUserFromRequest() reads x-user-id header
     - 401 if missing
     - business logic


----------------------------------------------------------------------
5.5 Share Snapshot (public read)
----------------------------------------------------------------------

   Owner side:
     User in chat → "Share this analysis"
       |
       v
     [share_snapshot tool]
       - persist snapshot (id, ownerId, title, body, overlay?)
       - sign HMAC token with AUTH_COOKIE_SECRET
       - return URL: /share/[id]?t=<token>
       |
       v
     URL rendered in chat (copy affordance)

   Recipient side:
     (open URL)
       |
       v
     [Edge middleware] — /share/* excluded from auth gate
       |
       v
     [/share/[id]/page.tsx]
       |
       v
     <verifyShareToken(token, secret)?>
       |---no---> [401 "Link expired or invalid"]
       |
       v
     <getActiveSnapshot(id)?>
       |---no---> [410 "Snapshot not available"]
       |
       v
     [Render ShareShell]
       - title
       - body (whitespace-pre-wrap prose)
       - if overlay: symbol · tf pill row + marker/line counts
       - footer: "expires <ISO>"
       |
       v
     (end — public read)


----------------------------------------------------------------------
5.6 Decision Matrix — Symbol Routing
----------------------------------------------------------------------

                    +-------------------+
                    | user asks about ? |
                    +-------------------+
                              |
            +--------+-------+-------+----------+
            |        |       |       |          |
            v        v       v       v          v
         XAUUSD   EURUSD   GBPUSD   BTCUSD   no symbol
            |        |       |       |          |
            +--------+-------+-------+          v
                          |              <defaultSymbol?>
                          |                 |---yes---> use defaultSymbol
                          v                 |---no-----> ask in chat
                  [chat surface]
                          |
                          v
                  <pinnedSymbol set?>
                          |---yes---> composer placeholder
                          |              "Ask about XAUUSD…"
                          |---no-----> composer placeholder
                          |              "Ask about XAU, EUR, GBP…"
                          v
                  [QuickPrompts chips shown if thread empty]


----------------------------------------------------------------------
5.7 Chart Data Lifecycle
----------------------------------------------------------------------

   [ChartView mount]
     |
     v
   useTimeframe() ← URL ?tf= (default '1h')
     |
     v
   useChartData(symbol, tf, indicators, 300, { enabled: visible })
     |
     v
   <in view?>
     |---no---> [paused, no fetch]
     |---yes---> [TanStack Query: GET /api/market/candles]
                     |
                     v
                 <cache hit & fresh?>
                     |---yes---> [return cached]
                     |---no----> [fetch from BiQuote → Finnhub failover]
                                      |
                                      v
                                  <primary OK?>
                                      |---yes---> return
                                      |---no----> failover to next provider
                                                       |
                                                       v
                                                   <any provider OK?>
                                                       |---yes---> return
                                                       |---no----> 503 fallback
                                                                          |
                                                                          v
                                                                   chart-error.tsx
     |
     v
   usePrice(symbol) → 1.5s polling → tick merges into last candle
     |
     v
   useStructure(symbol, tf) → SMC overlay fetch (conditional)
     |
     v
   buildOverlays(structure, candles, palette, toggles)
     |
     v
   [Chart renders + auto-polls at TF interval]


====================================================================
6. Cross-cutting Concerns
====================================================================

6.1 Rate limits (defaults, env-tunable)
----------------------------------------
  ai_chat          30 / minute / user      AI_CHAT_RATE_LIMIT
  auth_login       10 / minute / email     LOGIN_RATE_LIMIT
  api_*            per-endpoint budgets    (route-specific)

6.2 CSRF
--------
  Cookie hfx_csrf (UUID, lax, secure-in-prod)
  Header X-CSRF-Token must match on POST/PUT/DELETE/PATCH to /api/*

6.3 Budget guard
----------------
  Daily cap MAX_DAILY_USD (env)
  tryReserveBudget atomic gate, $0.01 reservation per turn
  applyBudgetDelta reconciles on finish
  BUDGET_EXCEEDED 503 surfaces inline in chat

6.4 Tenant isolation
--------------------
  All user-data tables carry userId column
  Every query in /api/* route passes userId from session
  IDOR fixed in Phase B: getThread(userId, threadId) not getThread(id)

6.5 Telemetry
-------------
  chat_telemetry  per turn: model, tokens, cost, latency
  tool_telemetry  per tool call: count, failures, p50/p95 (24h window)
  Langfuse        optional OTel traces (when LANGFUSE_* set)

6.6 Accessibility
-----------------
  Skip-to-content link
  ARIA roles on nav, dialogs, alerts
  Keyboard hint on composer focus (desktop)
  Voice input has visible "Listening…" caption
  Reduced-motion respected (OS pref + manual override)


====================================================================
7. Quick Reference — URL → Component Map
====================================================================

  URL                          | Component                        | Notes
  -----------------------------|----------------------------------|------------------
  /                            | app/page.tsx                     | redirect only
  /login                       | (auth)/login/page.tsx            | NextAuth form
  /register                    | (auth)/register/page.tsx         | NextAuth form
  /onboarding                  | onboarding/page.tsx + wizard     | 4 steps
  /chat                        | (app)/chat/page.tsx              | redirect
  /chat/[threadId]             | (app)/chat/[threadId]/page.tsx  | ChatScreen
  /chart/[symbol]              | (app)/chart/[symbol]/page.tsx    | ChartView
  /chart/[symbol]/pro          | chart/[symbol]/pro/page.tsx      | TradingView widget
  /news                        | (app)/news/page.tsx              | NewsView
  /calendar                    | (app)/calendar/page.tsx          | EventList
  /alerts                      | (app)/alerts/page.tsx            | AlertList + form
  /journal                     | (app)/journal/page.tsx           | JournalView
  /settings                    | (app)/settings/page.tsx          | 8 cards
  /settings/api-keys           | settings/api-keys/page.tsx       | ApiKeyCard × 8
  /settings/agent              | settings/agent/page.tsx          | tool telemetry
  /settings/usage              | settings/usage/page.tsx          | budget + history
  /settings/profile            | settings/profile/page.tsx        | name/tz/symbol
  /settings/symbols            | settings/symbols/page.tsx        | watchlist
  /offline                     | (app)/offline/page.tsx           | SW fallback
  /share/[id]                  | share/[id]/page.tsx              | HMAC-gated
  /api/chat                    | api/chat/route.ts                | streaming SSE
  /api/chat/threads            | api/chat/threads/route.ts        | list + create
  /api/chat/threads/[id]       | api/chat/threads/[id]/route.ts   | get/rename/delete
  /api/market/{price,candles,indicators,structure}
                               | (4 route.ts files)               | cached
  /api/alerts                  | api/alerts/route.ts              | CRUD
  /api/journal                 | api/journal/route.ts             | CRUD
  /api/settings/test-provider  | api/settings/test-provider        | BYOK validation
  /api/upload                  | api/upload/route.ts              | Supabase upload
  /api/push/{subscribe,unsubscribe}
                               | api/push/...                     | web push
  /api/cron/*                  | api/cron/*                       | CRON_SECRET-gated
  /api/auth/[...nextauth]      | NextAuth                         | credentials


====================================================================
8. Appendix — File Locations
====================================================================

  Pages               apps/web/src/app/(auth)/, (app)/, share/, onboarding/
  Server actions      apps/web/src/app/(auth)/actions.ts
                      apps/web/src/app/onboarding/actions.ts
                      apps/web/src/app/(app)/settings/actions.ts
  API routes          apps/web/src/app/api/**/route.ts (31 endpoints)
  Middleware          apps/web/src/middleware.ts (Edge runtime)
  Auth split          apps/web/src/auth.ts (Node)
                      apps/web/src/auth.config.ts (Edge)
  Chat                apps/web/src/components/chat/{chat-screen,composer,
                        message-list,quick-prompts,chat-top-bar,parts/}
  Charts              apps/web/src/components/chart/{chart,chart-settings-
                        drawer,overlay-toggle,price-tag,symbol-picker,...}
  Nav                 apps/web/src/components/layout/{nav-drawer,
                        nav-drawer-context,top-bar,offline-banner}
  Settings            apps/web/src/app/(app)/settings/{page,api-keys,
                        agent,usage,profile,symbols}/page.tsx
  AI agent core       packages/ai/src/{agent,routing,model,byok-providers,
                        verification,rag,share/,snapshots/,tools/}
  DB schema           packages/db/src/schema.ts (22 tables)
  Shared types        packages/shared/src/{byok,encryption,schemas,...}
  Indicators          packages/indicators/src/ (SMA/EMA/RSI/MACD/SMC)
  Market data         packages/data/src/ (5 providers, cache, failover)
  Worker daemon       apps/worker/src/ (SignalR, cron, jobs)


End of document.
