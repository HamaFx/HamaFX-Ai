# HamaFX-Ai — Planning Index

This `docs/` folder is the **single source of truth** for the design and implementation plan of HamaFX-Ai.
Every document is written to be readable by humans **and** AI coding agents (Kiro, Cursor, Claude Code, etc.).

## How to read

If you have **30 seconds**: read [`00-overview.md`](./00-overview.md).
If you have **5 minutes**: read `00`, `01`, `02`, `04`.
If you are an **AI agent about to write code**: read in order, then jump to [`14-ai-agent-handoff.md`](./14-ai-agent-handoff.md).

## File index

| #   | File                                               | Purpose                                            |
| --- | -------------------------------------------------- | -------------------------------------------------- |
| 00  | [overview](./00-overview.md)                       | Vision, target users, success criteria             |
| 01  | [architecture](./01-architecture.md)               | High-level system architecture with diagrams       |
| 02  | [tech-stack](./02-tech-stack.md)                   | Chosen stack with alternatives and rationale       |
| 03  | [project-structure](./03-project-structure.md)     | Monorepo folder layout and naming conventions      |
| 04  | [features](./04-features.md)                       | Feature catalog by phase                           |
| 05  | [ui-ux](./05-ui-ux.md)                             | Mobile-first layout, theming, design tokens        |
| 06  | [data-sources](./06-data-sources.md)               | API providers, endpoints, caching, fallbacks       |
| 07  | [ai-agent](./07-ai-agent.md)                       | Agent loop, tools, prompts, memory, RAG            |
| 08  | [backend-and-api](./08-backend-and-api.md)         | Route map, edge vs node, VM-driven cron            |
| 09  | [deployment](./09-deployment.md)                   | Vercel + envs + minimal CI                         |
| 10  | [roadmap](./10-roadmap.md)                         | Milestones (Phase 0 → Phase 3)                     |
| 11  | [conventions](./11-conventions.md)                 | Code style, commits, AI-agent-friendly conventions |
| 12  | [security-and-config](./12-security-and-config.md) | Secrets, auth, rate limits, observability          |
| 13  | [data-flow](./13-data-flow.md)                     | Sequence diagrams for key flows                    |
| 14  | [ai-agent-handoff](./14-ai-agent-handoff.md)       | Instructions for AI agents extending this repo     |

## Diagram conventions

All diagrams use **Mermaid** so GitHub renders them natively.
Larger or non-Mermaid diagrams live under [`./diagrams/`](./diagrams/).
