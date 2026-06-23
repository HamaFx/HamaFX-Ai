# Plan 1 — Symbol Selection & Management Upgrade

**Priority:** P1 — Core feature upgrade
**Estimated files touched:** 12
**Goal:** Users can add and delete their wanted symbols easily, with the watchlist connected to all app surfaces (chart, chat, alerts, journal).

---

## Current Architecture

The symbol system has **three disconnected layers** that never talk to each other:

1. **Hardcoded `SYMBOLS` array** (`packages/shared/src/symbols.ts`) — only 3 instruments: XAUUSD, EURUSD, GBPUSD. Used by chart, alerts, journal, chat.
2. **DB `user_symbols` table** (`packages/db/src/schema/auth.ts`) — per-user watchlist with ordering. `symbol` column is unvalidated text — any string can be stored.
3. **localStorage `defaultSymbol`** (`preferences-card.tsx`) — hardcoded to 3 symbols, completely separate from DB.

The settings/symbols page is a **dead-end feature** — users can add/remove symbols in the DB, but nothing in the app reads from `user_symbols` except the settings page itself.

---

## 🔴 Bugs (10)

### Bug 1: Empty-string symbols can be persisted
**File:** `settings/symbols/page.tsx` lines 29-31
```ts
let symbol = formData.get('symbol') as string;
if (!symbol) return;        // ← checks BEFORE trim
symbol = symbol.trim().toUpperCase();  // ← trim happens AFTER
```
If user enters `"   "`, it passes the guard, becomes `""` after trim, and gets inserted.

**Fix:** Trim first, then check:
```ts
let symbol = (formData.get('symbol') as string)?.trim().toUpperCase();
if (!symbol || symbol.length < 2) return;
```

### Bug 2: No validation against supported symbol list
**File:** `settings/symbols/page.tsx` lines 30-31
User can add `"BTCUSD"`, `"AAPL"`, `"HELLO"` — but chart page 404s for anything outside the 3 hardcoded symbols.

**Fix:** Validate with `isSymbol()` or make the catalog dynamic (see Upgrade 1).

### Bug 3: Onboarding wizard offers BTCUSD which doesn't exist in SYMBOLS
**File:** `onboarding/wizard.tsx` line 178
```tsx
<option value="BTCUSD">Bitcoin (BTCUSD)</option>
```
If user selects BTCUSD: chart 404s, preferences-card silently rejects it, SymbolSchema fails.

**Fix:** Remove BTCUSD option OR add it to SYMBOLS with full system support.

### Bug 4: Chart SymbolPicker ignores user's watchlist entirely
**File:** `chart/symbol-picker.tsx` line 33
```tsx
options={SYMBOLS.map((s) => ({ value: s, label: s }))}
```
Always shows 3 hardcoded symbols. User's watchlist has zero effect on the chart page.

**Fix:** Pass user's watchlist from server component into SymbolPicker.

### Bug 5: ChatScreen duplicates Symbol type as string literal union
**File:** `chat/chat-screen.tsx` lines 65, 375
```ts
pinnedSymbol: 'XAUUSD' | 'EURUSD' | 'GBPUSD' | null;
```
Duplicates `Symbol | null` from `@hamafx/shared`. Won't update if symbols are added.

**Fix:** `import type { Symbol } from '@hamafx/shared'; pinnedSymbol: Symbol | null;`

### Bug 6: Race condition in displayOrder calculation
**File:** `settings/symbols/page.tsx` lines 37-42
Two concurrent `addSymbol` calls can both read the same `existing` set, compute the same `nextOrder`, and insert with duplicate order values.

**Fix:** Use `COALESCE(MAX(display_order), -1) + 1` in a single SQL query.

### Bug 7: Silent failure on add — no user feedback
**File:** `settings/symbols/page.tsx` lines 55-58
```ts
} catch {
  // ignore
}
```
If DB is down, user sees nothing — no toast, no error.

**Fix:** Surface error via redirect with error param or client action with toast.

### Bug 8: PreferencesCard validates defaultSymbol with manual string checks
**File:** `preferences-card.tsx` lines 63-68
Manually lists 3 symbols instead of using `isSymbol()`.

**Fix:** `import { isSymbol } from '@hamafx/shared'; defaultSymbol: isSymbol(parsed.defaultSymbol) ? parsed.defaultSymbol : DEFAULTS.defaultSymbol`

### Bug 9: No length limit on symbol input
**File:** `settings/symbols/page.tsx` line 96
No `maxLength` on input, no server-side length check.

**Fix:** Add `maxLength={20}` to input and validate server-side.

### Bug 10: Delete has no loading state — double-submit possible
**File:** `settings/symbols/page.tsx` lines 82-87
Trash button has no `pending` state. User can click multiple times.

**Fix:** Use `useTransition` + `isPending` to disable button during action.

---

## 🟡 Improvements (10)

### Imp 1: Add search/filter on the watchlist
With 20+ symbols, finding one requires scanning the entire list. Add a search input above the list.

