# HamaFX-Ai Incident Response Playbook

> **Phase 5.6 deliverable.** Extends `infra/cron-vm/RECOVERY.md` — do not
> replace it. RECOVERY covers *infrastructure* restore (DB, journal, VM,
> key rotation). This document covers *customer-facing* incident response:
> severity taxonomy, SLOs, on-call paging, status page, comms templates,
> symptom-triage runbooks, and a postmortem template.

---

## 1. Severity Taxonomy

| SEV | Definition | Response Target | Restore Target | Notify |
|-----|-----------|----------------|----------------|--------|
| **SEV1** | Full outage: chat, auth, or AI gateway down for all users. Data loss. Billing failure. | 15 min | 1 hour | Status page + page on-call + email all users |
| **SEV2** | Major degradation: chat slow (>10s latency), one provider down, cron stuck >2h, or partial outage affecting >25% of users. | 30 min | 4 hours | Status page + page on-call |
| **SEV3** | Minor degradation: intermittent errors, single cron failure (non-critical), UI bugs with workaround. | 2 hours | 1 business day | Status page (degraded) + Slack/email on-call |
| **SEV4** | Cosmetic / non-urgent: docs drift, minor UI glitch, log noise. | 1 business day | Next release | Internal only |

## 2. SLOs (Service Level Objectives)

| Service | SLI (Indicator) | Target | Window |
|---------|----------------|--------|--------|
| Chat API | Success rate (non-429/4xx) | 99.5% | 30 days |
| Auth | Login success rate (excluding user error) | 99.9% | 30 days |
| AI Gateway | Tool call success rate | 99.0% | 30 days |
| Worker | Tick flush success rate | 99.9% | 30 days |
| Cron Jobs | Job completion rate | 99.5% | 30 days |
| /api/health | Uptime | 99.9% | 30 days |

**Error budget:** 0.1% of requests per 30 days. When consumed, freeze
non-critical deploys and prioritize reliability work.

## 3. On-Call & Paging

### Paging Stack (recommended)

1. **healthchecks.io** — cron/worker heartbeat liveness (already configured)
2. **Sentry** — error spikes, auth anomalies (Phase 5.4), sustained worker failures (Phase 5.2)
3. **Better Stack** (or PagerDuty) — on-call scheduling + phone/push escalation
   - Uptime probe on `/api/health` (1-min interval)
   - Alert routing: Sentry critical → Better Stack → phone/push
   - Escalation: 5 min → secondary on-call → 15 min → all-hands

### Status Page

- **Tool:** Instatus or Better Stack status page
- **URL:** `status.hamafx-ai.com` (or subdomain of choice)
- **Monitors:**
  - `/api/health` (1-min probe, 2-min grace)
  - Worker heartbeat (via healthchecks.io integration)
  - AI gateway latency (custom probe, optional)
- **Incident states:** Operational → Degraded → Partial Outage → Major Outage → Maintenance

### Setup Checklist

- [ ] Create Better Stack account + on-call schedule
- [ ] Add uptime monitor for `/api/health`
- [ ] Connect Sentry → Better Stack webhook for SEV1/SEV2 alerts
- [ ] Create public status page (Instatus or Better Stack)
- [ ] Configure status page components (Chat, Auth, AI Gateway, Worker, Cron)
- [ ] Test: take `/api/health` down → verify status page flips + on-call is paged
- [ ] Add `HC_CLEANUP_UPLOADS_UUID` and `HC_JOB_RESONANCE_SYNC_UUID` to RECOVERY.md UUID table (Phase 6.4)

## 4. Customer-Facing Outage Runbooks

### 4.1 Chat Down (SEV1)

**Symptoms:** `/api/chat` returning 500s or timing out for all users.

**Triage:**
1. Check `/api/health` — is DB up? Is pgvector installed?
2. Check Sentry for error spike — is it the AI gateway, the agent, or the DB?
3. Check Vercel status page — is there a platform incident?
4. If AI gateway: check `AI_GATEWAY_API_KEY` validity, try fallback providers
5. If DB: follow `RECOVERY.md` Scenario 1

