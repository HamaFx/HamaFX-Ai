# Frontend New Features & Ideas Plan

> **Scope:** Net-new capabilities and product ideas for `apps/web`. This is the **ambition** document —
> bugs, polish, and fixes for *existing* features live in `docs/FRONTEND_FIXES_AND_POLISH_PLAN.md`.
> **North star:** make HamaFX-Ai feel like a **premium, AI-native trading terminal** — chat-first,
> data-dense where it matters, cinematic in the moments that earn trust, and unmistakably *not*
> generic AI-template UI.
>
> **Implementation plans** for the approved features are in:
> - `docs/PHASE_1_AI_EXPERIENCE_AND_DASHBOARD.md`
> - `docs/PHASE_2_JOURNAL_ALERTS_ONBOARDING_SYSTEMS.md`

## Approved features (after user review)

### Chat & AI (§2)
- ✅ 2.1 Cinematic multi-agent committee theater
- ✅ 2.2 Inline mini-visuals in tool cards
- ✅ 2.3 Trust layer on assistant messages
- ✅ 2.4 Reasoning / "thinking" panel
- ✅ 2.5 Thread summary header
- ❌ ~~2.6 Regenerate compare / model A-B~~
- ❌ ~~2.7 Voice mode upgrades~~
- ❌ ~~2.8 Command palette as trading command bar~~
- ❌ ~~2.9 Keyboard shortcut system~~

### Dashboard (§3)
- ✅ 3.1 Modular customizable dashboard canvas
- ✅ 3.2 AI morning/market briefing card
- ✅ 3.3 P&L calendar heatmap
- ✅ 3.4 "Today at a glance" hero

### Journal (§4)
- ✅ 4.1 Rich analytics suite
- ❌ ~~4.2 Chart-attached trade replay~~
- ✅ 4.3 Setup tagging + tag analytics
- ✅ 4.4 AI trade review
- ✅ 4.5 Screenshot / import trades

### Alerts (§5)
- ❌ ~~5.1 Visual alert builder on the chart~~
- ✅ 5.2 Decision-signal feedback loop UI
- ✅ 5.3 Smart alert digest & noise control UX
- ❌ ~~5.4 Alert templates~~

### Onboarding & Auth (§6)
- ✅ 6.1 Interactive, progress-saved onboarding
- ❌ ~~6.2 Biometric / passkey auth~~
- ❌ ~~6.3 2FA recovery codes + security center~~

### Cross-Cutting (§7)
- ✅ 7.1 Real light theme (or remove affordance)
- ✅ 7.2 Shared TimeProvider + live-data fabric
- ✅ 7.3 PWA depth
- ✅ 7.4 Personalization layer
- ❌ ~~7.5 Haptics + tactile feedback~~
- ✅ 7.6 Shareable, branded snapshots

### Charts (§1)
- ❌ ~~All chart features deferred — no chart-page changes for now.~~

---

## Design Compass (so new features stay premium, not slop)

Built from premium references — TradingView (efficiency-first terminal), Coinbase Advanced (modular
20+ widget canvas), institutional terminals (TradeX/Nova), and AI-native chat-trading case studies
(Trinigence, MarketMind) — plus the 2026 fintech trend set (AI-assisted contextual insight,
biometric-first auth, real-time scalable dashboards, behavioral/decision-confidence patterns).

Rules every new feature must follow:
1. **Chat is the spine, dashboards are the muscle.** New surfaces should be reachable from, and
   linkable into, the chat (pin/expand to chat, "ask AI about this").
2. **Earn trust visibly.** Anything the AI asserts shows provenance: model badge, data source, time,
   confidence, and a one-tap "verify".
3. **Density with hierarchy.** Use desktop width for terminal-grade layouts; never dump raw numbers —
   rank them.
4. **Motion only when it means something** (state change, reveal, confirmation). No filler.
5. **One token system.** Reuse the tool-card registry and semantic tokens; no bespoke palettes.

---

## What "Unique & Premium" Means Here (anti-template guardrails)

- **Signature moment:** the multi-agent committee theater (2.1) is the brand's wow — invest in it.
- **Terminal, not template:** modular dashboard, inline mini-visuals, P&L heatmap, signal scorecards
  make it read as a *trading terminal*, not a chat wrapper.
- **Trust is the feature:** model badges, citations, confidence, verify, signal scorecards — premium
  fintech AI wins on trust, not gradients.
- **Consistent restraint:** pure-black OKLCH + glass, functional motion, tokenized color, tabular
  numerals, density-with-hierarchy. No purple-gradient hero blobs, no decorative AI clip-art, no raw
  palette colors.
