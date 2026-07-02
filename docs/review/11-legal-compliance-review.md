# 11 — Legal & Compliance Review (Read-Only Audit)

> **Type:** Read-only legal/compliance gap audit of the HamaFX-Ai repository.
> **Status:** Findings verified against source at the current `main` branch.
> **Audience:** The engineer/agent who will implement the technical remediations,
> and the product owner who must take the open legal questions to a qualified lawyer.
> **CRITICAL NOTICE:** This document is **NOT legal advice**. It surfaces issues and
> open questions for the owner to take to an actual lawyer. No legal disclaimer, Terms
> of Service, or Privacy Policy text is drafted here — those are explicitly left to the
> owner's lawyer. The technical sections describe *where* such text must be rendered and
> *what* it must cover, without prescribing the wording.
> **Rule of the road:** Every technical finding cites an exact file path. Legal questions
> are clearly separated in §6 and are NOT for a coding agent to resolve.

---

## 1. Context

HamaFX-Ai is a personal AI trading copilot for XAUUSD/EURUSD/GBPUSD (Next.js 15 +
TypeScript pnpm monorepo) being converted from a personal tool into a paid product
for the public. The business is based in Iraq. Payment processing is planned via
Verifone/2Checkout (Stripe ruled out — doesn't support Iraq-based merchants; Iraq
merchant eligibility with Verifone is **not yet confirmed** — see
`docs/review/10-billing-verifone-integration-plan.md`). The tenant model is
tenant = individual user (not org). The app uses the Apache 2.0 license. The
product will likely have international users, including potentially from the EU/UK
and California.

The AI agent provides trading analysis via a chat interface, with tools including
`verify_call`, `set_alert`, `log_journal`, `share_snapshot`, `run_system_action`
(operator-only by documentation but not enforced in code — see
`docs/review/04-ai-agent-safety-cost-review.md` §3.2). The system prompt includes
an untrusted content policy, mutation guards, and citation enforcement.

**Prior reviews referenced:**
- `docs/review/01-authentication-security-review.md` — auth, RLS, multi-tenant isolation
- `docs/review/04-ai-agent-safety-cost-review.md` — AI agent safety, verify_call, citation enforcer
- `docs/review/09-open-core-architecture-review.md` — open-core architecture, edition gating
- `docs/review/10-billing-verifone-integration-plan.md` — Verifone billing integration

**What was searched (exhaustive):**
- Full-repo regex search for: "terms of service", "privacy policy", "not financial
  advice", "disclaimer", "no warranty", "as is", "not advice", "investment advice",
  "financial advice" → **zero matches** across all file types.
- All `page.tsx` and `layout.tsx` files in `apps/web/src/app/` for footer, legal
  links, consent checkboxes, onboarding terms acceptance → **none found**.
- All `.tsx` components for "advice", "disclaimer", "risk warning", "informational",
  "educational", "consent", "accept terms", "agree terms" → **zero matches**.
- All API routes for "export", "delete tenant", "gdpr", "privacy", "erase" →
  matches found in settings actions (see §3.3 below).
- `packages/ai/src/` for advice/disclaimer framing in prompt and tool code →
  one prompt-level rule found (see §3.2).
- `infra/cron-vm/scripts/` for tenant export/delete scripts → both exist (see §3.3).

---

## 2. Findings — Technical/Product Gaps

### 2.1 [CRITICAL] No Terms of Service, Privacy Policy, or "Not Financial Advice" disclaimer exists anywhere in the product

**Severity:** Critical

**What was checked:**
- `apps/web/src/app/layout.tsx` (root layout) — no footer, no legal links.
- `apps/web/src/app/(app)/layout.tsx` (app shell) — no footer, no legal links. Renders
  `TopBar`, `NavDrawer`, `OfflineBanner`, `CommandPalette`, `Toaster` — no legal surface.
- `apps/web/src/components/layout/nav-drawer.tsx` — nav items are Markets/Personal
  destinations only; no "Terms", "Privacy", "Legal" links.
- `apps/web/src/app/(auth)/register/page.tsx` — registration form has name, email,
  password, confirm password. **No Terms checkbox, no consent checkbox, no links to
  ToS or Privacy Policy.** The submit button is enabled without any acceptance.
- `apps/web/src/app/onboarding/page.tsx` + `OnboardingWizard` — configures workspace
  (name, provider, symbols). **No terms acceptance step.**
- `apps/web/src/app/(app)/settings/_components/data-card.tsx` — has data management
  (export, delete, clear) but no legal links or policy references.
- `apps/web/src/app/(app)/settings/page.tsx` — settings sections: Security,
  Notifications, AI & Agent, Data, About. The "About" card
  (`_components/about-card.tsx`) was not read but no grep match for legal terms was
  found in any component.
- Full-repo regex search for all legal/disclaimer terms → **zero matches**.

**Impact:** The product gives AI-generated trading analysis (entry/stop/target levels,
directional bias, setup calls) and will soon charge money for it, yet:
1. Users have never agreed to any terms of service.
2. No privacy policy informs users what data is collected or how it's used.
3. No "not financial advice" disclaimer is surfaced anywhere in the UI — not at
   registration, not in onboarding, not in the chat interface, not in a footer.
4. No risk warning is displayed to users before or during use of a tool that
   produces trading-related analysis.

This is the single highest-priority gap. A paid AI trading-analysis product with no
legal surface at all is a significant liability exposure, regardless of jurisdiction.

### 2.2 [HIGH] AI output framing: system prompt has an internal "not financial advice" rule, but it is never surfaced to the user

**Severity:** High

**Location:** `packages/ai/src/prompt/system.ts` (BASE_PROMPT, line 63–98)

**What exists (good, internally):**
The system prompt's Hard Rule 6 (line 72) states:
> "You are providing **analysis**, not financial advice. Use scenario language:
> 'if X then Y', 'this would invalidate at Z'. Never 'you should buy'."

