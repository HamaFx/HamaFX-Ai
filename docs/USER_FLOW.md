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
    Uses all 30 tools. Reads committee deliberation. Cross-references
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

     STAGE 6 — streamText() with 30 tools
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
     - table of all 30 tools + last-24h count / failures / p50/p95
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
     |--6--> streamText() with 30 tools
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


====================================================================
7. UX Upgrades — Phase A/B/C Additions
====================================================================

After the multi-tenant migration (Phases A+B), the UX_UPGRADE_PLAN
spelled out 25 items across three phases. Phases A, B, and C are
complete and shipped; this section documents the resulting user
flows that didn't exist when sections 1-6 were written.

The plan itself is `docs/UX_UPGRADE_PLAN.md`; this section is a
flow-level summary.

7.1 Composer Surface (Phase A — items 1, 2, 3, 6)
-------------------------------------------------

Character count, prompt presets, and quick prompts. All four live
in `apps/web/components/chat/composer.tsx`.

  (start) Focus on the composer
     |
     v
  [charCount visible in bottom-right, always]
     - 0..2,400 chars   : muted gray ("1248 / 4000")
     - 2,400..3,800     : amber ("3588 / 4000")
     - 3,800..4,000     : red  ("3912 / 4000")
     - >4,000           : blocked, send button disabled
     |
     v
  [Quick prompts above composer, context-aware]
     - Pinned symbol (XAUUSD) -> 4 prompts (RSI, structure, news, levels)
     - Session (asian/london/ny/closed) -> session-specific prompts
     - 30 prompts in 10 sets total, keyed by (session, pin)
     |
     v
  [Custom instructions chips in /settings/agent]
     - "Be concise" / "Be technical" / "Challenge my bias" / "Cite inline"
     - Click to toggle, persisted to userSettings.customInstructions
     |
     v
  [Submit -> /api/chat]


7.2 Thread Sidebar (Phase A — items 4, 5, 7)
--------------------------------------------

Pin symbols, bulk delete, and the provider health badge.

  (start) Sidebar in chat-top-bar.tsx
     |
     v
  [Symbol pin affordance]
     - Each thread shows its pinnedSymbol (or "—")
     - Click to unpin; the chip at top is clickable on chart pages
     |
     v
  [Multi-select mode]
     - "Select" button in the sidebar header
     - Tap any thread to mark it (checkbox appears)
     - "Delete selected" enabled at 1+ selection
     - 50 thread cap (zod), 10 deletes/min rate limit
     |
     v
  [Provider health badge in /settings/api-keys]
     - 8x8px dot next to provider name
     - Green (<1h ago, ok) / amber (<24h) / red (>24h) / gray (never tested)
     - Reads from provider_tests table


7.3 Onboarding Wizard (Phase A + Phase C — items 4, 16)
------------------------------------------------------

The 4-step wizard and the per-provider tooltip.

  (start) /onboarding (first login)
     |
     v
  [Step 1: name + timezone] -> [Step 2: default symbol]
     |
     v
  [Step 3: pick a provider]
     - 8 providers, each card shows displayName + description
     - <ProviderInfoDot> icon next to name; hover for tooltip
       "Best for: <bestFor> · Supports: Vision, Embeddings"
     - <HealthBadge> dot on previously-tested providers
     |
     v
  [Step 4: API key entry]
     - Input with keyHint placeholder (e.g. "AIza…")
     - Reveal/hide toggle
     - "Test connection" button -> POST /api/settings/test-provider
       - 200 ok -> "Looks valid" pill
       - 4xx -> inline error with retry
     |
     v
  [Complete -> redirect to /chat]


7.4 Power-User Tools (Phase B — items 11, 12, 14)
--------------------------------------------------

