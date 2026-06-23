# System Upgrade Plans — HamaFX-Ai

Deep-dive analysis and upgrade plans for 5 key systems, based on the user's specific improvement requests.

## Plans

| # | File | System | Focus | Tasks |
|---|------|--------|-------|-------|
| 1 | `plan-1-symbol-selection.md` | Symbol Selection | Add/delete symbols easily, connect watchlist to all surfaces | 38 |
| 2 | `plan-2-data-providers.md` | Data Providers | API key management, provider testing, market data pipeline | 30 |
| 3 | `plan-3-chart-system.md` | Chart System | Remove lite chart, upgrade pro chart, preserve SMC features | 22 |
| 4 | `plan-4-chat-ai-output.md` | Chat AI Output | Markdown rendering, tool visualization, streaming polish | 89 |
| 5 | `plan-5-onboarding.md` | Onboarding System | Clean, reliable, cool wizard with proper validation | 36 |

## Execution Order

Plans 1 and 2 should be done together (symbol catalog + data providers are interconnected).
Plan 3 depends on Plan 1 (chart needs dynamic symbol support).
Plans 4 and 5 are independent and can run in parallel with each other.

## Total Findings

| System | Bugs | Improvements | Polish | Upgrades | Total |
|--------|------|-------------|--------|----------|-------|
| Symbol Selection | 10 | 10 | 8 | 10 | 38 |
| Data Providers | 8 | 9 | 5 | 8 | 30 |
| Chart System | 5 | 7 | 4 | 6 | 22 |
| Chat AI Output | 12 | 31 | 24 | 22 | 89 |
| Onboarding | 10 | 8 | 8 | 10 | 36 |
| **TOTAL** | **45** | **65** | **49** | **56** | **215** |
