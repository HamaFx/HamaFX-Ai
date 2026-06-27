---
'@hamafx/ai': minor
'@hamafx/db': minor
'@hamafx/web': minor
---

F7: Bot Platform with Commands — Quarter 3 implementation

Adds an interactive Telegram bot command system to HamaFX-Ai, expanding
the existing passive Telegram webhook into a structured command-based
interface.

**New features:**
- Bot command dispatcher with 9 commands: /price, /analyze, /ask, /chart,
  /alert, /positions, /track, /status, /help
- User linking flow: generate a link code from Settings → send /link <code>
  to the Telegram bot → accounts are connected
- bot_links database table mapping Telegram chat IDs to HamaFX users
- Rate limiting on AI-cost commands (/analyze, /ask)
- Settings UI at /settings/telegram for linking/unlinking and viewing
  available commands
- API routes: /api/bot/link-code, /api/bot/unlink, /api/bot/status
- Comprehensive test suite for dispatcher and linking logic

**Files added:**
- packages/db/src/schema/bot-links.ts — bot_links table schema
- packages/ai/src/bot/ — full bot subsystem (dispatcher, commands, linking)
- apps/web/src/app/api/bot/ — API routes for bot linking
- apps/web/src/app/(app)/settings/telegram/ — settings page
- apps/web/src/app/(app)/settings/_components/telegram-link-card.tsx

**Files modified:**
- packages/ai/src/telegram/webhook.ts — integrated bot dispatcher for /commands
- packages/ai/src/index.ts — added bot exports
- packages/db/src/schema/index.ts — added bot-links export
- apps/web/src/app/(app)/settings/_components/settings-nav.tsx — added Telegram nav item
- packages/ai/package.json — added ./bot export path