### Imp 2: Add drag-to-reorder (displayOrder column already exists)
`displayOrder` is in the schema but there's no UI to change it. Use `@dnd-kit/sortable` or up/down arrows.

### Imp 3: Add bulk actions
Select multiple symbols to delete, clear entire watchlist, add multiple at once (comma-separated paste).

### Imp 4: Add symbol catalog with categories
No browsable catalog of available symbols. Add categories: Forex, Metals, Crypto, Indices. Show "popular symbols" suggestions.

### Imp 5: Add optimistic updates — eliminate full page reload
Server actions with `revalidatePath` cause full RSC re-render. Use `useOptimistic` + `useTransition`.

### Imp 6: Add REST API for symbols
No `/api/settings/symbols` route exists. Add:
- `GET /api/settings/symbols` — list watchlist
- `POST /api/settings/symbols` — add symbol
- `DELETE /api/settings/symbols/[symbol]` — remove
- `PATCH /api/settings/symbols/reorder` — update displayOrder

### Imp 7: Connect settings page to chart picker
Adding a symbol in Settings should affect what appears in the chart SymbolPicker. This is the core disconnect.

### Imp 8: Display symbol metadata
Show friendly name ("Gold"), category, current price, icon — not just raw "XAUUSD".

### Imp 9: Replace onboarding `<select>` with `Segmented`
Wizard uses native `<select>` for symbol selection, inconsistent with the rest of the app.

### Imp 10: Make QuickPrompts dynamic
QuickPrompts has 15 hardcoded prompt arrays for 3 symbols × 5 sessions. Adding a symbol doesn't generate prompts for it.

---

## 🔵 Polish (8)

1. **Toast notifications** on add/delete — "XAUUSD added to watchlist"
2. **Better empty state** — use `EmptyState` component with suggested symbols
3. **Autocomplete/datalist** on the add input — suggest common symbols
4. **Use `SymbolChip`** for visual consistency across the app
5. **Swipe-to-delete** on mobile
6. **Delete confirmation** — use `ConfirmDrawer` or undo toast
7. **Add button pending state** — disable while processing
8. **Keyboard navigation** — arrow keys to navigate list

---

## 🟢 Upgrades (10)

### Upgrade 1: DB-backed symbol catalog (CRITICAL)
Create a `symbol_catalog` table replacing the hardcoded `SYMBOLS` array:
```ts
export const symbolCatalog = pgTable('symbol_catalog', {
  symbol: text('symbol').primaryKey(),    // 'XAUUSD'
  name: text('name').notNull(),            // 'Gold'
  category: text('category').notNull(),    // 'metals' | 'forex' | 'crypto' | 'indices'
  exchange: text('exchange'),              // 'OANDA'
  tvTicker: text('tv_ticker'),             // 'OANDA:XAUUSD'
  pipSize: real('pip_size'),               // 0.1
  priceDecimals: integer('price_decimals'),// 2
  currencyTags: text('currency_tags').array(),
  isActive: boolean('is_active').default(true),
  sortOrder: integer('sort_order').default(0),
});
```

### Upgrade 2: Dynamic SymbolPicker from watchlist
Pass user's watchlist from server component. Fall back to `SYMBOLS` if empty.

### Upgrade 3: Combobox/autocomplete symbol search
Replace plain text input with searchable combobox showing matching symbols from catalog.

### Upgrade 4: Drag-and-drop reordering
Use `@dnd-kit/sortable` with a `reorderSymbols` server action.

### Upgrade 5: Category filter tabs
"All | Forex | Metals | Crypto | Indices" tabs above the catalog.

### Upgrade 6: CSV import/export
Bulk-import a watchlist from CSV. Export current watchlist.

### Upgrade 7: Dynamic QuickPrompts
Generate prompts dynamically based on symbol + session instead of 15 hardcoded arrays.

### Upgrade 8: Popular symbols suggestions panel
Grid of popular symbols with one-click add when watchlist is empty.

### Upgrade 9: Real-time price preview in watchlist
Show current price next to each symbol using existing `usePrice` hook.

### Upgrade 10: Unify 3 symbol sources into one
Merge hardcoded array, DB watchlist, and localStorage default into one source of truth.

---

## Implementation Order

1. **Fix bugs 1-3** (validation, empty strings, BTCUSD) — prevent garbage data
2. **Upgrade 1** (DB-backed catalog) — foundation for everything else
3. **Imp 6** (REST API) — enable client-side interactivity
4. **Imp 5** (optimistic updates) — make UX feel instant
5. **Bug 4 / Imp 7** (connect watchlist to chart) — make the feature actually do something
6. **Upgrade 3** (combobox search) — easy symbol discovery
7. **Imp 2 / Upgrade 4** (drag-to-reorder) — displayOrder UI
8. **Polish 1-8** — toasts, empty states, keyboard nav
9. **Upgrade 7** (dynamic QuickPrompts) — chat integration
10. **Upgrade 10** (unify sources) — final cleanup