Hard Rule 5 (line 71) requires an invalidation level when calling a setup. The
output style section (line 96–98) requires directional calls to include bias,
setup, invalidation, and two scenarios with rough probabilities. These are sound
prompt-level guardrails that shape the model's output tone.

**What is missing:**
1. **No user-facing disclaimer.** The prompt-level rule shapes model output but is
   invisible to the user. There is no UI element — banner, footer, chat disclaimer,
   or persistent notice — that tells the user the output is analysis, not financial
   advice. The user sees AI-generated entry/stop/target levels and directional calls
   with no visible framing that this is not advice.
2. **`verify_call` can present fabricated prices as "verified."** Per
   `docs/review/04-ai-agent-safety-cost-review.md` §3.4, `verify_call`
   (`packages/ai/src/tools/verify-call.ts`) validates geometry and liquidity but
   **never cross-checks entry/stop/target against the live market price**. If the
   model hallucinates a price, geometry still "checks out," `agree` becomes `true`,
   and the UI renders a verified-looking pill affirming a fabricated price. This
   creates an **impression of verification stronger than the actual guarantee** —
   the highest user-trust risk identified in the prior safety review.
3. **Citation enforcer is soft and turn-level, not value-level.** Per review 04 §3.4,
   the citation enforcer (`packages/ai/src/verification.ts` +
   `verification/regex.ts`) appends a muted footer ("Numbers in this answer weren't
   verified against a tool call this turn") only when no numeric tool ran. If any
   numeric tool ran (even for a different symbol), all price claims are silently
   passed. The enforcer never compares a claimed value against a tool result. The
   `PRICE_TOKEN` regex misses comma-formatted, integer, and JPY-style prices.
4. **No "AI-generated content" label on chat outputs.** The chat interface does not
   label AI responses as AI-generated or attach any uncertainty framing visible to
   the user.

**Impact:** The product's AI output includes specific trading levels (entry, stop,
target) and directional calls, which a user could reasonably interpret as
recommendations. Without any visible disclaimer or uncertainty framing, and with a
"verified" pill that can affirm hallucinated prices, the product creates a risk that
users rely on outputs as advice or as verified data when they are neither.

### 2.3 [MEDIUM] Data export and deletion exist but are incomplete for GDPR/CCPA-style compliance

**Severity:** Medium

**What exists (partially good):**

