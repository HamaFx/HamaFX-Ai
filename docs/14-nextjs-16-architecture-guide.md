# Kestrel Next.js 16 & React 19 Architecture Guide, Best Practices, and Modernization Roadmap

> **Authoritative Technical Standard & Modernization Blueprint for Kestrel (`apps/web`)**  
> **Framework Baseline**: Next.js 16 (`16.3.2`) · React 19 (`19.2.8`) · Turbopack · Mastra · Vercel AI SDK v5 · Drizzle ORM (`0.45.2`) · Tailwind CSS v4 (`4.3.3`)  
> **Document Status**: Production Architecture Standard & Modernization Roadmap  
> **Last Updated**: 2026-08-22  

---

## 1. Executive Summary & Technology Stack Overview

### 1.1 Project Identity & Scope
**Kestrel** is an open-source, multi-tenant, chat-driven AI trading copilot engineered for high-frequency financial intelligence across **Gold (XAUUSD)**, a canonical **Forex catalog**, and supported **Binance Crypto pairs**. The platform delivers real-time market telemetry, autonomous multi-agent research workflows, technical pattern recognition, and risk management through a Progressive Web Application (PWA) powered by Next.js 16 App Router and React 19.

The web tier (`apps/web`) acts as the user-facing interface and secure API gateway, interfacing with:
1. A persistent Node.js worker daemon (`apps/worker`) that ingests 1Hz tick data from SignalR/WebSocket providers into PostgreSQL.
2. A multi-agent AI runtime (`packages/ai`) built on **Mastra** workflows and the **Vercel AI SDK v5** model transport, supporting 31 read-only financial tools, domain-based model routing, and verification pipelines.
3. A resilient database access layer (`packages/db`) using **Drizzle ORM** targeting Supabase PostgreSQL with vector similarity search (`pgvector`) and an embedded **PGlite** WASM fallback for zero-setup local development.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 KESTREL ARCHITECTURE TOPOLOGY                           │
└────────────────────────────────────────────────────────────────────────────────────────┘

 [ Client Browser / PWA ] ──── (HTTPS / WSS / SSE)
            │
            ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │ apps/web: Next.js 16 App Router + React 19 + Turbopack                               │
 │                                                                                      │
 │  ┌────────────────────────────────────────────────────────────────────────────────┐  │
 │  │ Request Proxy (src/proxy.ts): Edge-Safe (<2ms)                                 │  │
 │  │  • Double-Submit CSRF Validation (__Host-hfx_csrf)                             │  │
 │  │  • Strict-Dynamic CSP Nonce Generation (x-csp-nonce)                           │  │
 │  │  • NextAuth v5 JWT Verification & HMAC-SHA256 Header Signing (x-user-id)       │  │
 │  └──────────────────────────────────────┬─────────────────────────────────────────┘  │
 │                                         │                                            │
 │                     ┌───────────────────┴────────────────────┐                       │
 │                     ▼                                        ▼                       │
 │    ┌───────────────────────────────────┐    ┌───────────────────────────────────┐    │
 │    │ Server Actions ('use server')     │    │ Route Handlers (/api/*)           │    │
 │    │  • User Preferences & Settings    │    │  • /api/chat (SSE Mastra Stream)  │    │
 │    │  • Alerts & Watchlist CRUD        │    │  • /api/market/price (Fast SWR)   │    │
 │    │  • Chat Thread Fork / Delete      │    │  • /api/cron/* (Secret-Guarded)   │    │
 │    │  • Auth / TOTP 2FA Verification   │    │  • /api/billing/webhook (HMAC)    │    │
 │    └─────────────────┬─────────────────┘    └─────────────────┬─────────────────┘    │
 │                      │                                        │                      │
 │                      ▼                                        ▼                      │
 │    ┌────────────────────────────────────────────────────────────────────────────┐    │
 │    │ Cached Data Access Layer (DAL) - React cache() & 'use cache' (api-boundary)│    │
 │    └─────────────────┬────────────────────────────────────────┬─────────────────┘    │
 └──────────────────────┼────────────────────────────────────────┼──────────────────────┘
                        │                                        │
                        ▼                                        ▼
 ┌────────────────────────────────────────┐    ┌────────────────────────────────────────┐
 │ packages/ai (Mastra AI Agent Core)     │    │ packages/db (Drizzle ORM)              │
 │  • 31 Read-Only Registered Tools       │    │  • Supabase Postgres + pgvector        │
 │  • Plan-Then-Act & Routing Pipeline    │    │  • PGlite (WASM local DB)              │
 │  • Atomic Budget Guard (reserveBudget) │    │  • 50 Tables / 35 Schema Modules       │
 │  • Citation Enforcement Fact-Check     │    │  • Connection Pooling (prepare: false) │
 └────────────────────────────────────────┘    └────────────────────────────────────────┘
                        ▲                                        ▲
                        │                                        │
 ┌──────────────────────┴────────────────────────────────────────┴──────────────────────┐
 │ apps/worker (Node.js Background Daemon)                                              │
 │  • SignalR Consumer ──▶ 1Hz TickBuffer ──▶ live_ticks                                │
 │  • Candle1mAggregator ──▶ candles_1m (UPSERT on bar close)                           │
 │  • Docker Internal Scheduler ──▶ CoT, Snapshot, Macro, & Briefing Jobs               │
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 1.2 Technology Stack & Dependency Baseline

The following baseline defines the verified production package inventory across `apps/web`:

| Ecosystem Layer | Package / Tool | Version | Architectural Responsibility |
|---|---|---|---|
| **Core Framework** | `next` | `^16.3.2` | App Router, Server Actions, Turbopack compilation, Async Request APIs |
| **UI Library** | `react` / `react-dom` | `^19.2.8` | React Server Components, `useActionState`, `useOptimistic`, `useTransition`, `cache()` |
| **Authentication** | `next-auth` | `5.0.0-beta.32` | JWT session management, Credentials provider, TOTP 2FA, Edge-safe auth config |
| **Auth Adapter** | `@auth/drizzle-adapter` | `^1.11.3` | Multi-tenant Drizzle user and session mapping (`@auth/core` pinned to `0.41.3`) |
| **Database ORM** | `drizzle-orm` | `^0.45.2` | Type-safe SQL builder, schema declarations, migration management |
| **AI SDK & Streaming** | `ai` / `@ai-sdk/react` | `^5.0.0` / `^2.0.0` | Vercel AI SDK model transport, streaming hooks (`useChat`), UI message parts |
| **AI Framework** | `@mastra/core` | Workspace (`@kestrel/ai`) | Autonomous multi-agent workflows, tool execution loops, deterministic evaluators |
| **Styling & Design** | `tailwindcss` | `^4.3.3` | Tailwind CSS v4 engine, `@tailwindcss/postcss`, theme token variables |
| **Icons & Motion** | `@tabler/icons-react` / `motion` | `^3.31.0` / `^12.40.0` | Tree-shaken icon library, fluid hardware-accelerated UI transitions |
| **Financial Charting** | `lightweight-charts` | `^5.0.4` (`5.2.0`) | High-performance HTML5 Canvas candlestick and technical indicator rendering |
| **Client State** | `@tanstack/react-query` / `nuqs` | `^5.66.0` / `^2.2.3` | Server state management, SWR caching, type-safe URL search param state |
| **Observability** | `@sentry/nextjs` | `^10.69.0` | Production error tracking, Server Action tracing, performance instrumentation |
| **Monorepo Engine** | `turbo` / `pnpm` | `^2.10.9` / `9.15.4` | Workspace task pipelines, caching, strict dependency isolation |

---

### 1.3 Core Architectural Thesis

The goal of this architectural blueprint is to elevate Kestrel's web tier from a mixed App Router / REST implementation to a state-of-the-art **Next.js 16 and React 19 architecture**. 

Key modernization imperatives include:
1. **Sub-15ms TTFB via Partial Prerendering (PPR)**: Decomposing synchronous layout blocks so static navigation shells flush instantly while dynamic user sessions and ambient market tickers stream in parallel Suspense boundaries.
2. **First-Party Mutation Ergonomics with Server Actions**: Replacing ~30 boilerplate internal REST endpoints with type-safe Server Actions that integrate directly with React 19's `useActionState`, `useOptimistic`, and automatic CSRF handling.
3. **Targeted Caching via Modern Dynamic IO (`use cache`)**: Eliminating blunt, blanket `force-dynamic` exports and replacing them with granular function-level caching (`cacheTag`, `cacheLife`) for shared macro, news, and catalog data.
4. **Zero-Overhead Request-Scoped Deduplication**: Wrapping Data Access Layer (DAL) fetchers in React `cache()` to completely eliminate duplicate database roundtrips between `generateMetadata` and Page rendering passes.
5. **Optimized Bundle Splitting**: Refactoring the 31-tool AI chat registry and desktop split-chart widgets into dynamically imported chunks, reducing initial JavaScript payloads by >45%.
6. **Hardened Request Proxy Security**: Preserving Kestrel’s lightweight, Edge-safe `proxy.ts` request boundary with HMAC-SHA256 signed headers, per-request CSP nonces, and double-submit CSRF enforcement.

---

## 2. Next.js 16 & React 19 Core Architecture Patterns

### 2.1 Server Actions vs Route Handlers Demarcation

Next.js 16 establishes a definitive boundary between **Server Actions** (internal UI-driven Remote Procedure Calls) and **Route Handlers** (standard HTTP REST/SSE endpoints). 

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                     NEXT.JS 16 SERVER ACTIONS VS ROUTE HANDLERS                         │
└────────────────────────────────────────────────────────────────────────────────────────┘

              ┌────────────────────────────────────────────────────────┐
              │                 INCOMING USER REQUEST                  │
              └───────────────────────────┬────────────────────────────┘
                                          │
                  Is this an internal UI-driven state mutation?
                                          │
                     ┌────────────────────┴────────────────────┐
                     │ YES                                     │ NO
                     ▼                                         ▼
      ┌──────────────────────────────┐          ┌──────────────────────────────┐
      │   SERVER ACTION ('use server')│          │    ROUTE HANDLER (route.ts)  │
      ├──────────────────────────────┤          ├──────────────────────────────┤
      │ • Executed via Next.js RPC   │          │ • Standard HTTP GET/POST/etc │
      │ • Automatic CSRF validation  │          │ • Manual HMAC/Bearer auth    │
      │ • React 19 useActionState    │          │ • Event-Stream / SSE / WS    │
      │ • Optimistic UI updates      │          │ • Webhooks & Cron triggers   │
      │ • Direct revalidateTag()     │          │ • External API integrations  │
      └──────────────┬───────────────┘          └──────────────┬───────────────┘
                     │                                         │
                     ▼                                         ▼
      [ User Settings / Watchlist /             [ /api/chat SSE Streaming /    │
        Alerts / Journal / Thread Forks ]         /api/billing/webhook / Cron ]
```

#### Comparison Matrix:

| Architectural Dimension | Server Actions (`'use server'`) | Route Handlers (`route.ts`) |
|---|---|---|
| **Primary Intent** | First-party UI state mutations, form submissions, optimistic flows | Streaming endpoints, inbound webhooks, cron jobs, file exports, public APIs |
| **Transport & Calling** | Next.js RPC (POST to current URL with `Next-Action` header) | Standard HTTP methods (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`) |
| **CSRF Protection** | **Automatic & Built-in**: Next.js validates Origin and Action IDs | **Manual**: Enforced via `src/proxy.ts` double-submit cookie (`__Host-hfx_csrf`) |
| **React 19 Integration** | Native integration with `useActionState`, `useOptimistic`, `useTransition` | Consumed via `fetch()`, `@tanstack/react-query`, or `@ai-sdk/react` |
| **Cache Invalidation** | Direct invocation of `revalidateTag(tag)` or `revalidatePath(path)` | Requires manual client cache mutation or cache-tag revalidation calls |
| **Error Handling** | Structured return types (`{ ok: true, data } \| { ok: false, error }`) | HTTP status codes (`400`, `401`, `403`, `429`, `500`) with JSON error envelopes |
| **Kestrel Assignments** | - Alert CRUD & toggle<br>- Journal entry management<br>- User preferences & profile<br>- Chat thread fork / rename / delete<br>- Admin feature toggles | - `/api/chat` (SSE AI token streaming)<br>- `/api/market/stream` (Ambient quote SSE)<br>- `/api/billing/webhook` (HMAC webhook)<br>- `/api/cron/*` (Secret-guarded cron)<br>- `/api/health/*` (Liveness & health) |

---

### 2.2 React Server Components & The Modern Caching Paradigm

In Next.js 16, **everything is dynamic by default**. The historical reliance on blanket route-level configuration exports (`export const dynamic = 'force-dynamic'`) is deprecated in favor of **granular, function-level caching directives** (`'use cache'`, `cacheTag`, `cacheLife`) and **request-scoped deduplication** via React's `cache()`.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        NEXT.JS 16 CACHING SPECTRUM & LIFECYCLES                        │
└────────────────────────────────────────────────────────────────────────────────────────┘

 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │ 1. REQUEST-SCOPED DEDUPLICATION (React cache())                                      │
 │    • Lifespan: Single HTTP request render pass.                                      │
 │    • Target: DAL fetchers (getThread, getUserWithSettings, checkIsAdmin).            │
 │    • Benefit: Eliminates duplicate queries between generateMetadata and Page render. │
 └──────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │ 2. CROSS-REQUEST DATA CACHE ('use cache', cacheTag, cacheLife)                       │
 │    • Lifespan: Multi-tenant / Cross-request SWR cache (seconds, minutes, days).      │
 │    • Target: Shared market catalogs, Macro economic events, Financial news.          │
 │    • Invalidation: Tag-based on demand via revalidateTag('macro-calendar').          │
 └──────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │ 3. USER-SCOPED CACHE TAGGING (cacheTag(`user-watchlist-${userId}`))                  │
 │    • Lifespan: User-specific cached data structures.                                 │
 │    • Target: Heavy user calculations, historical performance summaries.               │
 │    • Invalidation: On-mutation via Server Actions (revalidateTag).                    │
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

#### Deduplication vs. Cross-Request Caching:
1. **React `cache()` (Request-Scoped Memoization)**:
   - Does NOT persist data across requests or across different users.
   - Guaranteed zero memory leakage between requests.
   - Essential for functions called in multiple Server Components within the same tree (e.g., `layout.tsx`, `page.tsx`, and `generateMetadata`).
2. **Next.js 16 `'use cache'` (Persistent Cross-Request Cache)**:
   - Placed at the top of an async function or component file.
   - Bound to explicit TTL profiles via `cacheLife('minutes' | 'hours' | 'days')`.
   - Bound to invalidation keys via `cacheTag('macro-calendar', 'symbols')`.

---

### 2.3 Partial Prerendering (PPR) & Suspense Streaming Boundaries

**Partial Prerendering (PPR)** combines static shell prerendering with dynamic streaming holes in a single HTTP response. The browser receives a static HTML frame instantly (<15ms), while dynamic user data, real-time prices, and AI stream payloads populate in parallel over HTTP/2 chunked transfer encoding.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   PARTIAL PRERENDERING (PPR) EXECUTION TIMELINE                        │
└────────────────────────────────────────────────────────────────────────────────────────┘

 TIME ──▶
 0ms      [ HTTP Request Arrives ]
          │
 10ms     ├─────────────────────────────────────────────────────────────────────────────┐
          │ INSTANT STATIC HTML SHELL FLUSHED TO CLIENT (TTFB < 15ms)                   │
          │  • DesktopSidebar frame & navigation links                                  │
          │  • AppShellContainer & TopBar header                                        │
          │  • Main content grid & loading skeleton geometry                            │
          └─────────────────────────────────────────────────────────────────────────────┘
          │
 45ms     ├─▶ Stream Hole 1 Resolves: <DynamicUserSidebar /> (User session & avatar)
          │
 70ms     ├─▶ Stream Hole 2 Resolves: <LiveTickerTape /> (Ambient market quote stream)
          │
 95ms     ├─▶ Stream Hole 3 Resolves: <MarketSessionBar /> (London/NY session status)
          │
 120ms    └─▶ Stream Hole 4 Resolves: <PageContent /> ({children} Server Component data)
```

#### Key Rules for PPR Geometry & Layout Stability:
- **Skeleton Height Matching**: Fallbacks in `<Suspense fallback={...}>` must have identical dimensions and bounding-box geometry as the resolved dynamic components (e.g. `h-7 w-full` for `<LiveTickerTape>`) to prevent Cumulative Layout Shift (CLS = 0).
- **Synchronous Shell Isolation**: Layout roots (`(app)/layout.tsx`) must avoid top-level `await auth()` blocks. Dynamic data dependencies must be pushed into leaf Server Components wrapped in Suspense boundaries.

---

### 2.4 Turbopack Monorepo Anchoring & Optimization

Turbopack is the default Rust-based bundler in Next.js 16. In a pnpm monorepo structure where packages (`@kestrel/*`) reside outside `apps/web`, explicit configuration ensures optimal tree-shaking and rapid Fast Refresh (<50ms).

#### Monorepo Anchoring Principles:
1. **Workspace Root Pinning**: Setting `turbopack.root = workspaceRoot` ensures Turbopack anchors its module resolution graph to the repository root where `pnpm-lock.yaml` lives.
2. **Barrel Import Optimization (`optimizePackageImports`)**: Heavy libraries containing hundreds of icon or component exports (such as `@tabler/icons-react`, `motion`, `shiki`, and `@dnd-kit/core`) are transformed into direct module imports, eliminating massive module resolution graphs.
3. **Transpilation Pipeline (`transpilePackages`)**: Explicitly transpiling workspace packages (`@kestrel/shared`, `@kestrel/db`, `@kestrel/data`, `@kestrel/indicators`, `@kestrel/ai`, `@kestrel/config`) ensures TypeScript paths and shared TSConfigs are compiled consistently without manual pre-build steps.

---

### 2.5 Metadata Caching & Viewport Splitting

Next.js 16 enforces a strict separation between **document metadata** (`export const metadata: Metadata`) and **viewport settings** (`export const viewport: Viewport`).

#### Architectural Requirements:
- **Viewport Definition**: Properties such as `width`, `initialScale`, `maximumScale`, `viewportFit`, and `themeColor` must be defined exclusively inside `export const viewport: Viewport` in `src/app/layout.tsx`.
- **Deduplicated Dynamic Metadata**: In dynamic routes (`/chart/[symbol]`, `/chat/[threadId]`), `generateMetadata` must call cached DAL fetchers (`getThread`, `getSymbolMetadata`) wrapped in React `cache()`. This ensures that Next.js executes the database lookup exactly once during the request lifecycle.

---

### 2.6 Streaming Edge Boundaries & AI Streaming (Vercel AI SDK v5 + Mastra)

Kestrel’s AI chat runtime couples **Mastra multi-agent workflows** with the **Vercel AI SDK v5** streaming transport over Server-Sent Events (SSE).

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        AI STREAMING ARCHITECTURE & EVENT FLOW                          │
└────────────────────────────────────────────────────────────────────────────────────────┘

 [ Client: ChatScreen.tsx ]
            │
            │  1. POST /api/chat (threadId, messages, modelOverride)
            ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │ apps/web/src/app/api/chat/route.ts (runtime = 'nodejs', maxDuration = 60)            │
 │                                                                                      │
 │  1. Verify withAuth() ──▶ Read HMAC-signed x-user-id header (<0.05ms)                │
 │  2. Enforce Rate Limit ──▶ withRateLimit(userId, 'ai_chat', 30)                      │
 │  3. Atomic Budget Reservation ──▶ reserveTurnBudget({ userId, maxDailyUsd })         │
 │  4. Mastra Stream Execution ──▶ runMastraCanonicalChatStreamService(args)            │
 └──────────────────────────────────────┬───────────────────────────────────────────────┘
                                        │
                                        │  2. HTTP/2 SSE Stream (text/event-stream)
                                        ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │ Structured SSE Event Protocol (ChatStreamEventSchema)                                │
 │                                                                                      │
 │  data: {"type":"text-start","id":"msg-123"}                                          │
 │  data: {"type":"text-delta","id":"msg-123","delta":"Gold (XAUUSD) is testing..."}     │
 │  data: {"type":"text-delta","id":"msg-123","delta":" major resistance at $2,650."}   │
 │  : ping                                            <── 15s keep-alive heartbeat      │
 │  data: {"type":"data-multi-agent-meta","id":"msg-123","data":{...report, cost}}      │
 │  data: {"type":"text-end","id":"msg-123"}                                            │
 └──────────────────────────────────────┬───────────────────────────────────────────────┘
                                        │
                                        │  3. Stream Consumer (transformSseToDataStream)
                                        ▼
 [ Client: Token Streaming Fast-Path ]
  • Renders raw text tokens instantly with whitespace-pre-line
  • Defers heavy ReactMarkdown & Shiki syntax highlighting until stream completion
  • Eliminates DOM thrashing and CPU rendering bottlenecks during 100 token/sec delivery
```

---

### 2.7 Route Proxy Optimizations (`proxy.ts`)

Next.js 16 replaces legacy middleware conventions with the **Request Proxy** pattern. The proxy executes at the network ingress before routing decisions, serving as Kestrel's primary security perimeter.

#### Security & Performance Guarantees:
1. **Zero Database Overhead**: The proxy performs zero database lookups, operating entirely in memory using Web Crypto APIs and fast JWT header decoding (execution latency <2ms).
2. **Double-Submit CSRF Defense**: Automatically sets `__Host-hfx_csrf` cookie on all requests and validates matching `x-csrf-token` headers on state-changing methods (`POST`, `PUT`, `DELETE`, `PATCH`).
3. **Per-Request CSP Nonce**: Generates a 128-bit cryptographic nonce (`crypto.randomUUID()`) per request, injecting it into downstream `x-csp-nonce` headers and the `Content-Security-Policy` header with `'strict-dynamic'`.
4. **HMAC-SHA256 Header Signing (`USER_ID_SIG_HEADER`)**: When NextAuth verifies a session, the proxy signs `userId + '.' + requestId` with an HMAC secret. Downstream route handlers verify this signature in <0.05ms, skipping expensive JWT re-parsing.

---

## 3. Kestrel Architecture Audit & Direct Comparative Gap Analysis

### 3.1 Comprehensive Domain-by-Domain Evaluation Matrix

| Domain # | Architectural Dimension | Current Kestrel Implementation (`apps/web`) | Next.js 16 & React 19 Best Practice | Severity / Impact | Evaluation & Recommendations |
|---|---|---|---|---|---|
| **1** | **Routing & Layout Architecture** | `AppLayout` (`(app)/layout.tsx`) is an `async` Server Component awaiting `auth()`, `getOnboardingStatus()`, and `checkIsAdmin()` at the layout root. Blocks initial HTML flush. | Synchronous Layout Shell + Partial Prerendering (PPR). User sessions, tickers, and content stream in granular Suspense boundaries. | **HIGH** | Decompose `(app)/layout.tsx` into a synchronous frame. Move dynamic auth checks into `<DynamicUserSidebar>` and `<MainContentStream>` to achieve <15ms TTFB. |
| **2** | **Mutations & State Management** | ~30 internal CRUD endpoints use `apiMutate()` → REST Route Handlers (`/api/alerts`, `/api/journal`, `/api/settings/*`, `/api/chat/threads/*`) with manual CSRF headers. | Co-located Server Actions (`'use server'`) paired with React 19 `useActionState`, `useOptimistic`, and `useTransition`. | **HIGH** | Migrate internal UI mutations to typed Server Actions. Reserve Route Handlers strictly for SSE streaming, webhooks, cron, and public probes. |
| **3** | **Caching & Directives** | Blanket `export const dynamic = 'force-dynamic'` across 70+ files. Conflicting `force-dynamic` + `generateStaticParams()` in `chart/[symbol]/page.tsx`. | Dynamic by default. Use Next.js 16 `'use cache'`, `cacheTag()`, and `cacheLife()` for shared data (Macro calendar, Symbol catalog). | **HIGH** | Remove blanket `force-dynamic`. Introduce `'use cache'` on Macro Calendar and News to cut database load by >80% on high-traffic shared views. |
| **4** | **Query Deduplication (DAL)** | Dynamic pages (`/chat/[threadId]`) call `auth()` and `getThread()` in both `generateMetadata` and Page components without React `cache()`. | Wrap all DAL fetchers (`getThread`, `getUserWithSettings`, `listThreads`) in React `cache()` in `api-boundary.ts`. | **MEDIUM** | Wrap all read fetchers in React `cache()` to eliminate duplicate DB queries per navigation pass. |
| **5** | **Bundle Splitting (AI Tools)** | All 31 bespoke tool renderers in `registry.tsx` are statically imported into the main chat bundle. | Dynamic Component Registry using `next/dynamic` / `React.lazy` to load tool components only when emitted in a stream. | **HIGH** | Refactor `registry.tsx` to dynamic imports, reducing chat initial JS payload by >45%. |
| **6** | **Desktop Split-Chart Bundle** | `TradingViewWidget` is statically imported into `ChatScreen.tsx` even when split mode is inactive on mobile or standard chat views. | Dynamically import `TradingViewWidget` via `next/dynamic({ ssr: false })` rendered conditionally when `splitMode` is enabled. | **MEDIUM** | Lazy-load `TradingViewWidget` to defer heavy TradingView canvas scripts on mobile and standard chat screens. |
| **7** | **Typography & Fonts** | `JetBrains_Mono` loaded via `next/font/google`. The primary sans-serif font falls back to unoptimized system fonts (`ui-sans-serif`). | Dual `next/font/google` configuration (`Geist` / `Inter` + `JetBrains_Mono`) with CSS variables and automatic self-hosting. | **LOW** | Integrate `Geist` via `next/font/google` in `layout.tsx` for consistent data density and zero CLS across all platforms. |
| **8** | **Request Proxy & Security** | `src/proxy.ts` implements NextAuth v5, double-submit CSRF, CSP nonce, and HMAC header signing. 195 lines, zero DB calls. | State-of-the-art Next.js 16 Request Proxy architecture. | **OPTIMAL** | **Preserve as Gold Standard**. Maintain strict negative matchers and Edge-safe execution. |
| **9** | **AI Streaming & Execution** | `/api/chat` uses `runtime = 'nodejs'`, `maxDuration = 60`, atomic budget guards, and SSE TransformStream event delivery. | Robust Node.js AI streaming with keep-alive heartbeats and client streaming fast-path. | **OPTIMAL** | **Preserve & Modernize**. Retain Node.js runtime and add periodic 15s keep-alive ping comments (`: ping\n\n`). |

---

### 3.2 Specific Anti-Patterns Identified in Current Codebase

#### Anti-Pattern A: Contradictory Directives in `chart/[symbol]/page.tsx`
- **Location**: `apps/web/src/app/(app)/chart/[symbol]/page.tsx:14-19`
- **Observation**: The file declares both `export const dynamic = 'force-dynamic'` and `export async function generateStaticParams()`.
- **Issue**: Under `force-dynamic`, Next.js completely disables static generation, making `generateStaticParams()` a no-op dead code path while preventing Partial Prerendering.
- **Remediation**: Remove `force-dynamic` and configure proper dynamic parameter handling.

#### Anti-Pattern B: Invalid `revalidate` on Authenticated Pages
- **Location**: `apps/web/src/app/(app)/settings/page.tsx:17`, `settings/agent/page.tsx:21`, `settings/models/page.tsx:17`
- **Observation**: `export const revalidate = 60` is declared on pages that perform request-time dynamic operations (`await auth()`, `getUserWithSettings(userId)`).
- **Issue**: When a component reads request cookies or headers via `auth()`, route-level ISR `revalidate` is ignored by Next.js.
- **Remediation**: Remove `revalidate = 60` and rely on request-level memoization via React `cache()`.

#### Anti-Pattern C: Dependency Inversion Violation in Settings Action
- **Location**: `apps/web/src/app/(app)/settings/_actions-preferences.ts:24`
- **Observation**: File imports `getDb` from `@kestrel/ai` rather than `@kestrel/db`.
- **Issue**: Violates the DIP-1 architectural rule in `AGENTS.md` (which mandates importing `getDb` directly from `@kestrel/db` in `apps/web`).
- **Remediation**: Correct the import to `import { getDb } from '@kestrel/db'`.

---

## 4. Concrete Modernization & Optimization Roadmap

### 4.1 Phase 1: CRUD Route Handlers to Server Actions Migration Plan

The objective is to replace boilerplate internal REST mutation endpoints with co-located, type-safe Server Actions.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   SERVER ACTIONS MIGRATION INVENTORY (PHASE 1)                         │
└────────────────────────────────────────────────────────────────────────────────────────┘

 [ Domain: ALERTS ]
   • Old: POST/DELETE/PATCH /api/alerts & /api/alerts/[id]
   • New: apps/web/src/app/(app)/alerts/_actions.ts
     - createAlertAction(prevState, formData)
     - toggleAlertAction(alertId, active)
     - deleteAlertAction(alertId)

 [ Domain: JOURNAL ]
   • Old: POST/DELETE/PATCH /api/journal & /api/journal/[id]
   • New: apps/web/src/app/(app)/journal/_actions.ts
     - createJournalEntryAction(prevState, formData)
     - deleteJournalEntryAction(entryId)

 [ Domain: CHAT THREADS ]
   • Old: PATCH/DELETE /api/chat/threads/[id], POST /api/chat/threads/fork
   • New: apps/web/src/app/(app)/chat/_actions.ts
     - renameThreadAction(threadId, title)
     - forkThreadAction(threadId, messageId)
     - deleteThreadAction(threadId)
     - archiveThreadAction(threadId)

 [ Domain: ADMIN CONTROLS ]
   • Old: POST /api/admin/features, POST /api/admin/onboarding/reset
   • New: apps/web/src/app/(app)/admin/_actions.ts
     - toggleFeatureFlagAction(flagKey, enabled)
     - resetUserOnboardingAction(userId, mode)
     - updateUserRoleAction(userId, role)
```

---

### 4.2 Phase 2: Layout Partial Prerendering (PPR) Decomposition

Decomposing `(app)/layout.tsx` into a synchronous AppLayout shell eliminates the 120ms blocking delay on initial HTML delivery.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                  LAYOUT PARTIAL PRERENDERING DECOMPOSITION                             │
└────────────────────────────────────────────────────────────────────────────────────────┘

 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │ apps/web/src/app/(app)/layout.tsx (SYNCHRONOUS ROOT SHELL)                            │
 │                                                                                      │
 │  <MotionRoot>                                                                        │
 │    <SidebarStateProvider>                                                            │
 │      <NavDrawerProvider>                                                             │
 │        <DesktopSidebarShell>                                                         │
 │          <Suspense fallback={<SidebarUserSkeleton />}>                               │
 │            <DynamicUserSidebar /> ──▶ (async: auth() + onboarding + admin)           │
 │          </Suspense>                                                                 │
 │        </DesktopSidebarShell>                                                        │
 │                                                                                      │
 │        <AppShellContainer>                                                           │
 │          <TopBar />                                                                  │
 │          <Suspense fallback={<TickerTapeSkeleton />}>                                │
 │            <LiveTickerTape /> ──▶ (async: cached quote snapshot)                     │
 │          </Suspense>                                                                 │
 │          <Suspense fallback={<MarketSessionSkeleton />}>                             │
 │            <MarketSessionBar /> ──▶ (async: session calculation)                     │
 │          </Suspense>                                                                 │
 │                                                                                      │
 │          <main id="main-content">                                                    │
 │            <Suspense fallback={<PageShimmerSkeleton />}>                             │
 │              {children} ──▶ (Dynamic Page Route)                                     │
 │            </Suspense>                                                               │
 │          </main>                                                                     │
 │        </AppShellContainer>                                                          │
 │      </NavDrawerProvider>                                                            │
 │    </SidebarStateProvider>                                                           │
 │  </MotionRoot>                                                                       │
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 4.3 Phase 3: Typography & Asset Optimization

Integrate `Geist` from `next/font/google` alongside `JetBrains_Mono` in `src/app/layout.tsx`:

```tsx
import { Geist, JetBrains_Mono } from 'next/font/google';

const fontSans = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontSans.variable} ${fontMono.variable} dark`} suppressHydrationWarning>
      <body className="bg-bg text-fg font-sans antialiased selection:bg-gold-500/20 selection:text-gold-200">
        {children}
      </body>
    </html>
  );
}
```

---

### 4.4 Phase 4: Tool Registry Bundle Splitting & Dynamic Loading

Refactor `apps/web/src/components/chat/parts/registry.tsx` from static imports to a dynamic component map.

```tsx
// apps/web/src/components/chat/parts/registry.tsx
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { ToolPartProps } from './types';

const ToolLoadingFallback = () => (
  <div className="my-2 h-24 w-full animate-pulse rounded-md border border-border/40 bg-surface-muted/30" />
);

export const DYNAMIC_TOOL_REGISTRY: Record<string, ComponentType<ToolPartProps<any>>> = {
  get_cot_report: dynamic(() => import('./tools/cot-report-part').then((m) => m.GetCoTPart), {
    loading: ToolLoadingFallback,
  }),
  analyze_chart_image: dynamic(() => import('./tools/chart-image-part').then((m) => m.AnalyzeChartImagePart), {
    loading: ToolLoadingFallback,
  }),
  convene_committee: dynamic(() => import('./tools/committee-part').then((m) => m.ConveneCommitteePart), {
    loading: ToolLoadingFallback,
  }),
  get_correlation: dynamic(() => import('./tools/correlation-part').then((m) => m.GetCorrelationPart), {
    loading: ToolLoadingFallback,
  }),
  get_intermarket_resonance: dynamic(() => import('./tools/resonance-part').then((m) => m.GetIntermarketResonancePart), {
    loading: ToolLoadingFallback,
  }),
  // ... maps all 31 bespoke tool components on demand
};
```

---

## 5. Best Practices, Security & Reference Code Examples

### 5.1 Production Server Action with Rate Limiting, CSRF, and DIP-1 DB Access

```ts
// apps/web/src/app/(app)/alerts/_actions.ts
'use server';

import { auth } from '@/auth';
import { getDb } from '@kestrel/db'; // DIP-1 Compliant direct import
import { schema, withRateLimit } from '@kestrel/db';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';

const CreateAlertSchema = z.object({
  symbol: z.string().min(2).max(20).trim(),
  condition: z.enum(['ABOVE', 'BELOW', 'CROSSES']),
  targetPrice: z.number().positive(),
  note: z.string().max(200).trim().optional(),
});

export type CreateAlertResult =
  | { ok: true; alertId: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createAlertAction(
  _prevState: CreateAlertResult | null,
  formData: FormData
): Promise<CreateAlertResult> {
  return Sentry.withServerActionInstrumentation('createAlertAction', async () => {
    const session = await auth();
    if (!session?.user?.id) {
      return { ok: false, error: 'Unauthorized. Please sign in.' };
    }
    const userId = session.user.id;

    // Enforce database-backed rate limit (20 alert creations per minute per user)
    const rateLimit = await withRateLimit(userId, 'alert_create', 20);
    if (!rateLimit.allowed) {
      return { ok: false, error: 'Rate limit exceeded. Please wait a minute before creating more alerts.' };
    }

    const raw = Object.fromEntries(formData);
    const parsed = CreateAlertSchema.safeParse({
      symbol: raw.symbol,
      condition: raw.condition,
      targetPrice: Number(raw.targetPrice),
      note: raw.note || undefined,
    });

    if (!parsed.success) {
      return {
        ok: false,
        error: 'Validation failed. Please check the form fields.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    try {
      const db = getDb();
      const [inserted] = await db
        .insert(schema.alerts)
        .values({
          userId,
          symbol: parsed.data.symbol.toUpperCase(),
          condition: parsed.data.condition,
          targetPrice: parsed.data.targetPrice.toString(),
          note: parsed.data.note,
        })
        .returning({ id: schema.alerts.id });

      if (!inserted) {
        throw new Error('Failed to insert alert record.');
      }

      // Invalidate user-scoped alert cache tags
      revalidateTag(`user-alerts-${userId}`);

      return { ok: true, alertId: inserted.id };
    } catch (err) {
      Sentry.captureException(err);
      return { ok: false, error: 'Database transaction failed. Please try again.' };
    }
  });
}
```

---

### 5.2 Data Access Layer (DAL) Cached Fetchers with React `cache()`

```ts
// apps/web/src/lib/services/api-boundary.ts
import 'server-only';

import { cache } from 'react';
import { getThread as dbGetThread, getUserWithSettings as dbGetUserWithSettings } from '@kestrel/db';

/**
 * Request-scoped memoized thread lookup.
 * Safe to call in layout.tsx, page.tsx, and generateMetadata in the same render pass
 * without duplicate SQL executions.
 */
export const getThread = cache(async (userId: string, threadId: string) => {
  return dbGetThread(userId, threadId);
});

/**
 * Request-scoped memoized user profile and settings lookup.
 */
export const getUserWithSettings = cache(async (userId: string) => {
  return dbGetUserWithSettings(userId);
});
```

---

### 5.3 Partial Prerendering App Layout (`(app)/layout.tsx`)

```tsx
// apps/web/src/app/(app)/layout.tsx
import { Suspense } from 'react';
import { AppShellContainer } from '@/components/layout/app-shell-container';
import { DesktopSidebarShell } from '@/components/layout/desktop-sidebar-shell';
import { DynamicUserSidebar } from '@/components/layout/dynamic-user-sidebar';
import { TopBar } from '@/components/layout/top-bar';
import { LiveTickerTape } from '@/components/layout/live-ticker-tape';
import { MarketSessionBar } from '@/components/layout/market-session-bar';
import { NavDrawerProvider } from '@/components/layout/nav-drawer-context';
import { SidebarStateProvider } from '@/components/layout/sidebar-state-context';
import { CommandPalette, InstallNudge } from '@/components/layout/lazy-chrome';
import { MotionRoot } from '@/components/ui/motion-config';
import { Toaster } from '@/components/ui/toaster';
import { OfflineBanner } from '@/components/layout/offline-banner';
import { SkipToContent } from '@/components/layout/skip-to-content';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MotionRoot>
      <SidebarStateProvider>
        <NavDrawerProvider>
          <div className="bg-bg text-fg relative min-h-svh">
            {/* Static Sidebar Frame with Dynamic User Slot */}
            <DesktopSidebarShell>
              <Suspense
                fallback={
                  <div className="m-3 h-12 animate-pulse rounded-md bg-surface-muted/40" />
                }
              >
                <DynamicUserSidebar />
              </Suspense>
            </DesktopSidebarShell>

            <AppShellContainer>
              <SkipToContent />
              <TopBar />
              
              {/* Parallel Dynamic Market Telemetry Streams */}
              <Suspense fallback={<div className="h-7 w-full animate-pulse bg-surface-muted/30" />}>
                <LiveTickerTape />
              </Suspense>
              <Suspense fallback={<div className="h-6 w-full animate-pulse bg-surface-muted/20" />}>
                <MarketSessionBar />
              </Suspense>

              <main
                id="main-content"
                tabIndex={-1}
                className="mx-auto w-full max-w-2xl px-4 pt-4 xl:max-w-7xl xl:px-6 focus:outline-none"
                style={{
                  viewTransitionName: 'main-content',
                  paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)',
                }}
              >
                <InstallNudge />
                <Suspense
                  fallback={
                    <div className="flex min-h-[40svh] items-center justify-center">
                      <div className="shimmer h-32 w-full max-w-md rounded-sm bg-surface-muted/30" />
                    </div>
                  }
                >
                  {children}
                </Suspense>
              </main>
            </AppShellContainer>

            <OfflineBanner />
            <CommandPalette />
            <Toaster />
          </div>
        </NavDrawerProvider>
      </SidebarStateProvider>
    </MotionRoot>
  );
}
```

---

### 5.4 Modern Next.js 16 Configuration (`next.config.ts`)

```ts
// apps/web/next.config.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';

const workspaceRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',
  reactStrictMode: true,

  // Anchor Turbopack to the repository workspace root
  turbopack: {
    root: workspaceRoot,
  },

  transpilePackages: [
    '@kestrel/shared',
    '@kestrel/db',
    '@kestrel/data',
    '@kestrel/indicators',
    '@kestrel/ai',
    '@kestrel/config',
  ],

  typescript: {
    ignoreBuildErrors: false,
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.supabase.in' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
    ],
  },

  // Tree-shake barrel-file imports during Turbopack compilation
  experimental: {
    optimizePackageImports: [
      '@tabler/icons-react',
      'motion',
      'react-markdown',
      'remark-gfm',
      'dompurify',
      'shiki',
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities',
      'clsx',
      'tailwind-merge',
      'nuqs',
      'sonner',
    ],
  },

  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : undefined,
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=()',
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  silent: !process.env.CI,
});
```

---

### 5.5 Robust SSE AI Streaming Route Handler (`/api/chat/route.ts`)

```ts
// apps/web/src/app/api/chat/route.ts
import { z } from 'zod';
import { withAuth } from '@/lib/api';
import { withRateLimit } from '@kestrel/db';
import { reserveTurnBudget, estimateCostUsd } from '@kestrel/ai';
import { runMastraCanonicalChatStream } from '@kestrel/ai/mastra';
import { ChatStreamEventSchema } from '@kestrel/shared';
import * as Sentry from '@sentry/nextjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ChatPayloadSchema = z.object({
  threadId: z.string().uuid(),
  modelOverride: z.string().max(100).nullable().optional(),
  userMessage: z.object({
    id: z.string().max(100),
    role: z.literal('user'),
    content: z.string().max(50_000),
  }),
});

