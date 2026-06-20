# 15 — Motion Conventions

> Phase C — UX_UPGRADE_PLAN.md item 18.
> **Status:** global `prefers-reduced-motion` is already implemented in
> `apps/web/src/app/globals.css`. This document captures the
> developer-facing convention so new animations stay compliant.

## TL;DR

  - All `animate-*` and `transition-*` utilities are already
    neutered globally when the OS reports `prefers-reduced-motion:
    reduce` (see `globals.css` line 411).
  - The user can also force this state on a per-device basis
    through the **Settings → Preferences** toggle. That sets
    `data-reduce-motion="force"` on `<html>` and the same CSS
    rules apply.
  - When writing NEW animation, decorate with the explicit
    `motion-safe:` (or `motion-reduce:animate-none`) modifier.
    This is belt-and-braces — the global override would catch
    the same case, but the explicit modifier makes the intent
    obvious to the next reader.

## Which `animate-*` classes are in the codebase

`grep -RE 'animate-(in|pulse|spin|ping|bounce)' apps/web/src`

  - `animate-pulse` — the "thinking" dot in the chat composer
    (composer.tsx:274), the typing indicator in message-list.tsx
    (3 dots), and ~25 skeleton-loader placeholders in the chat
    tool parts. **Decorative** — all of them.
  - `animate-in fade-in slide-in-from-right-4` — the wizard
    step transition (wizard.tsx × 4), chart view entrance
    (chart-view.tsx, journal-view.tsx), and a few one-shot page
    loaders. **Decorative** — a fade or slide with no
    information content.
  - `motion.*` in the composer (`m.button` Send/Stop morph).
    **Functional** — the button morphs between ArrowUp and
    Square; with reduce-motion this should still happen but
    instantly.

## Convention

### Decorative

Pure visual polish. Add the `motion-safe:` prefix so the
animation only runs when the user has not requested reduce:

```tsx
// before
<span className="bg-brand size-1.5 animate-pulse rounded-full" />

// after
<span className="bg-brand motion-safe:animate-pulse size-1.5 rounded-full" />
```

The `motion-safe:` variant is a Tailwind v4 feature that scopes
the utility to `prefers-reduced-motion: no-preference`. Combined
with the global override, the animation is suppressed in BOTH
the OS-reduce case AND the user-forced case.

### Functional

Has a UX meaning (button morph, drawer slide). Honour the OS
preference at the React level:

```tsx
import { useReducedMotion } from 'motion/react';
const prefersReduced = useReducedMotion();
const transition = prefersReduced
  ? { duration: 0 }
  : { type: 'spring', stiffness: 400, damping: 25 };
```

The composer's `m.button` is the only functional motion today
(see `composer.tsx` line 395-401 in the original; after Phase B
the path is `composer.tsx:395`). Replace the spring config with
a `duration: 0` override when `useReducedMotion()` returns true.

### Skeleton loaders

Skeleton placeholders in tool parts use `animate-pulse` to
signal "loading." With reduce-motion, the static grey bar is
**more accessible** than a pulsing one (no visual noise). Mark
all skeletons as `motion-safe:animate-pulse`.

## Grep guard

CI runs this check to catch new animations without a
`motion-safe:` (or explicit `motion-reduce:animate-none`)
companion. False positives are OK — adding the modifier is a
zero-cost documentation improvement.

```bash
# Fails if any animate-* class is missing motion-safe: or
# motion-reduce:animate-none on the same element.
grep -rE 'animate-(in|pulse|spin|ping|bounce)' apps/web/src \
  | grep -vE 'motion-safe:|motion-reduce:animate-none|motion-reduce:transition-none'
```

The grep is conservative: it flags every animation utility. A
false positive is just a class name containing the substring
(e.g. an unrelated comment). True positives are real animations
the author should tag.

## Rationale

WCAG 2.3.3 (Animation from Interactions, AAA) is the
authoritative spec. We don't claim AAA conformance — the app
is large and animations are widespread — but the convention
keeps new code aligned with the spec and gives the user a
single opt-out for the cases that would otherwise distract
them.
