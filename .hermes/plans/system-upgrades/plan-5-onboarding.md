# Plan 5 — Onboarding System Upgrade

**Priority:** P2 — Major UX overhaul
**Estimated files touched:** 8
**Goal:** Make the onboarding wizard clean, reliable, and cool — with proper validation, smooth flow, and a polished design.

---

## Current Architecture

### Flow
```
Register → signIn(redirectTo: '/onboarding') → Wizard (4 steps) → completeOnboardingAction → /chat
```

### Files
| File | Role |
|------|------|
| `app/(auth)/actions.ts` | `registerAction` — creates user + `userSettings` row with `onboardingCompleted: false` |
| `app/onboarding/page.tsx` | Entry page — checks auth, redirects to `/chat` if already onboarded |
| `app/onboarding/layout.tsx` | Minimal layout wrapper |
| `app/onboarding/actions.ts` | `completeOnboardingAction` — saves preferences, sets `onboardingCompleted: true` |
| `components/onboarding/wizard.tsx` | 14KB wizard component with 4 steps |

### Current Wizard Steps
1. **Welcome** — app description
2. **Display Name** — text input for user's name
3. **Preferences** — default symbol (select), timezone (free text), trading style (select)
4. **API Keys** — provider selection + key input + test button

---

## 🔴 Bugs (10)

### Bug 1: Wrong redirect path — `/auth/login` instead of `/login` (P0)
**File:** `app/onboarding/page.tsx`
```ts
redirect('/auth/login');  // ← 404
```

**Fix:** `redirect('/login');`

### Bug 2: `displayName` collected but never saved (P1)
**File:** `app/onboarding/actions.ts`
The wizard collects `displayName` but `completeOnboardingAction` never updates the `users` table.

**Fix:** Parse `displayName` from input and update users table.

### Bug 3: Unguarded `JSON.parse` crashes server action (P1)
**File:** `app/onboarding/actions.ts`
```ts
const prefs = JSON.parse(input); // crashes on malformed input
```

**Fix:** Wrap in try-catch with error return.

### Bug 4: No onboarding check on login or in app layout (P1)
**File:** `app/(auth)/login/page.tsx`, `app/(app)/layout.tsx`
Returning users who abandoned the wizard mid-way bypass it forever.

**Fix:** After login, check `onboardingCompleted` and redirect to `/onboarding` if false.

### Bug 5: CSRF token missing on test-provider fetch (P1)
**File:** `components/onboarding/wizard.tsx`
API key test always fails with 403.

**Fix:** Add `...withCsrf()` to the fetch call.

### Bug 6: No error feedback to user on submit failure (P1)
**File:** `components/onboarding/wizard.tsx`
Only `console.error` is called. User sees nothing.

**Fix:** Show error toast and keep user on current step.

### Bug 7: Server action throws instead of returning error (P1)
**File:** `app/onboarding/actions.ts`
Triggers error boundary instead of showing validation messages.

**Fix:** Return `{ ok: false, error: string }` consistently.

### Bug 8: Timezone free-text without validation (P2)
**File:** `components/onboarding/wizard.tsx`
Users can enter "Mars time" or leave it blank.

**Fix:** Use `<select>` with `Intl.supportedValuesOf('timeZone')`.

### Bug 9: BTCUSD offered but doesn't exist in SYMBOLS (P2)
**File:** `components/onboarding/wizard.tsx` line 178
Selecting BTCUSD causes chart 404s and validation failures.

**Fix:** Remove BTCUSD or add it to the symbol catalog with full support.

### Bug 10: Refresh loses all progress (P2)
**File:** `components/onboarding/wizard.tsx`
Wizard state is in React state only. Refreshing resets to step 1.

**Fix:** Persist wizard state to `sessionStorage` and restore on mount.

---

## 🟡 Improvements (8)

### Imp 1: Add Zod validation for all wizard fields
```ts
const onboardingSchema = z.object({
  displayName: z.string().min(2, 'Name must be at least 2 characters').max(100),
  defaultSymbol: z.enum(['XAUUSD', 'EURUSD', 'GBPUSD']),
  timezone: z.string().refine(tz => Intl.supportedValuesOf('timeZone').includes(tz)),
  tradingStyle: z.enum(['scalper', 'day_trader', 'swing', 'position']),
});
```