function encodeSse(event: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(ChatStreamEventSchema.parse(event))}\n\n`);
}

export const POST = withAuth<void>(async (req, { user }) => {
  const rateLimit = await withRateLimit(user.userId, 'ai_chat', 30);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: { code: 'RATE_LIMITED', message: 'Chat rate limit exceeded. Slow down.' } },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const json = await req.json();
  const parsed = ChatPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: { code: 'VALIDATION', message: 'Invalid payload.' } }, { status: 400 });
  }

  const { threadId, modelOverride, userMessage } = parsed.data;
  const runId = crypto.randomUUID();

  // Atomic turn budget reservation
  await reserveTurnBudget({
    userId: user.userId,
    maxDailyUsd: 10.0,
    correlation: { threadId, runId },
  });

  const aiStream = await runMastraCanonicalChatStream({
    userId: user.userId,
    threadId,
    userMessage,
    modelOverride: modelOverride ?? null,
    runId,
  });

  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const pingInterval = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(': ping\n\n'));
      }, 15_000);

      try {
        controller.enqueue(encodeSse({ type: 'text-start', id: userMessage.id }));

        for await (const chunk of aiStream.text) {
          if (chunk) {
            controller.enqueue(encodeSse({ type: 'text-delta', id: userMessage.id, delta: chunk }));
          }
        }

        const completion = await aiStream.completion;
        controller.enqueue(
          encodeSse({
            type: 'data-multi-agent-meta',
            id: userMessage.id,
            data: {
              modelId: completion.modelId,
              cost: estimateCostUsd(completion.modelId, completion.stats.inputTokens, completion.stats.outputTokens),
            },
          })
        );

        controller.enqueue(encodeSse({ type: 'text-end', id: userMessage.id }));
      } catch (err) {
        Sentry.captureException(err);
        controller.enqueue(
          encodeSse({
            type: 'error',
            errorText: 'AI streaming error occurred. Please try again.',
          })
        );
      } finally {
        clearInterval(pingInterval);
        controller.close();
      }
    },
  });

  return new Response(responseStream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
});
```

