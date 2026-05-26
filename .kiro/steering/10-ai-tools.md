---
inclusion: fileMatch
fileMatchPattern: 'packages/ai/**'
---

# Steering: AI tools & agent

When working in `packages/ai/**`:

1. Tools are atomic. One responsibility per tool. Composite reasoning is the model's job.
2. Every tool defines:
   - Input zod schema in `@shared/schemas/...`
   - Output zod schema in `@shared/schemas/...`
   - A `description` that's a single, declarative sentence.
   - A matching React part in `apps/web/src/components/chat/parts/<name>.tsx`.
3. Tools never throw on data-source failure. They return `{ ok: false, error: { code, message } }` so the model can reason and explain.
4. Tools that mutate user data (`set_alert`, `log_journal`) take the `userId` from the **server context**, never from tool args.
5. Add an entry to `packages/ai/src/eval/cases.json` when adding a tool.
6. Never log full prompts in production. Use `LOG_PROMPTS=1` for short debugging windows only.

## Models

- Default chat: `google/gemini-2.5-flash` (or `openai/gpt-4.1` / `anthropic/claude-3.7-sonnet` via gateway).
- Titles / cheap calls: `google/gemini-2.5-flash-lite`.
- Embeddings: `openai/text-embedding-3-small` (1536-dim, matches the `news_embeddings` column).

All routed through Vercel AI Gateway when `AI_GATEWAY_API_KEY` is set; otherwise routed directly to Google via `@ai-sdk/google` when `GOOGLE_GENERATIVE_AI_API_KEY` is set and the model id starts with `google/`. Personal-mode permits the direct path so we can use the free Gemini tier without putting a card on the gateway. Never hit other provider SDKs directly.

## System prompt

Source of truth: `packages/ai/src/prompts/system.md`. Edit there, not in TS strings.