**Comms:**
- Status page: "We're investigating elevated error rates on the chat service."
- Update within 30 min: root cause + ETA, or "still investigating."
- Resolve: "Chat service has been restored. [Postmortem link]."

### 4.2 Auth Down (SEV1)

**Symptoms:** Users cannot log in; 401 rate spike; `ACCOUNT_LOCKED` spike.

**Triage:**
1. Check Sentry auth-anomaly alerts (Phase 5.4)
2. Check DB connectivity — can `users` table be queried?
3. Check `AUTH_COOKIE_SECRET` is set and valid
4. Check if NextAuth JWT signing key has rotated without updating env
5. If credential stuffing: enable IP-based rate limiting, consider temporary captcha

**Comms:**
- Status page: "We're investigating authentication issues. Users may be unable to sign in."
- Update: "Authentication has been restored. If you were locked out, your account will unlock automatically."

### 4.3 AI Gateway Down (SEV1/SEV2)

**Symptoms:** All AI tool calls failing; chat returns "tool failed" messages.

**Triage:**
1. Check which provider(s) are affected — is it the gateway or a specific model?
2. Check `AI_GATEWAY_API_KEY` and provider-specific keys
3. Check provider status pages (Google AI, OpenAI, etc.)
4. If BYOK: check if users' own keys are the issue (check `byok_providers` table)
5. If gateway: switch to direct provider calls as fallback (if configured)

**Comms:**
- Status page: "AI analysis features are degraded. We're investigating."
- Update: "AI services have been restored." or "AI services are operating in degraded mode with provider X."

## 5. Incident Comms Templates

### Initial Notification (SEV1/SEV2)

```
Subject: [INCIDENT] {service} is {degraded/down}

We've detected a {SEV1/SEV2} incident affecting {service}.

Impact: {description of what users experience}
Started: {timestamp UTC}
Status: Investigating

We'll provide an update within {15/30} minutes or as soon as we have more information.

— HamaFX-Ai Team
```

### Resolution Notification

```
Subject: [RESOLVED] {service} incident

The incident affecting {service} has been resolved.

Duration: {start} – {end} ({total})
Root cause: {brief description}
Impact: {number of users/sessions affected}

A full postmortem will be available at {link} within {timeframe}.

— HamaFX-Ai Team
```

## 6. Postmortem Template

```markdown
# Postmortem: {Incident Title}

**Date:** {YYYY-MM-DD}
**SEV:** {1/2/3}
**Duration:** {start – end}
**Authors:** {names}

## Summary

{1-2 paragraph description of what happened and the impact}

## Timeline (all times UTC)

| Time | Event |
|------|-------|
| 00:00 | Alert triggered (Sentry / healthchecks / user report) |
| 00:05 | On-call paged |
| 00:10 | Investigation began |
| 00:30 | Root cause identified |
| 01:00 | Fix deployed |
| 01:15 | Verified resolved |

## Root Cause

{Detailed technical explanation of what caused the incident}

## Contributing Factors

{What made the incident worse or harder to detect?}

## What Went Well

{Things that worked: alerting fired, runbook was followed, etc.}

## What Went Poorly

{Things that didn't work: alert was delayed, runbook was missing, etc.}

## Action Items

| Action | Owner | Priority | Status |
|--------|-------|----------|--------|
| {action} | {name} | P0/P1/P2 | Todo/Done |
| {action} | {name} | P0/P1/P2 | Todo/Done |

## Lessons Learned

{What should we do differently next time?}
```

## 7. Healthchecks UUID Table (extends RECOVERY.md)

| UUID env var | Purpose | Expected cadence |
|-------------|---------|-----------------|
| `HC_SIGNALR_UUID` | SignalR consumer liveness | 30s heartbeat |
| `HC_CLEANUP_UPLOADS_UUID` | Upload cleanup cron | Daily |
| `HC_JOB_RESONANCE_SYNC_UUID` | Resonance sync job | Daily (when enabled) |

> **Note:** `HC_CLEANUP_UPLOADS_UUID` and `HC_JOB_RESONANCE_SYNC_UUID`
> were missing from the original RECOVERY.md UUID table. Add them to
> the healthchecks.io account and set the env vars on the cron VM.