---

## 6. Verification, Build Compatibility & Performance Benchmarking

### 6.1 CLI Verification Runbook

Execute the following commands in sequence to verify full compatibility with Next.js 16 and React 19:

```bash
# 1. Verify TypeScript type safety across all 9 packages (Zero type errors required)
pnpm typecheck

# 2. Run unit and integration test suite (107 test files / 990+ tests)
pnpm --filter @kestrel/web test -- --run

# 3. Execute Turbopack production compilation
pnpm --filter @kestrel/web build

# 4. Verify bundle size constraints (<849.6 KB budget cap per chunk)
pnpm --filter @kestrel/web run bundle-size:check

# 5. Execute Playwright End-to-End smoke tests
pnpm --filter @kestrel/web exec playwright test
```

---

### 6.2 Performance Benchmarking & Core Web Vitals Targets

| Metric | Measurement Technique | Target Threshold | Architectural Driver |
|---|---|---|---|
| **TTFB (Time to First Byte)** | Navigation Timing API / Vercel Edge Analytics | **< 15ms** | Static layout shell flush via Partial Prerendering (PPR) |
| **FCP (First Contentful Paint)** | Lighthouse / Chrome DevTools Performance Trace | **< 250ms** | Next.js 16 font self-hosting (`next/font/google`) & instant shell |
| **LCP (Largest Contentful Paint)** | Web Vitals JS / Chrome Performance Profiler | **< 1.0s** | Parallel Suspense streaming + skeleton geometry matching |
| **CLS (Cumulative Layout Shift)** | Chrome DevTools Layout Shift HUD | **0.000** | Explicit fallback height matching (`h-7`, `h-6`) & zero layout jump |
| **INP (Interaction to Next Paint)** | Event Timing API / User Journey Profiling | **< 50ms** | Optimistic UI updates with React 19 `useOptimistic` & `useTransition` |

---

### 6.3 Invalidation Conditions & Audit Protocols

An audit of this architecture is considered **FAILED / INVALIDATED** if any of the following conditions occur:
1. `pnpm --filter @kestrel/web build` fails or logs deprecation warnings for Next.js configuration options.
2. `pnpm typecheck` emits type resolution errors (`TS2742` or `TS2345`) on Next.js async request APIs (`params`, `searchParams`, `headers`).
3. An internal Server Action imports `getDb` from `@kestrel/ai` instead of `@kestrel/db` (violating DIP-1).
4. Direct database queries are introduced into `apps/web/src/proxy.ts` (violating the Edge-safe request boundary constraint).
5. A dynamic page component executes duplicate database queries during `generateMetadata` and Page rendering due to missing React `cache()` wrappers.