The cmd-K palette, PWA install nudge, and thread export.

  (start) Anywhere on the app
     |
     v
  [Press Cmd+K (mac) / Ctrl+K (windows)]
     |
     v
  [Command palette opens]
     - Fuzzy-matched list of ~25 commands
     - Groups: Navigation / New chat / Settings
     - Up/Down to navigate, Enter to run, Esc to close
     - Touch fallback: floating action button bottom-right
     |
     v
  [/chat/$threadId → open thread menu]
     - "Export as Markdown" -> GET /api/chat/threads/[id]/export
       - text/markdown, attachment disposition
       - Rate-limited (10/min), 500-msg cap with truncation note
     |
     v
  [PWA install nudge]
     - Chrome on Android/desktop: listens for beforeinstallprompt
     - iOS Safari: text-only hint with Share -> Add to Home Screen
     - Dismiss cap = 3; after 3 dismisses the nudge stops


7.5 Model Override + Auto-Fallback (Phase B — items 8, 15)
---------------------------------------------------------

The "Regenerate with..." popover and the fallback marker.

  (start) Assistant message hover
     |
     v
  [Click chevron on the right side of the regenerate button]
     |
     v
  [Popover shows 3 hardcoded REGEN_MODELS]
     - Currently: gemini-3.1-pro / gemini-3.5-flash / gemini-2.5-flash
     - <-- TODO: dynamic provider tabs from /api/me/keys
     |
     v
  [User picks a model]
     |
     v
  [resolveOverrideModel(override) called in agent.ts]
     - "provider:model" or "provider" syntax
     - Looks up BYOK key + env fallback
     - Returns LanguageModel + modelId
     |
     v
  [streamText starts. On recoverable failure:]
     - classifyStreamError() — 401/403/429/5xx/timeout are recoverable
     - Falls back to AI_DEFAULT_MODEL
     - Appends data-fallback part to the assistant message
     - UI shows amber card: "Override unavailable, used gemini-2.5-flash"
     - User sees which provider failed and which one answered


7.6 Citation Drill-Down (Phase B — item 9)
------------------------------------------

The inline findings list inside citation warning cards.

  (start) Assistant turn ends
     |
     v
  [enforceCitations() runs in agent.ts onFinish]
     - Scans the streamed text for unsupported claims
     - Calls collectFindings() — per-claim { text, supported, supportingTool }
     |
     v
  [If claims are unsupported: append data-citation-warning part]
     - Schema: { kind, summary, findings?[] }
     - findings optional for backward compat with old data
     |
     v
  [CitationWarningPartView renders the findings list]
     - Each row: claim text, "supported" / "no tool source" pill
     - Collapsed by default; click to expand
     - Thread export renders findings as a markdown bullet checklist


7.7 Alert Preview (Phase B — item 10)
-------------------------------------

"Would this have fired?" — a debounced live preview.

  (start) /alerts/new
     |
     v
  [User picks rule type, symbol, timeframe, level]
     |
     v
  [400ms debounce -> POST /api/alerts/preview]
     - priceCross + candleClose: scanned over candles_1m
     - indicatorCross: returns { unsupported: true } (v1 best-effort)
     - Returns { count, avgHoldMs }
     |
     v
  [PreviewCallout renders below the form]
     - "Fires ~X times in the last Y days, avg hold 2h 14m"
     - "Preview unavailable for indicator rules (v1)" for unsupported
     - Loading spinner during the 400ms debounce


7.8 Journal Stats Depth (Phase B — item 13)
-------------------------------------------

