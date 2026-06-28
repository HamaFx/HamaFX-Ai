# 12 — Roadmap

> Project roadmap. Phases scoped by value. Each phase ended with a working, deployed product.

## Completed Phases

### Phase 0 — Scaffold ✅ DONE
Empty-but-real project deploys to Vercel, auth gate works, design system renders.

### Phase 1 — MVP ✅ DONE
Focused chat trading copilot: live data, chart, AI chat with tools, news, calendar, alerts, journal.

### Phase 2 — v1 ✅ DONE
SMC indicators, RAG memory, Telegram alerts, voice input, briefings, weekly review.

### Phase 3 — v2 ✅ DONE
Vision (chart screenshots), Pro chart widget, multi-agent committee deliberation.

### Phase 4 — Multi-Agent Orchestration ✅ DONE
Domain-based model routing, per-agent model overrides, analysis modes (single/quick/standard/full/auto).

### Phase 5 — Hardening ✅ DONE
Sentry, backup/restore verification, rate limiting, cost guardrails, CSRF hardening.

### Phase 6 — Testing & Debuggability ✅ DONE
Test infrastructure upgrade, diagnostic context, redaction, tool telemetry.

### Phase 7 — UX Upgrade ✅ DONE
Phases A/B/C/D/E shipped: premium dark UI, nav drawer, command palette, PWA install, model picker, API keys overhaul.

### Phase 8 — Data Layer ✅ DONE
BiQuote SignalR, Twelve Data retired, provider failover, health tracking, throttling.

### Phase 9 — Multi-Tenant v2.0 ✅ DONE
NextAuth.js v5, Drizzle adapter, BYOK per user, strict userId scoping, onboarding wizard.

## Known Issues

- **Auth system bugs** — See [`AUTH_FIX_PLAN.md`](../AUTH_FIX_PLAN.md) for 5 critical security bugs, 5 high-severity issues, and improvement plan.
- **2FA not enforced at login** — Users with 2FA enabled can log in without TOTP code.
- **`tokenVersion` not checked** — "Sign out everywhere" doesn't invalidate old JWTs.
- **Session tracking empty** — `userSessions` table never populated during login.

## Future Plans

### Phase 10 — Auth Hardening
- Fix all critical bugs in `AUTH_FIX_PLAN.md`
- Implement email verification
- Add password reset flow
- Add OAuth providers (Google, GitHub)
- Add account lockout after failed attempts

### Phase 11 — Observability
- Langfuse integration for LLM tracing
- Enhanced Sentry dashboards
- Real-time cost monitoring alerts

### Phase 12 — Mobile App
- React Native wrapper or Capacitor
- Push notifications (native)
- Biometric authentication

### Phase 13 — Trading Automation
- MT5 bridge integration
- Order execution from chat
- Risk management automation
- Backtesting framework

---

*This roadmap is indicative, not binding. Priorities shift based on user feedback and project needs.*
