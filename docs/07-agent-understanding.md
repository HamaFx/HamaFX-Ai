# Agent Understanding Guide

Read [AGENTS.md](../AGENTS.md) for the canonical repository rules, architecture, package dependency chain, migration constraints, security boundaries, and testing commands.

When modifying code:

1. Identify the owning package and existing conventions.
2. Keep user-owned queries scoped to the authenticated user and tenant context.
3. Resolve database and model dependencies according to the package boundary rules.
4. Add or update tests for security-sensitive behavior.
5. Run targeted tests, typecheck, lint, and the relevant production build.