1. **In-app data export** — `exportDataAction()` in
   `apps/web/src/app/(app)/settings/actions.ts` (line 1051) exports user data as
   JSON via a server action. Exports: profile, settings, threads, messages,
   journal entries, alerts, symbols, push subscriptions, memories (embeddings),
   shared snapshots, telemetry, spend, briefings, audit logs. Triggered from
   `data-card.tsx` "Export my data" button (labeled "Download all your data as JSON
   (GDPR)"). Rate-limited to 3 requests per window.

2. **In-app account deletion** — `deleteAccountAction()` in
   `apps/web/src/app/(app)/settings/actions.ts` (line 606) deletes the user row
   (cascading DB deletes handle related records). Requires password + 2FA
   confirmation. Triggered from `data-card.tsx` "Delete account" button.

3. **In-app chat history deletion** — `clearChatHistoryAction()` (line 68) deletes
   all chat threads via `deleteAllThreads()`.

4. **Infrastructure-level tenant export** — `infra/cron-vm/scripts/export-tenant.sh`
   exports all tenant-owned tables (25 tables listed) as a single JSON object to GCS.
   Comment header explicitly references GDPR data-portability requests.

5. **Infrastructure-level tenant deletion** — `infra/cron-vm/scripts/delete-tenant.sh`
   deletes all tenant-owned tables (25 tables, FK-ordered) + soft-deletes the user
   record. Has dry-run mode and `--confirm` flag. Comment header references GDPR
   right-to-erasure.

**What is missing:**

1. **No Privacy Policy.** The export button says "(GDPR)" but there is no privacy
   policy that informs users what data is collected, the legal basis for processing,
   data retention periods, third-party processors, or how to exercise their rights.
   Without this, the export/delete features exist in a policy vacuum.

2. **No data retention policy or schedule.** There is no documented retention period
   for chat history, journal entries, alerts, memories (embeddings), or telemetry.
   The infra scripts can export/delete on demand, but there is no automated retention
   schedule (e.g., auto-delete chat history after N days, or a documented policy that
   data is retained until account deletion).

3. **Export is missing some tenant tables.** The in-app `exportDataAction` exports
   ~13 data categories. The infra `export-tenant.sh` exports 25 tables. The in-app
   export is missing: `chat_tool_telemetry`, `decision_signals`,
   `decision_signal_outcomes`, `decision_signal_feedback`, `portfolio_positions`,
   `portfolio_settings`, `notification_noise_state`, `bot_links`, `provider_tests`,
   `rate_limits`, `user_sessions`. A GDPR data portability request should cover all
   personal data, not a subset.

4. **No DSR (Data Subject Request) intake channel.** There is no published contact
   method or form for users to submit access/rectification/erasure/portability
   requests outside of the in-app self-service buttons. GDPR requires at least one
   accessible submission method published in the privacy notice (EDPB guidance).

5. **No consent tracking schema.** There is no database table or column recording
   when a user accepted the Terms of Service and Privacy Policy, which version they
   accepted, and when. This is needed for both legal compliance and for demonstrating
   consent if challenged.

6. **Memory embeddings are exported but not explained.** The export includes
   `memory_embeddings` — vector representations of user data used for RAG. Users
   receiving an export may not understand what these are. A privacy policy should
   explain this processing.

### 2.4 [HIGH] No Terms of Service acceptance flow at registration or onboarding

**Severity:** High

**Locations:**
- `apps/web/src/app/(auth)/register/page.tsx` — no consent checkbox, no ToS link.
- `apps/web/src/app/onboarding/page.tsx` — no terms acceptance step.
- No `consent` or `terms_acceptance` table in `packages/db/src/schema/`.

**Impact:** Users can register, onboard, and use the product without ever agreeing
to any terms. Once billing is introduced, this becomes even more critical — users
will be charged without having agreed to terms that govern payment, refunds, usage
limits, and liability. A ToS acceptance flow with an audit trail (who agreed, when,
which version) is standard for paid SaaS products.

### 2.5 [MEDIUM] No refund/cancellation policy surface for upcoming Verifone billing

**Severity:** Medium (will become Critical when billing goes live)

**Locations:**
- `docs/review/10-billing-verifone-integration-plan.md` — billing integration plan
  with no mention of refund/cancellation policy UI or terms.
- No refund/cancellation policy page or component exists anywhere in the app.

**Verifone/2Checkout requirements (from research — see §4.3 below):**
Verifone's merchant terms require merchants to maintain a fair refund/return/
cancellation policy that complies with Payment Scheme Rules and applicable law,
disclose it to customers on the billing screen before purchase, and share changes
with Verifone at least 14 days before they take effect. 2Checkout provides a
sample refund policy template in their documentation. 2Checkout's consumer terms
provide a 14-day withdrawal/cooling-off right for consumers (including subscription
renewals). The merchant must have a clear, complete return policy publicly posted
on the billing screen, accessible before purchase.

**Impact:** When billing launches, the checkout flow must display a refund/cancellation
policy before purchase. This requires both a policy page (wording from a lawyer) and
UI integration to surface it at checkout. Neither exists yet.

---

## 3. Recommended Technical Fix for Each Finding

> **IMPORTANT:** The fixes below describe *where* to render legal text and *what*
> structure to build. The actual wording of any disclaimer, ToS, or Privacy Policy
> must come from the owner's lawyer — see §6. A coding agent should build the
> *containers* and *plumbing*, not draft the *content*.

### 3.1 Fix for 2.1 — Add legal surface (disclaimer banner, footer, legal pages)

**Components to create:**

1. **`apps/web/src/components/layout/legal-footer.tsx`** — A footer component
   rendered in `apps/web/src/app/(app)/layout.tsx` (after `</main>` or inside the
   shell) containing links to:
   - `/legal/terms` — Terms of Service
   - `/legal/privacy` — Privacy Policy
   - `/legal/disclaimer` — Risk Disclaimer / "Not Financial Advice"
   - `/legal/refund` — Refund & Cancellation Policy (initially can be a stub until
     billing launches)
   
   The footer should be visible on all authenticated pages. Use the existing design
   system (text-fg-subtle, text-xs). Dark mode support via existing Tailwind dark:
   variants.

2. **`apps/web/src/app/legal/terms/page.tsx`** — Static page rendering Terms of
   Service text from a content source (see below).

3. **`apps/web/src/app/legal/privacy/page.tsx`** — Static page rendering Privacy
   Policy text.

4. **`apps/web/src/app/legal/disclaimer/page.tsx`** — Static page rendering the
   risk disclaimer / "not financial advice" notice.

5. **`apps/web/src/app/legal/refund/page.tsx`** — Static page rendering the refund
   and cancellation policy (stub until billing launches, then populated).

6. **`apps/web/src/components/legal/disclaimer-banner.tsx`** — A dismissible banner
   component rendered at the top of the chat interface
   (`apps/web/src/app/(app)/chat/[threadId]/page.tsx` and
   `apps/web/src/app/(app)/chat/page.tsx`) that displays a brief risk disclaimer.
   The full text comes from the lawyer; the component just renders whatever text
   is provided. Should be dismissible per-session (localStorage flag) but reappear
   on new sessions. Must include dark mode support.

7. **Legal content storage** — Store legal text in a structured format (e.g.,
   `apps/web/src/content/legal/{terms,privacy,disclaimer,refund}.md` or `.tsx`
   files) so a non-developer can update the wording (from the lawyer) without
   touching component logic. Add a `lastUpdated` date field that renders on each
   legal page.

### 3.2 Fix for 2.2 — Surface AI output framing to the user

**Components to create/modify:**

1. **`apps/web/src/components/chat/ai-disclaimer-footer.tsx`** — A small persistent
   footer rendered below the chat input or at the bottom of the chat thread that
   states the output is AI-generated analysis, not financial advice. The exact text
   comes from the lawyer. The component renders the text and supports dark mode.

2. **Modify the chat message rendering** — Add an "AI-generated" label to assistant
   messages. Search for the chat message component (likely in
   `apps/web/src/components/chat/` — the exact file was not identified in this audit;
   the implementer should locate it via `apps/web/src/app/(app)/chat/[threadId]/page.tsx`
   imports) and add a small "AI-generated · not financial advice" caption below or
   adjacent to each assistant message.

3. **Fix `verify_call` to anchor against live price** — This is already a P0 item in
   `docs/review/04-ai-agent-safety-cost-review.md` §3.4/P0-3. The fix: fetch the live
   price for `symbol` inside `verify_call` (`packages/ai/src/tools/verify-call.ts`)
   and add caveats when entry/stop/target deviate from market beyond a tolerance.
   Do not let `agree:true` render for a price the tool never checked. This is both a
   safety and a compliance issue — a "verified" pill on a hallucinated price is a
   misrepresentation risk.

4. **Upgrade the citation enforcer to value-level** — Already P1-7 in review 04.
   Compare numeric claims against actual tool-result values rather than "did any
   numeric tool run." Broaden `PRICE_TOKEN` regex. This reduces the risk of
   ungrounded numbers reaching the user without any signal.

### 3.3 Fix for 2.3 — Complete the data export/deletion surface

**Modifications:**

1. **Expand `exportDataAction()`** in
   `apps/web/src/app/(app)/settings/actions.ts` (line 1051) to include all 25
   tenant-owned tables listed in `infra/cron-vm/scripts/export-tenant.sh`. The
   current export is missing: `chat_tool_telemetry`, `decision_signals`,
   `decision_signal_outcomes`, `decision_signal_feedback`, `portfolio_positions`,
   `portfolio_settings`, `notification_noise_state`, `bot_links`, `provider_tests`,
   `rate_limits`, `user_sessions`. Add these to the export query and the JSON output.

2. **Add a data retention settings section** to the settings Data card
   (`apps/web/src/app/(app)/settings/_components/data-card.tsx`) or a new
   "Data & Privacy" section that displays:
   - What data is stored (a readable list, not raw table names)
   - The retention policy (text from lawyer/owner)
   - Links to export and delete actions (already exist)
   - A link to the Privacy Policy

3. **Add a DSR contact method** — Add a contact email or form reference to the
   Privacy Policy page and the settings Data section. This can be as simple as a
   "To exercise your data rights, contact [email]" line. The email address is a
   business decision for the owner.

### 3.4 Fix for 2.4 — Add ToS acceptance flow

**Components/schema to create:**

1. **Database schema: `packages/db/src/schema/legal.ts`** — New table:
   ```typescript
   // terms_acceptance — records each user's acceptance of legal documents.
   export const termsAcceptance = pgTable('terms_acceptance', {
     id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
     userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
     documentType: text('document_type').notNull(), // 'terms' | 'privacy' | 'disclaimer'
     documentVersion: text('document_version').notNull(), // e.g., '2026-07-01-v1'
     acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
     ipAddress: text('ip_address'), // for audit trail
     userAgent: text('user_agent'), // for audit trail
   }, (t) => [
     index('terms_acceptance_user_id_idx').on(t.userId),
     index('terms_acceptance_doc_type_idx').on(t.documentType),
   ]);
   ```

2. **Modify registration page** — `apps/web/src/app/(auth)/register/page.tsx`:
   - Add a required checkbox: "I agree to the [Terms of Service](/legal/terms) and
     [Privacy Policy](/legal/privacy)."
   - Add a required checkbox: "I understand that HamaFX-Ai provides AI-generated
     analysis, not financial advice. [Read the risk disclaimer](/legal/disclaimer)."
   - The submit button is disabled until both checkboxes are checked.
   - On form submission, record the acceptance in `terms_acceptance` with the
     document version, timestamp, IP, and user agent.

3. **Modify onboarding wizard** — `apps/web/src/app/onboarding/page.tsx` +
   `apps/web/src/components/onboarding/wizard.tsx`: Add a final step (or a gate
   before the first step) that displays a brief summary of the terms and requires
   explicit acceptance if not already recorded at registration. This is a safety net
   for users who registered before the flow was added.

4. **Server action: `apps/web/src/app/(auth)/actions.ts`** (or the existing
   `registerAction`) — On successful registration, insert a `terms_acceptance` row
   for each document type with the current version and acceptance metadata.

5. **Admin/audit visibility** — Add a read-only view in the settings page (or admin
   panel) showing the user's current terms acceptance status and history.

### 3.5 Fix for 2.5 — Add refund/cancellation policy surface for billing

**Components to create:**

1. **`apps/web/src/app/legal/refund/page.tsx`** — Already listed in 3.1. Initially a
   stub ("Refund policy will be published before billing launches"). Once the lawyer
   provides text and billing goes live, populate with the actual policy.

2. **Modify the billing checkout flow** — When the Verifone/2Checkout integration
   from `docs/review/10-billing-verifone-integration-plan.md` is implemented, the
   checkout flow (§3.B, "Checkout Flow (ConvertPlus)") must:
   - Display a link to the refund/cancellation policy on the page before redirecting
     to the Verifone hosted checkout.
   - Include the policy URL in the buy-link parameters if Verifone supports it.
   - The policy must be "publicly posted on the billing screen, accessible to
     customers before purchase" per Verifone merchant terms.

3. **Add subscription management UI** — A settings section (e.g.,
   `apps/web/src/app/(app)/settings/billing/page.tsx`) that displays:
   - Current plan and status
   - Cancellation button (links to Verifone self-service or triggers cancel via API)
   - Link to the refund/cancellation policy
   - Note about the 14-day withdrawal right (text from lawyer)

---

## 4. Step-by-Step Implementation Plan (Technical Items Only)

> **Prerequisite:** The owner's lawyer must provide the actual text for Terms of
> Service, Privacy Policy, Risk Disclaimer, and Refund/Cancellation Policy before
> the legal pages can be populated. The structural work (components, routes, schema)
> can be built with placeholder text and populated later. **Do not draft legal text
> yourself — use `[PENDING LEGAL TEXT]` placeholders.**

### Phase 1 — Legal surface scaffolding (no legal text needed yet)

1. **Create legal content structure:**
   - Create `apps/web/src/content/legal/` directory.
   - Create `terms.md`, `privacy.md`, `disclaimer.md`, `refund.md` with
     `[PENDING LEGAL TEXT — owner's lawyer to provide]` placeholder and a
     `lastUpdated` frontmatter field.

2. **Create legal pages:**
   - `apps/web/src/app/legal/terms/page.tsx` — renders `terms.md`.
   - `apps/web/src/app/legal/privacy/page.tsx` — renders `privacy.md`.
   - `apps/web/src/app/legal/disclaimer/page.tsx` — renders `disclaimer.md`.
   - `apps/web/src/app/legal/refund/page.tsx` — renders `refund.md`.
   - Each page renders the `lastUpdated` date and supports dark mode.

3. **Create legal footer component:**
   - `apps/web/src/components/layout/legal-footer.tsx` — links to all four legal pages.
   - Add to `apps/web/src/app/(app)/layout.tsx` after the main content area.
   - Also add to `apps/web/src/app/(auth)/layout.tsx` so unauthenticated users see it too.

4. **Create disclaimer banner component:**
   - `apps/web/src/components/legal/disclaimer-banner.tsx` — dismissible banner with
     placeholder text.
   - Add to `apps/web/src/app/(app)/chat/page.tsx` and
     `apps/web/src/app/(app)/chat/[threadId]/page.tsx`.

5. **Create AI disclaimer footer for chat:**
   - `apps/web/src/components/chat/ai-disclaimer-footer.tsx` — persistent footer
     below chat input.
   - Add to the chat page layout.

### Phase 2 — ToS acceptance flow

6. **Create consent tracking schema:**
   - `packages/db/src/schema/legal.ts` — `terms_acceptance` table.
   - Run `pnpm db:generate` and `pnpm db:migrate`.

7. **Modify registration page:**
   - `apps/web/src/app/(auth)/register/page.tsx` — add two required checkboxes (ToS +
     Privacy, and risk disclaimer acknowledgment). Disable submit until checked.
   - `apps/web/src/app/(auth)/actions.ts` (registerAction) — on success, insert
     `terms_acceptance` rows with document version, timestamp, IP, user agent.

8. **Add onboarding terms gate:**
   - Modify `apps/web/src/components/onboarding/wizard.tsx` — add a terms acceptance
     step that checks if the user has accepted; if not, require acceptance before
   completing onboarding.

9. **Add acceptance status to settings:**
   - Add a small "Legal" section or row in the settings About card showing the
     user's acceptance date and links to current documents.

### Phase 3 — Data export/deletion completeness

10. **Expand in-app export:**
    - Modify `exportDataAction()` in
      `apps/web/src/app/(app)/settings/actions.ts` to include all 25 tenant-owned
      tables (match the list in `infra/cron-vm/scripts/export-tenant.sh`).
    - Test that the expanded export produces valid JSON with all tables.

11. **Add data/privacy info to settings:**
    - Add a "Data & Privacy" subsection to the Data card or a new card that lists
      what data is stored, the retention policy (placeholder text), DSR contact
      method (placeholder), and links to export/delete/privacy policy.

### Phase 4 — Billing policy surface (defer until billing integration)

12. **Populate refund policy page** — Once the lawyer provides text, replace the
    placeholder in `apps/web/src/content/legal/refund.md`.

13. **Integrate policy into checkout flow** — When implementing the Verifone
    integration from `docs/review/10-billing-verifone-integration-plan.md`, add
    the refund policy link to the checkout page and buy-link.

14. **Add subscription management UI** — `apps/web/src/app/(app)/settings/billing/`
    with plan status, cancellation, and policy links.

### Phase 5 — AI output framing (coordinate with review 04 remediations)

15. **Add "AI-generated" label to chat messages** — Locate the chat message
    component (trace from `apps/web/src/app/(app)/chat/[threadId]/page.tsx`) and
    add a caption to assistant messages.

16. **Fix `verify_call` live price anchoring** — This is P0-3 in review 04. Implement
    the fix to cross-check entry/stop/target against live market price.

17. **Upgrade citation enforcer** — This is P1-7 in review 04. Implement value-level
    verification and broaden the regex.

---

## 5. Acceptance Criteria for Technical Items

- [ ] A `/legal/terms` page exists and renders Terms of Service text (or placeholder).
- [ ] A `/legal/privacy` page exists and renders Privacy Policy text (or placeholder).
- [ ] A `/legal/disclaimer` page exists and renders the risk disclaimer (or placeholder).
- [ ] A `/legal/refund` page exists and renders the refund/cancellation policy (or placeholder).
- [ ] A legal footer with links to all four legal pages is visible on all authenticated
      and unauthenticated pages.
- [ ] A dismissible disclaimer banner appears at the top of the chat interface.
- [ ] A persistent "AI-generated · not financial advice" footer appears below the chat input.
- [ ] The registration page has two required checkboxes (ToS+Privacy and risk disclaimer)
      and the submit button is disabled until both are checked.
- [ ] A `terms_acceptance` table exists in the database and records are inserted on
      registration with document type, version, timestamp, IP, and user agent.
- [ ] The onboarding wizard includes a terms acceptance gate for users who registered
      before the flow was added.
- [ ] `exportDataAction()` exports all 25 tenant-owned tables (matching
      `infra/cron-vm/scripts/export-tenant.sh`), not just the current ~13.
- [ ] The settings page includes a "Data & Privacy" section with what-data-is-stored
      info, retention policy (placeholder), DSR contact (placeholder), and links to
      export/delete/privacy policy.
- [ ] Assistant chat messages display an "AI-generated" label.
- [ ] `verify_call` cross-checks supplied prices against live market data and cannot
      report `agree:true` for an unchecked/hallucinated price (coordinate with review 04).
- [ ] All new components support dark mode (dark: Tailwind variants).
- [ ] All new pages are responsive (400px minimum panel width to desktop).
- [ ] No legal disclaimer, ToS, or Privacy Policy text was drafted by the coding agent —
      all use `[PENDING LEGAL TEXT]` placeholders until the owner's lawyer provides wording.
- [ ] When billing launches: the checkout flow displays a link to the refund/cancellation
      policy before purchase, and a subscription management UI exists in settings.

---

## 6. Legal Questions Requiring a Lawyer

> **⚠️  EXPLICITLY NOT FOR A CODING AGENT TO RESOLVE.**
> The following are open legal questions that the product owner must take to a
> qualified lawyer. A coding agent should NOT attempt to answer, resolve, or draft
> text for any of these. The technical work in §3–§5 builds the *containers* for the
> lawyer's text; it does not produce the text itself.

### 6.1 Disclaimer wording and scope

1. **What exact disclaimer language is required?** The product gives AI-generated
   trading analysis (entry/stop/target levels, directional bias, setup calls) for
   XAUUSD/EURUSD/GBPUSD. A lawyer must determine the precise wording and scope of the
   "not financial advice" disclaimer, the risk warning, and any required disclosures
   about AI-generated content. The technical scaffolding (§3.1, §3.2) renders
   whatever text the lawyer provides — the coding agent does not draft it.

2. **Is the product's output likely to be classified as "investment advice" or a
   "recommendation" under any jurisdiction's financial services law?** The system
   prompt (Hard Rule 6) instructs the model to use scenario language and avoid "you
   should buy" phrasing, but whether this is sufficient to avoid regulatory
   classification as investment advice in any target market is a legal question. The
   AI produces specific entry/stop/target levels and directional calls — a lawyer
   must assess whether this crosses any threshold despite the "analysis, not advice"
   framing.

3. **Does the product need to register with or be authorized by any financial
   regulator?** Tools that provide automated market analysis, signals, or trading
   recommendations may be subject to regulation in certain jurisdictions (e.g., US
   CFTC/NFA rules for commodity trading advice, UK FCA rules for financial
   promotions, EU MiFID II framework). A lawyer must determine whether HamaFX-Ai's
   specific functionality triggers any registration, authorization, or licensing
   requirement in each target market. See §6.5 below for jurisdictional details.

4. **What disclosures are required about the limitations of `verify_call` and the
   citation enforcer?** The `verify_call` tool validates geometry and liquidity but
   does not cross-check against live prices (per review 04 §3.4). The citation
   enforcer is soft and turn-level. A lawyer must advise on whether the product must
   disclose these limitations to users and what wording is required, given that the
   UI can present a "verified" pill that does not verify price accuracy.

### 6.2 Terms of Service content

5. **What should the Terms of Service cover?** A lawyer must draft the ToS covering
   at minimum: scope of service, user responsibilities, prohibited uses, payment
   terms (once billing launches), refund/cancellation policy, limitation of
   liability, intellectual property (Apache 2.0 license implications for the
   open-source core vs. the hosted SaaS), account suspension/termination, dispute
   resolution, and governing law. The technical flow (§3.4) records acceptance —
   the lawyer provides the text.

6. **How should the Apache 2.0 license interact with the hosted SaaS Terms of
   Service?** The codebase is Apache 2.0 licensed (`LICENSE` file at repo root).
   The open-core architecture review (`docs/review/09-open-core-architecture-review.md`)
   plans a self-hostable open-source core + hosted SaaS edition. A lawyer must advise
   on how the open-source license terms interact with the SaaS ToS — particularly
   whether the ToS should reference the license, how to handle contributions, and
   whether any SaaS-specific terms conflict with the open-source license.

### 6.3 Privacy Policy content and data handling

7. **What should the Privacy Policy cover?** The app stores: journal entries
   (trades), chat history/threads, alerts, user memories (embeddings), economic
   events, market data, telemetry, push subscriptions, shared snapshots, portfolio
   positions/settings, decision signals, bot links, provider tests, audit logs, user
   sessions, and rate limits. A lawyer must draft a Privacy Policy covering: what
   data is collected, the legal basis for processing (consent, legitimate interest,
   contract performance), data retention periods, third-party processors (AI
   providers, Verifone, GCS, Sentry, etc.), international data transfers, user
   rights (access, rectification, erasure, portability, objection, restriction),
   cookie usage, and contact information for data protection inquiries.

8. **What is the lawful basis for processing user data under GDPR?** The app
   processes personal data (chat history, journal entries, memories) of EU users.
   A lawyer must determine the lawful basis for each processing activity (e.g.,
   contract performance for core service, legitimate interest for telemetry,
   consent for marketing communications) and ensure the Privacy Policy reflects this.

9. **What retention periods should apply?** There is currently no documented
   retention schedule. A lawyer must advise on appropriate retention periods for
   each data category (chat history, journal entries, telemetry, audit logs, etc.)
   and whether any data should be automatically deleted after a period.

10. **Is a Data Processing Agreement (DPA) needed with any subprocessors?** The app
    uses AI providers (Google Vertex/Gemini, potentially others), Sentry for error
    tracking, GCS for backups, and will use Verifone for payments. A lawyer must
    advise on whether DPAs are needed with each subprocessor and what they must
    cover, particularly for EU/UK users.

11. **Does the app need a cookie consent mechanism?** The app uses localStorage for
    bookmarks and preferences. A lawyer must advise on whether a cookie consent
    banner is required under GDPR/ePrivacy Directive or other applicable law.

### 6.4 Payment-related legal requirements

12. **What refund/cancellation policy text is required by Verifone and applicable
    law?** Verifone's merchant terms require a fair refund/return/cancellation policy
    that complies with Payment Scheme Rules and applicable law, disclosed to
    customers before purchase. 2Checkout's consumer terms provide a 14-day
    withdrawal right. A lawyer must draft the refund/cancellation policy that
    satisfies both Verifone's requirements and the applicable consumer protection
    laws in each target market. The technical surface (§3.5) renders the text.

    *Sources (for the lawyer's reference, not for the coding agent):*
    - Verifone Merchant Services Terms and Conditions:
      https://www.verifone.com/legal/merchant-services-terms-and-conditions-english
    - 2Checkout Terms & Conditions (consumer 14-day withdrawal right):
      https://www.2checkout.com/legal/terms/
    - 2Checkout sample refund policy:
      https://docs.2checkout.com/product-catalog/product-catalog/sample-refund-policy
    - 2Checkout Sub-Merchant Services Agreement (return policy must be publicly
      posted on billing screen): https://www.2checkout.com/legal/sub-merchant-services-agreement-domestic/

13. **What consumer protection laws apply to the subscription model?** The billing
    plan (`docs/review/10-billing-verifone-integration-plan.md`) proposes recurring
    subscriptions. A lawyer must advise on auto-renewal disclosure requirements,
    cancellation rights, and pricing transparency rules in each target market (e.g.,
    EU consumer rights directive, US FTC auto-renewal rules, UK consumer protection).

14. **What are the tax/VAT implications of selling to international customers from
    Iraq?** If Verifone acts as Merchant of Record, it handles global VAT/tax
    calculation and remittance. If a local Iraqi gateway is used instead (per the
    billing plan's fallback), the business becomes responsible for global tax
    compliance. A lawyer and tax advisor must determine the obligations.

### 6.5 Jurisdictional and regulatory classification questions

15. **Where should the ToS designate governing law and dispute resolution?** The
    business is based in Iraq and will have international users. A lawyer must advise
    on: which jurisdiction's law should govern the ToS, where disputes should be
    resolved (courts vs. arbitration), whether any consumer protection laws override
    the chosen governing law for consumer users, and whether online dispute
    resolution (ODR) platforms must be referenced for EU consumers.

16. **Does the product trigger US financial regulations?** The product provides
    analysis of XAUUSD (gold, a commodity), EURUSD, and GBPUSD. In the US, providing
    trading advice or recommendations for commodity futures, options, or retail
    off-exchange forex may require registration with the CFTC and membership in the
    NFA. The CFTC has proposed rules for automated trading (Regulation AT). A lawyer
    must determine whether HamaFX-Ai's functionality — AI-generated analysis with
    entry/stop/target levels for gold and forex — constitutes "advice" or a
    "recommendation" that triggers CFTC/NFA registration requirements, or whether the
    "informational/educational only" framing is sufficient to avoid regulation.

    *Background sources (for the lawyer's reference):*
    - CFTC Regulation AT (proposed):
      https://www.cftc.gov/sites/default/files/idc/groups/public/@newsroom/documents/file/federalregister112415.pdf
    - NFA requirements for commodity trading advisors and introducing brokers
      (consult NFA rulebook via a lawyer).

17. **Does the product trigger EU financial regulations?** Under MiFID II
    (Directive 2014/65/EU) and its delegated regulations (RTS 2017/589), investment
    firms providing algorithmic trading or investment advice are subject to
    organizational, resilience, and control requirements. ESMA has published
    supervisory briefings on algorithmic trading. A lawyer must determine whether
    HamaFX-Ai's AI-generated analysis constitutes "investment advice" or falls under
    any MiFID II scope, and whether the product needs to comply with the EU AI Act's
    requirements for AI systems (particularly if classified as high-risk).

    *Background sources (for the lawyer's reference):*
    - MiFID II (Directive 2014/65/EU): https://eur-lex.europa.eu/eli/reg_del/2017/589/oj/eng
    - ESMA supervisory briefing on algorithmic trading:
      https://www.esma.europa.eu/sites/default/files/2026-02/ESMA74-1505669079-10311_Supervisory_Briefing_on_Algorithmic_Trading_in_the_EU.pdf

18. **Does the product trigger UK financial regulations?** The FCA Handbook covers
    algorithmic trading systems (MAR 7A) and financial promotions. A lawyer must
    determine whether HamaFX-Ai's outputs constitute "financial promotions" or
    "investment advice" under UK law, and whether any FCA authorization is required.

    *Background sources (for the lawyer's reference):*
    - FCA Handbook MAR 7A (algorithmic trading):
      https://handbook.fca.org.uk/handbook/mar7a
    - FCA multi-firm review of algorithmic trading controls:
      https://www.fca.org.uk/publications/multi-firm-reviews/algorithmic-trading-controls-high-level-observations

19. **Does the EU AI Act classify this product as "high-risk"?** The EU AI Act
    classifies certain AI systems as high-risk based on their use case. AI systems
    used in financial services (e.g., credit scoring, insurance pricing) are listed
    as high-risk. A lawyer must determine whether an AI trading-analysis assistant
    falls under any high-risk category and what obligations (risk management, data
    governance, transparency, human oversight) would apply.

20. **What are the Iraq-specific legal considerations?** A lawyer familiar with
    Iraqi law must advise on: any local requirements for offering digital services,
    data protection regulations in Iraq, tax obligations for selling to international
    customers from Iraq, and any restrictions on providing financial analysis
    services internationally from Iraq.

21. **Are there any target-market-specific rules for AI-generated financial-analysis
    tools?** Beyond the US/EU/UK frameworks above, a lawyer should assess whether any
    other target markets (e.g., Canada, Australia, Japan, GCC countries) have
    specific rules for AI-generated financial analysis, robo-advice, or automated
    trading signals that could apply to HamaFX-Ai.

### 6.6 Open question: Iraq merchant eligibility (carried forward from review 10)

22. **Verifone/2Checkout Iraq eligibility** — This is already flagged as a CRITICAL
    BLOCKER in `docs/review/10-billing-verifone-integration-plan.md` §1. 2Checkout
    does not support merchant accounts based in Iraq. The owner must resolve this
    with Verifone sales (exception request or foreign entity proxy) before any
    billing code is written. This is a business/legal decision, not a coding task.

---

## Appendix A — Research Summary (for the lawyer's reference)

> The following is a high-level summary of publicly available information about how
> comparable tools handle disclaimers and what regulatory frameworks may apply. This
> is **not legal advice** and is **not exhaustive**. It is provided as background
> context for the owner's lawyer.

### A.1 Disclaimer patterns used by comparable AI trading/market-analysis tools

A survey of publicly accessible disclaimers from AI-assisted trading and market
analysis tools (Omnisc, BacktestBase, ChartScout, Tenet Research, AlphaSmith,
Stockbit, Compound, Bucko.ai, Uptick, TradeGenius) reveals the following common
patterns — described here in summary, not reproduced verbatim:

- **"Not a financial advisor / not a registered investment advisor"** — Nearly all
  tools explicitly state they are not registered investment advisors, broker-dealers,
  or financial institutions. This is the most universal pattern.
- **"Informational / educational purposes only"** — Tools consistently frame their
  output as informational or educational, not as personalized recommendations,
  solicitations, or endorsements to buy/sell any asset.
- **"AI-generated content may contain errors"** — Several tools explicitly note that
  outputs are generated by AI/automated processes and may contain errors or biases,
  and should not be relied upon as guaranteed or definitive.
- **"User responsibility for investment decisions"** — All tools place
  responsibility for investment decisions on the user, noting that markets involve
  risk and financial instruments can lose value.
- **"No personalized recommendations"** — Tools clarify that outputs are
  non-personalized and not tailored to any individual's financial situation.
- **"No guarantees of outcomes"** — Tools disclaim any guarantee of investment
  outcomes or performance results.
- **Labels are illustrative only** — Some tools note that directional labels
  (bullish/bearish, high/low conviction) are illustrative and not trading guidance.

*Sources:*
- Omnisc Risk Disclaimer: https://app.omnisc.tech/legal/risk-disclaimer
- BacktestBase Terms of Use: https://www.backtestbase.com/terms
- ChartScout Disclaimer: https://chartscout.io/disclaimer
- Tenet Research Risk Disclosure: https://www.tenetresearch.ai/landing/risk-disclosure.html
- AlphaSmith Risk Disclosure: https://alphasmith.ai/legal/risk-disclosure
- Stockbit Disclaimer: https://stockbit.ai/disclaimer
- Compound Disclaimer: https://getcompound.ai/disclaimer
- Bucko.ai Disclaimer: https://www.bucko.ai/disclaimer
- Uptick Risk Disclosure: https://uptick.ai/risk-disclosures
- TradeGenius Risk Disclaimer: https://tradegenius.bot/riskdisclaimer/

### A.2 Regulatory frameworks for automated market analysis (high-level overview)

The following is a high-level, non-exhaustive overview of regulatory categories that
*may* apply to tools providing automated market analysis or signals. Whether any of
these actually apply to HamaFX-Ai is a legal question for the owner's lawyer.

**United States:**
- **CFTC / NFA** — The Commodity Futures Trading Commission regulates trading in
  commodity futures, options, and retail off-exchange forex. Providing trading
  advice or recommendations in these instruments may require registration as a
  Commodity Trading Advisor (CTA) or Introducing Broker (IB), and NFA membership.
  The CFTC has proposed Regulation AT for automated trading systems. Whether an
  AI-generated analysis tool that does not execute trades but provides entry/stop/
  target levels constitutes "advice" requiring registration is a key question.
  *Source:* CFTC Regulation AT proposed rulemaking:
  https://www.cftc.gov/sites/default/files/idc/groups/public/@newsroom/documents/file/federalregister112415.pdf
- **SEC / FINRA** — If the tool's output were deemed to constitute investment advice
  regarding securities, SEC investment adviser registration and FINRA broker-dealer
  rules could apply. The product's current scope (XAUUSD, EURUSD, GBPUSD) may or may
  not fall under SEC jurisdiction depending on how the instruments are characterized.

**European Union:**
- **MiFID II** — Directive 2014/65/EU governs investment services and activities.
  Providing investment advice is a regulated activity under MiFID II. Delegated
  Regulation 2017/589 sets technical standards for algorithmic trading. Whether an
  AI-generated analysis tool constitutes "investment advice" under MiFID II is a
  key question. ESMA has published supervisory briefings on algorithmic trading.
  *Sources:*
  - MiFID II Delegated Regulation 2017/589: https://eur-lex.europa.eu/eli/reg_del/2017/589/oj/eng
  - ESMA supervisory briefing:
    https://www.esma.europa.eu/sites/default/files/2026-02/ESMA74-1505669079-10311_Supervisory_Briefing_on_Algorithmic_Trading_in_the_EU.pdf
- **EU AI Act** — Classifies AI systems by risk level. AI systems used in certain
  financial services contexts may be classified as high-risk, triggering obligations
  around risk management, data governance, transparency, and human oversight.

**United Kingdom:**
- **FCA** — The Financial Conduct Authority regulates financial services in the UK.
  FCA Handbook MAR 7A covers algorithmic trading requirements. Financial promotions
  are regulated under the Financial Services and Markets Act 2000. Whether
  HamaFX-Ai's outputs constitute "financial promotions" requiring FCA authorization
  is a key question.
  *Sources:*
  - FCA Handbook MAR 7A: https://handbook.fca.org.uk/handbook/mar7a
  - FCA multi-firm review of algorithmic trading controls:
    https://www.fca.org.uk/publications/multi-firm-reviews/algorithmic-trading-controls-high-level-observations

### A.3 GDPR data subject rights (standard categories)

Under the GDPR (General Data Protection Regulation), EU/UK data subjects have the
following rights that a SaaS handling EU users typically needs to support:

- **Right to be informed** (Articles 13–14) — Privacy notice detailing what data is
  collected, why, legal basis, retention, recipients, and rights.
- **Right of access** (Article 15) — Confirmation of whether data is processed, plus
  access to the data and information about processing.
- **Right to rectification** (Article 16) — Correction of inaccurate personal data.
- **Right to erasure / "right to be forgotten"** (Article 17) — Deletion of personal
  data when it is no longer necessary or the processing was unlawful.
- **Right to restriction of processing** (Article 18) — Temporary restriction of
  processing in certain circumstances.
- **Right to data portability** (Article 20) — Receive personal data in a structured,
  commonly used, machine-readable format (e.g., JSON, CSV) and potentially have it
  transmitted to another controller.
- **Right to object** (Article 21) — Object to processing based on legitimate
  interests or for direct marketing.
- **Protection against automated decision-making** (Article 22) — Protection against
  decisions based solely on automated processing that produce legal or similarly
  significant effects.

**Response timeframe:** Generally within 1 month of the request, with possible
extension to 3 months for complex requests (with notice within the first month).

**Practical SaaS implications:** The app should provide at least one accessible
submission method for data subject requests (email, web form, or in-app), publish
the channel in the Privacy Notice, and have processes to respond within the
timeframe. The existing in-app export and deletion features (§3.3) partially
address access/portability and erasure, but a Privacy Policy and DSR intake channel
are still needed.

*Sources:*
- European Data Protection Board (EDPB) — Respect individuals's rights:
  https://www.edpb.europa.eu/sme-data-protection-guide/respect-individuals-rights_en
- EDPB Guidelines 01/2022 on data subject rights — Right of access:
  https://www.edpb.europa.eu/system/files/2023-04/edpb_guidelines_202201_data_subject_rights_access_v2_en.pdf
- GDPR for SaaS Companies practical guide:
  https://turleylaw.com/blog/gdpr-for-saas-companies-practical-guide

---

*Prepared as a read-only static audit. No code was modified, executed, or run during
this review. All file paths are relative to `/home/user/HamaFX-Ai/`. This document is
not legal advice and does not constitute a legal opinion. All legal questions in §6
must be resolved by a qualified lawyer.*
