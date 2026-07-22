---
type: index
category: "agent"
count: 4
tags: [index, type/agent]
---

# 🤖 Agents (4)

## DataviewJS — Sorted by Most Connected
```dataviewjs
const pages = dv.pages().where(p => p.type === "agent");
dv.table(
  ['Name', 'Package', 'Path', 'Incoming', 'Outgoing', 'Risk'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.package || '', p.path || '', p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
```

## Full List

- [[RiskAgent]] · `@hamafx/ai` · `packages/ai/src/multi-agent/agents/risk-agent.ts`  *(↖2 ↗6 = 8)*
- [[FundamentalAgent]] · `@hamafx/ai` · `packages/ai/src/multi-agent/agents/fundamental-agent.ts`  *(↖2 ↗5 = 7)*
- [[SentimentAgent]] · `@hamafx/ai` · `packages/ai/src/multi-agent/agents/sentiment-agent.ts`  *(↖2 ↗5 = 7)*
- [[TechnicalAgent]] · `@hamafx/ai` · `packages/ai/src/multi-agent/agents/technical-agent.ts`  *(↖2 ↗5 = 7)*