### Imp 2: Make server action return consistent error type
All server actions should return `{ ok: boolean, error?: string }`. Never throw.

### Imp 3: Fix race condition in user symbols seeding
Use a transaction for the 3 default symbol inserts.

### Imp 4: Add re-onboarding option from Settings
Add a "Reset onboarding" button in Settings that sets `onboardingCompleted = false` and redirects to `/onboarding`.

### Imp 5: Replace timezone free-text with select
Use `Intl.supportedValuesOf('timeZone')` to populate a dropdown.

### Imp 6: Add disabled state on Continue button during validation
`disabled={isSubmitting || !isStepValid}`

### Imp 7: Add keyboard navigation
Enter to advance, Escape to go back, Tab through fields naturally.

### Imp 8: Conditional field updates
If user selects "Scalper", show preferred timeframes (1m, 5m). If "Swing", show 4H, Daily.

---

## 🔵 Polish (8)

### Polish 1: Add step transition animations
Use `motion` (already installed) for smooth slide/fade transitions between steps.

### Polish 2: Add stepper with labels
```
● Welcome → ● Profile → ○ Preferences → ○ API Keys
```

### Polish 3: Add welcome/landing screen with app preview
Brief animated intro: "Your AI trading copilot" with key features and icons.

### Polish 4: Improve provider card visual hierarchy
Provider cards with logo/icon, "Free" badge, "Recommended" badge, expandable setup instructions.

### Polish 5: Add field tooltips
Each field should have a tooltip icon explaining what it does.

### Polish 6: Add review/edit links on final step
Summary screen with edit links before completing.

### Polish 7: Add loading skeleton during server action
Show skeleton/spinner instead of frozen button.

### Polish 8: Mobile optimization
Larger touch targets, responsive layout, no horizontal scrolling, keyboard doesn't cover inputs.

---

## 🟢 Upgrades (10)

### Upgrade 1: Add trading style selection with visual cards
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   📊 Scalper │ │  📈 Day     │ │  🔄 Swing   │ │  🏛 Position │
│   1m - 15m   │ │  5m - 1H    │ │  1H - 4H    │ │  Daily+     │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

### Upgrade 2: Add risk management configuration
Risk per trade: 0.5% / 1% / 2% / 3%. Max daily loss: 2% / 3% / 5%. Optional account size.

### Upgrade 3: Add multi-select preferred symbols
Checkbox grid: ☑ XAUUSD (Gold) ☑ EURUSD (Euro) ☑ GBPUSD (Pound) ☐ BTCUSD (Bitcoin)

### Upgrade 4: Add AI personality presets
Concise / Detailed / Socratic / Mentor communication styles.

### Upgrade 5: Add model selection step
After API key setup, pick default model from configured providers. Highlight free-tier models.

### Upgrade 6: Add incremental save per step
Save each step as user advances. Prevents data loss if user abandons mid-wizard.

### Upgrade 7: Add "Express Setup" skip option
"Skip for now" button on welcome screen. Sets defaults. "You can complete setup later in Settings."

### Upgrade 8: Add notification channel setup
Email, Telegram, and push notification configuration during onboarding.

### Upgrade 9: Add confetti/celebration on completion
Brief celebration with confetti, followed by "You're all set! 🎉 Taking you to your dashboard…"

### Upgrade 10: Add BYOK explainer with video/link
"HamaFX-Ai is Bring Your Own Key" explainer with documentation link and provider comparison.

---

## Proposed New Onboarding Flow

```
Step 0: Welcome (animated intro, "Let's get you set up — 2 minutes")
  ↓
Step 1: Profile (display name + timezone select)
  ↓ (incremental save: name + timezone)
Step 2: Trading Style (visual cards: Scalper/Day/Swing/Position)
  ↓ (incremental save: trading style + risk settings)
Step 3: Preferred Symbols (multi-select with categories)
  ↓ (incremental save: user_symbols)
Step 4: API Keys (provider cards with setup instructions)
  ↓ (test key → incremental save: encrypted keys)
Step 5: Model Selection (pick default model from configured providers)
  ↓ (incremental save: default model)
Step 6: Review & Complete (summary with edit links → confetti → /chat)
```

