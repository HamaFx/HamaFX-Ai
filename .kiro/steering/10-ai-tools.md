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

- Default chat: `openai/gpt-4.1` (or `anthropic/claude-3.7-sonnet`).
- Titles / cheap calls: `openai/gpt-4.1-mini`.
- Embeddings: `openai/text-embedding-3-small`.

All routed through Vercel AI Gateway; never hit provider SDKs directly.

## System prompt

Source of truth: `packages/ai/src/prompts/system.md`. Edit there, not in TS strings.