The new stats tiles and per-day-of-week chart on /journal.

  (start) /journal
     |
     v
  [GET /api/journal?stats=1]
     - summarize() computes the extended metrics:
       longestWinStreak, longestLossStreak, maxDrawdownR,
       profitFactor, avgHoldMs, perDayOfWeek
     - profitFactor = null when only wins (no losses) — not Infinity
     - avgHoldMs = 0 when no closed trades
     |
     v
  [StatsSummary renders 3 new tiles + DoW chart]
     - "Win Streak"  — longest consecutive wins (breakevens don't reset)
     - "Loss Streak" — longest consecutive losses
     - "Avg Hold"    — formatted as 14m / 2h 14m / 3d
     - 7-bar chart "Closed by day of week"
     - Hidden when the migration hasn't run yet (hasExtendedStats check)


7.9 Reduced Motion (Phase C — item 18)
---------------------------------------

The OS-level override + motion-safe: tagging convention.

  (start) User enables "Reduce motion" at OS level
            OR sets the in-app /settings/agent preference
     |
     v
  [globals.css: prefers-reduced-motion: reduce media query]
     - All animations/iterations reduced to 0.01ms
     - Transitions reduced to 0.01ms
     - scroll-behavior: auto
     |
     v
  [User-forced toggle: data-reduce-motion="force" on <html>]
     - Same CSS rules apply
     - Set via the preferences card in /settings/agent
     |
     v
  [Convention for new animations (docs/15-motion-conventions.md)]
     - Decorative: prepend motion-safe: (e.g. motion-safe:animate-pulse)
     - Functional: gate on useReducedMotion() and short-circuit to instant
     - Grep guard: any animate-* without motion-safe: is flagged


7.10 Alert Snooze (Phase C — item 17)
-------------------------------------

The snooze field and the cron re-fire logic.

  (start) /alerts/new or existing alert
     |
     v
  [User sets "Re-arm after (hours, 0 = one-shot)"]
     - 0 = one-shot (legacy behavior)
     - 1..168 = re-fire window
     - 168 = 1 week max
     |
     v
  [POST /api/alerts with snoozeHours in the body]
     - zod schema: 0..168 integer
     - createAlert clamps + writes
     - Migration 0011_alert_snooze.sql adds the columns
     |
     v
  [Cron evaluates as before]
     - listEvaluable pulls active + unfired rows
     - isInSnooze(alert, now) filters dormant alerts
       (lastFiredAt + snoozeHours interval > now)
     |
     v
  [On a recoverable fire: markFiredForAlert()]
     - snoozeHours === 0: markFired() — sets firedAt, deactivates (legacy)
     - snoozeHours >  0: markFiredSnoozed() — sets lastFiredAt, keeps active
     |
     v
  [Snoozed alert becomes eligible to re-fire after the window]
     - Next listEvaluable tick includes it again
     - User gets re-notified, repeat cycle continues


7.11 Edit-in-Place Fork (Phase C — item 19)
-------------------------------------------

Editing a non-last user message creates a new thread.

  (start) User hovers a non-last user message
     |
     v
  [Click pencil icon]
     |
     v
  [Edit textarea opens with the current text]
     - User edits the text
     - Clicks "Save & Submit"
     |
     v
  [ChatScreen onEdit handler runs]
     - Checks if edited message is the LAST message
     - LAST: legacy in-place (slice + sendMessage)
     - NOT LAST: POST /api/chat/threads/fork
       - sourceThreadId, atMessageId, newText
       - csrf token required
     |
     v
  [forkThread() in packages/ai]
     - IDOR-checked source fetch (scoped by userId)
     - Verifies atMessageId is a user-role message
     - Transactional: creates new thread + copies messages
       up to and including the edit point
     - newText replaces the edited message content
     - Original thread is NEVER mutated
     - Title derived from newText (truncated to 80 chars)
     |
     v
  [Client receives { threadId: newId }]
     - toast.success('Forked into a new thread')
     - router.push(`/chat/${newId}`)
     |
     v
  [User is on the new thread; original stays in the sidebar]


7.12 Tooltips on Provider Cards (Phase C — item 16)
---------------------------------------------------

The small (i) icon next to each provider name.

  (start) /onboarding (step 3) OR /settings/api-keys
     |
     v
  [ProviderInfoDot rendered next to each name]
     - Icon = <Info size={12} />
     - aria-label = full tooltip text (period-separated for SR)
     - onClick stopPropagation (doesn't trigger card button)
     |
     v
  [Tooltip text format:]
     "Best for: <bestFor> · Supports: Vision, Embeddings"
     - bestFor from BYOK_PROVIDERS (e.g. "Free tier + vision")
     - Supports listed only when at least one flag is true
     - Falls back to description when both are absent
     - Order: Vision first, then Embeddings


Cross-references
----------------

  - docs/UX_UPGRADE_PLAN.md — full plan, status table, deferred items
  - docs/15-motion-conventions.md — item 18 developer convention
  - apps/web/components/ui/provider-info-dot.tsx — item 16 component
  - apps/web/src/app/api/chat/threads/{fork,[id]/export} — items 14, 19
  - apps/web/src/components/layout/command-palette.tsx — item 11
  - apps/web/src/components/layout/install-nudge.tsx — item 12
  - apps/web/src/components/chat/quick-prompts.tsx — item 3
  - packages/ai/src/alerts/persistence.ts — items 7, 17
  - packages/ai/src/journal/persistence.ts — item 13


7.13 Provider Key Management Overhaul (Phase D)
------------------------------------------------

Phase D extends the api-keys page with three new flows: Vertex AI
BYOK (GCP service-account JSON), per-provider usage breakdown, and
a one-click "Test all" button. Plus an aesthetic pass that splits
the page into "Configured" and "Available" sections.

  (start) /settings/api-keys
     |
     v
  [Page renders three sources in parallel]
     - userSettings.aiApiKeys (decrypted) -> which keys are set
     - providerTests rows                 -> latest health snapshot
                                            per (user, provider)
     - computeUsage(userId)               -> byProvider breakdown
                                            (turns + costUsd per
                                            canonical BYOK id)
     |
     v
  [Header chips]
     - "N / 9 configured"
     - "M failing" (only when M > 0)
     - "T turns · $X this month"  (last 30 days, all providers)
     - "Test all" button  -> POST /api/settings/bulk-test
                              (rate-limited 2/5min/user)
     |
     v
  [Empty state when 0 keys configured]
     - Friendly CTA pointing at the free-tier providers
     - "Google Gemini · free" + "Groq · free" pills
     - "+ 7 paid options"
     - Skipped automatically when at least 1 key is set
     |
     v
  [Configured section]
     - One card per provider that has a saved key
     - Each card shows:
        * <StatusPill>          (OK / Failed / Not set / Saved)
        * <ProviderInfoDot>     (Phase C tooltip)
        * <UsageBadge>          (turns + cost from computeUsage)
     - <BulkTestButton> overlay in the header runs the same
       bulk endpoint
     |
     v
  [Available section]
     - One card per provider without a saved key
     - Same card layout (StatusPill shows "Not set")
     - Empty input, ready for paste


7.14 Vertex AI as BYOK Provider (Phase D — Vertex)
--------------------------------------------------

Vertex AI is the 9th BYOK provider. Distinct from `google` (the
public Gemini API) because:

  - Auth: GCP service-account JSON (not an AIza… key)
  - SDK: @ai-sdk/google-vertex (not @ai-sdk/google)
  - Billing: GCP project quota (not Google AI billing)
  - Models: same gemini-2.5-pro / -flash / -flash-lite / etc.

  (start) User picks "Google Vertex AI" on /settings/api-keys
     |
     v
  [Card renders a textarea instead of an input]
     - placeholder shows a fully-formed service-account JSON skeleton
     - monospace font, 6 rows, resize-y enabled
     |
     v
  [User pastes the service-account JSON file content]
     - The card parses it live and shows preview chips:
       client_email: <value>  (monospace)
       project_id:    <value>  (monospace)
     - If JSON is invalid, the preview shows the parse error
     - If client_email / project_id are both missing, the preview
       shows a "missing X and Y" hint
     |
     v
  [User clicks "Test connection"]
     - POST /api/settings/test-provider with provider='vertex'
     - Zod min length = 256 chars (real SA JSON is ~2 KB)
     - Server-side shape validation in testProviderKey:
        * parse JSON -> 400 if not parseable
        * require client_email + '@'                -> 400
        * require private_key with "BEGIN PRIVATE KEY" -> 400
        * require project_id or GOOGLE_VERTEX_PROJECT env -> 400
     - Returns 200 ok or 4xx with the specific missing field
     |
     v
  [User clicks "Save Keys"]
     - The textarea content (raw JSON) is encrypted with the
       rest of the BYOK payload (AES-256-GCM)
     - Subsequent chat turns route through Vertex when the model
       id prefix is 'google-vertex/' (handled in packages/ai/
       src/agent.ts via resolveOverrideModel + the default
       routing path)


7.15 Bulk-Test All Providers (Phase D — Bulk Test)
---------------------------------------------------

  (start) User clicks "Test all" on /settings/api-keys
     |
     v
  [POST /api/settings/bulk-test]
     - Rate-limited: 2 calls / 5 minutes / user
     - Iterates every PROVIDER_ID in declaration order
     - Skips providers without a saved key (status='missing')
     - Runs testProviderKey for each configured key in parallel
       via Promise.all
     - Persists the result by upserting the provider_tests table
       (wipe + insert per user — snapshot semantics, not event log)
     |
     v
  [BulkTestButton parses the response]
     - summary.ok === 0           -> toast.error("N providers failed")
     - summary.failed === 0       -> toast.success("All N providers ok")
     - summary.ok > 0 && failed > 0 -> toast.warning("M ok, N failed")
     - Inline next to the button: "M/(N-M) ok" with a green/red dot
     |
     v
  [Server action runs in parallel to persist health rows]
     - The button triggers the page server action `bulkTestAll`
       (re-validates the path so each <StatusPill> re-renders)
     - Page re-renders with the new health snapshots


Cross-references (Phase D)
---------------------------

  - docs/UX_UPGRADE_PLAN.md — full plan, status table, deferred items
  - docs/15-motion-conventions.md — item 18 developer convention
  - apps/web/components/ui/provider-info-dot.tsx — item 16 component
  - apps/web/components/ui/health-tone.ts — pure tone decider
                              (Phase D — status pill rules)
  - apps/web/app/api/settings/{catalog,usage-by-provider,
                              bulk-test,test-provider}/route.ts
  - apps/web/app/(app)/settings/api-keys/_components/
      api-key-card.tsx          — per-provider card
      bulk-test-button.tsx      — "Test all" button
  - packages/ai/src/byok-providers.ts — 9-provider registry
  - packages/ai/src/usage.ts — providerIdFromModel helper +
                                 per-provider aggregation in
                                 computeUsage
  - packages/ai/src/model.ts — testProviderKey with vertex-specific
                               shape validation
  - packages/shared/src/byok.ts — PROVIDER_IDS now 9 entries;
                                    vertex?: string in ByokPayload


=================================================================
7.16 Model Picker Overhaul (Phase E)
=================================================================

The model picker used to be a hardcoded list of three Gemini
variants in the chat regen popover. It's now a structured
picker backed by the full provider × model catalog with
per-domain defaults.

  (start) User navigates to /settings/models
     |
     v
  [Catalog endpoint hits]
     - GET /api/settings/catalog
       • Returns every provider × model pair (60+ models across 9
         providers) with full metadata: context window, USD/Mtok
         pricing, capability flags (vision / tools / jsonMode /
         streaming), release date, tier (flagship / pro / fast /
         lite / embedding)
       • Per-provider key-presence + latest health snapshot from
         provider_tests (no need to re-probe every model)
       • Per-domain default (already merged with user override)
     - GET /api/settings/default-model
       • Returns user's per-domain override map
     |
     v
  [ModelsBrowser renders two tabs]
     - "By purpose" tab — 5 sections (deep reasoning / technical /
       quick summary / vision / embeddings), each a grid of model
       cards from every provider that supports that domain.
       Sorted: provider-with-key first, then by tier order.
     - "By provider" tab — 9 collapsible provider cards, each
       showing every model that provider serves.
     - Search bar filters across model id / label / description /
       provider name
     |
     v
  [User picks "Set as default for technical"]
     - POST /api/settings/default-model
       body: { action: "set", domain, providerId, modelId }
     - Server validates the model id exists in the catalog
     - Persists to user_settings.default_models (JSONB column)
     - Returns { defaults: { technical: "anthropic:claude-sonnet-4-5" } }
     |
     v
  [UI updates inline — "✓ Active" pill, "Reset" link]
     |
     v
  [Next chat turn resolves via resolveUserModel]
     - Reads userSettings.defaultModels[domain] FIRST
     - If user override exists AND override's provider has a key,
       uses that model
     - Otherwise falls back to the spec default for the routed
       provider
     |
     v
  (end) Future chat turns route through the user's chosen default


7.17 Chat Regen Popover (Phase E)
---------------------------------

The "Regenerate with…" popover on each assistant message used
to show three fixed Gemini options. It now uses the same
`<RegenModelPicker>` client component, populated live from the
catalog endpoint:

  (start) User hovers an assistant message → clicks chevron
     |
     v
  [Popover opens with two sections]
     - "My defaults" — the user's per-domain overrides rendered
       as one-click shortcuts ("Deep reasoning → Anthropic
       Claude Sonnet 4.5" etc.)
     - "All configured models" — every model from every provider
       the user has a key for, grouped by provider, with tier label
       and price. Only configured providers appear (you can't pick
       a model you can't actually call).
     |
     v
  [User clicks a row]
     - onPick(modelId) → calls chat-screen's onRegenerate handler
       with { modelOverride: modelId }
     - Popover dismisses
     - Next chat turn uses the picked model for that thread
     |
     v
  (end) The original thread stays in the sidebar with its prior
        model — regen only affects new turns


Backend architecture
--------------------

  packages/ai/src/byok-providers.ts
    - ByokProviderSpec now carries a `models?: ModelSpec[]` field
      listing every model the provider serves with metadata
      (pricing, context window, capabilities, release date, tier)
    - All 9 providers are populated. OpenRouter has a curated
      subset of cross-provider models (Claude Sonnet 4.5 via
      Anthropic, GPT-4.1 via OpenAI, etc.).
  packages/ai/src/model.ts
    - resolveUserModel now takes userSettings with `defaultModels`
    - User overrides win over spec defaults when both are present
    - Overrides can point at a different provider than the one the
      routing picks — as long as that provider has a configured key,
      the resolver uses it. Otherwise it falls back to the routed
      provider's spec default.
  packages/shared/src/byok.ts
    - New client-safe types: CatalogResponse, ProviderMeta,
      CatalogModel, DefaultModels, DefaultModelResponse
    - The ProviderMeta.defaultModels field now reflects user
      overrides merged with spec defaults (server-side)
  apps/web/src/app/api/settings/catalog/route.ts
    - GET returns the rich catalog (providers + domains + model lists)
  apps/web/src/app/api/settings/default-model/route.ts (NEW)
    - GET  → user's per-domain override map
    - POST → set a default (validated against the catalog)
    - DELETE → clear a single override (query param `domain`)

Frontend architecture
---------------------

  apps/web/src/app/(app)/settings/models/page.tsx (NEW)
    - Server shell: auth + parallel fetch of catalog + defaults
    - Hands off to <ModelsBrowser>
  apps/web/src/app/(app)/settings/models/_components/models-browser.tsx (NEW)
    - Client component: tabs, search, model cards, set-default action
    - <ProviderCard>, <ModelCard>, <ActivePill>, <EmptyState>
  apps/web/src/components/chat/_components/regen-model-picker.tsx (NEW)
    - Lazy-fetches the catalog on popover-open
    - Renders user defaults + per-provider model list
  apps/web/src/components/chat/message.tsx
    - REGEN_MODELS hardcoded array removed
    - Popover body now hosts <RegenModelPicker>


End of document.