**Express Setup:** "Skip for now" available at every step → sets defaults → `/chat`

---

## Implementation Order

### Phase A: Critical Bug Fixes
1. Fix redirect path (Bug 1)
2. Fix displayName not saved (Bug 2)
3. Fix JSON.parse crash (Bug 3)
4. Fix onboarding check on login (Bug 4)
5. Fix CSRF on test-provider (Bug 5)
6. Fix error feedback (Bug 6)
7. Fix server action error handling (Bug 7)

### Phase B: Data & Validation
1. Add Zod validation (Imp 1)
2. Fix timezone to select (Imp 5, Bug 8)
3. Fix BTCUSD option (Bug 9)
4. Add sessionStorage persistence (Bug 10)
5. Fix race condition in symbol seeding (Imp 3)

### Phase C: UX Improvements
1. Add disabled state on Continue (Imp 6)
2. Add keyboard navigation (Imp 7)
3. Add re-onboarding from Settings (Imp 4)
4. Add conditional fields (Imp 8)

### Phase D: Design & Polish
1. Add step transition animations (Polish 1)
2. Add stepper with labels (Polish 2)
3. Add welcome screen (Polish 3)
4. Improve provider cards (Polish 4)
5. Add tooltips (Polish 5)
6. Add review step (Polish 6)
7. Add loading skeleton (Polish 7)
8. Mobile optimization (Polish 8)

### Phase E: Feature Upgrades
1. Trading style visual cards (Upgrade 1)
2. Risk management config (Upgrade 2)
3. Multi-select symbols (Upgrade 3)
4. AI personality presets (Upgrade 4)
5. Model selection step (Upgrade 5)
6. Incremental save (Upgrade 6)
7. Express setup skip (Upgrade 7)
8. Notification setup (Upgrade 8)
9. Confetti (Upgrade 9)
10. BYOK explainer (Upgrade 10)

---

## Completion Checklist

- [ ] Bug 1 — Redirect uses `/login`
- [ ] Bug 2 — displayName saved to users table
- [ ] Bug 3 — JSON.parse wrapped in try-catch
- [ ] Bug 4 — Onboarding check on login
- [ ] Bug 5 — CSRF on test-provider
- [ ] Bug 6 — Error toast on submit failure
- [ ] Bug 7 — Server action returns `{ ok, error }`
- [ ] Bug 8 — Timezone uses select
- [ ] Bug 9 — BTCUSD removed or supported
- [ ] Bug 10 — sessionStorage persistence
- [ ] Imp 1 — Zod validation on all fields
- [ ] Imp 2 — Consistent error returns
- [ ] Imp 3 — Transaction for symbol seeding
- [ ] Imp 4 — Re-onboarding from Settings
- [ ] Imp 5 — Timezone select dropdown
- [ ] Imp 6 — Disabled state on Continue
- [ ] Imp 7 — Keyboard navigation
- [ ] Imp 8 — Conditional field updates
- [ ] Polish 1 — Step transition animations
- [ ] Polish 2 — Stepper with labels
- [ ] Polish 3 — Welcome/landing screen
- [ ] Polish 4 — Provider card visual hierarchy
- [ ] Polish 5 — Field tooltips
- [ ] Polish 6 — Review/edit summary step
- [ ] Polish 7 — Loading skeleton
- [ ] Polish 8 — Mobile optimization
- [ ] Upgrade 1 — Trading style visual cards
- [ ] Upgrade 2 — Risk management config
- [ ] Upgrade 3 — Multi-select symbols
- [ ] Upgrade 4 — AI personality presets
- [ ] Upgrade 5 — Model selection step
- [ ] Upgrade 6 — Incremental save per step
- [ ] Upgrade 7 — Express setup skip
- [ ] Upgrade 8 — Notification channel setup
- [ ] Upgrade 9 — Confetti on completion
- [ ] Upgrade 10 — BYOK explainer
