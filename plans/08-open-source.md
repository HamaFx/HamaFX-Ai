# Implementation Plan: Open-Source Readiness (HamaFX-Ai)

This document outlines the comprehensive plan for transforming HamaFX-Ai from a single-user personal trading copilot into a multi-user open-source project. The goal is to ensure the repository is welcoming to contributors, legally compliant, secure, and clearly positioned as a self-hosted platform.

## 1. Current State
- **License**: UNLICENSED (badge in README).
- **Missing Files**: No `LICENSE` file, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, or `SECURITY.md`.
- **GitHub Templates**: No issue templates, PR templates, or `CODEOWNERS`.
- **Workflows**: `.github/` only has `workflows/ci.yml`.
- **Positioning**: `README.md` explicitly says "Personal AI trading copilot".
- **Environment**: `.env.example` leaks a GCP project ID (`hamafx-78845`) and potentially personal Supabase URLs.
- **Packages**: `package.json` specifies `"private": true` and `"license": "UNLICENSED"`.
- **Documentation**: Extensive internal docs (12 files in `docs/`), but written with single-user assumptions.

## 2. License
Adopt the **Apache 2.0 License** to allow permissive use while maintaining patent protection and liability limitations.

- **Tasks**:
  - Add standard Apache 2.0 `LICENSE` file to the root directory.
  - Create an automated script to prepend Apache 2.0 license headers to all source files (`.ts`, `.tsx`, `.js`).
  - Update `package.json` (root and all workspaces) to `"license": "Apache-2.0"`.
  - Update the license badge in `README.md`.
  - Remove `"private": true` from the root `package.json` and workspaces where applicable.

## 3. CONTRIBUTING.md
Create a clear, structured guide for new contributors to lower the barrier to entry.

- **Content**:
  - **Dev Environment**: Prerequisites (Node.js, pnpm, Turborepo, Postgres) and step-by-step setup commands.
  - **Code Style**: Explain the usage of ESLint, Prettier, and existing configs (`pnpm run lint`).
  - **Branching**: Define conventions (e.g., `feat/`, `fix/`, `docs/`).
  - **Commits**: Require Conventional Commits format (`feat(ui): add button`).
  - **PR Process**: Outline expectations for reviews, CI passage, and updates.
  - **Testing**: Requirements for writing and running tests.
  - **Documentation**: Guidelines on updating relevant markdown files when changing code.
  - **Architecture Overview**: High-level map of `apps/` and `packages/` for context.
  - **Finding Work**: Guidance on using the `good first issue` label.

## 4. CODE_OF_CONDUCT.md
Establish a healthy and inclusive community environment.

- **Content**:
  - Adopt the **Contributor Covenant v2.1**, the industry standard for open-source projects.
  - Detail standard community guidelines (respectful language, harassment-free environment).
  - Specify the enforcement team and contact email for reporting violations.

## 5. SECURITY.md
Provide clear instructions on how to report vulnerabilities privately.

- **Content**:
  - **Responsible Disclosure Process**: Instructions to email security contacts rather than opening public issues.
  - **Security Contact Email**: Dedicated email address (e.g., `security@hamafx.com`).
  - **Supported Versions**: Clarify which versions (e.g., latest major release) receive security updates.
  - **Known Security Considerations**: Document inherent risks (e.g., BYOK API key storage, self-hosted deployment risks).
  - **Bug Bounty**: Specify if one exists (or explicitly state that there is no monetary reward yet).

## 6. GitHub Templates
Standardize the way contributors report issues and submit code.

### Issue Templates (`.github/ISSUE_TEMPLATE/`)
- **Bug Report**: Requires reproduction steps, expected/actual behavior, environment details (OS, Node version).
- **Feature Request**: Requires use case, proposed solution, and alternatives considered.
- **Documentation Improvement**: Lightweight template for docs suggestions.

### PR Template (`.github/PULL_REQUEST_TEMPLATE.md`)
- Checklist: CI passing, tests added, docs updated.
- Type of change (bug fix, new feature, breaking change).
- Description field and testing instructions.
- Section for screenshots/screen recordings (mandatory for UI changes).

### CODEOWNERS (`.github/CODEOWNERS`)
- Define default reviewers for the entire repo (e.g., `* @core-team`).
- Define per-package owners if applicable (e.g., `packages/ai/ @ai-team`).

## 7. README Overhaul
Reposition the project from a personal tool to an organizational platform.

- **Tasks**:
  - Remove all instances of "personal" language.
  - Add explicit "multi-user" and "self-hosted" positioning.
  - Add sections for Contributing and Licensing.
  - Add community links (Discord server, GitHub Discussions).
  - Improve the Quick Start guide specifically for self-hosting admins.
  - Add a high-level architecture diagram (Mermaid or image).
  - Add high-quality screenshots and a demo GIF of the multi-user dashboard.

## 8. Documentation Updates
Sanitize and expand the internal `docs/` folder.

- **Tasks**:
  - **Sanitize 12 existing files**: Review `docs/*.md` to remove single-user assumptions (e.g., "the user" -> "users", "my MT5 account" -> "connected MT5 accounts").
  - **Update `AGENTS.md`**: Detail multi-user patterns, showing how context is injected per user.
  - **Create `docs/10-self-hosting.md`**: Dedicated guide for deploying the stack (Docker Compose, Vercel + Supabase, etc.).
  - **Create `docs/11-contributing-guide.md`**: A deep-dive extension of `CONTRIBUTING.md` covering system internals, Turborepo graphs, and complex workflows.

## 9. Environment Sanitization
Ensure no internal or personal secrets leak into the open-source tree.

- **Tasks**:
  - Remove hardcoded GCP project ID (`hamafx-78845`) from `.env.example`.
  - Replace personal Supabase URLs/keys with placeholder strings (`your-project-url-here`).
  - Generalize all example values (e.g., database connection strings).
  - Categorize `.env.example` into sections: `Required (Core)`, `Required (Auth)`, `Optional (AI/BYOK)`, `Optional (MT5)`.
  - Add clear comments explaining the Bring-Your-Own-Key (BYOK) setup for OpenAI/Anthropic.

## 10. CI/CD for Open Source
Automate maintenance and security checks.

- **Tasks**:
  - **Dependabot**: Add `.github/dependabot.yml` for automated dependency updates (npm and GitHub Actions).
  - **CodeQL**: Add `.github/workflows/codeql.yml` for automated security scanning.
  - **Automated Releases**: Implement `changesets` for versioning and changelog generation.
  - **Docker Publishing**: Create a workflow to build and push images to GitHub Container Registry (GHCR) on release.
  - **PR Labeler**: Add a workflow to automatically label PRs based on modified paths (e.g., `apps/web` -> `area/web`).
  - **Stale Bot**: Add a workflow to close inactive issues after a defined period (e.g., 60 days).

## 11. Community Setup
Prepare the surrounding infrastructure for community engagement.

- **Tasks**:
  - **GitHub Discussions**: Enable the feature in repository settings. Set up categories (Q&A, Ideas, Show and Tell).
  - **Issue Labels Taxonomy**: Standardize labels (`bug`, `enhancement`, `good first issue`, `help wanted`, `priority/high`, `area/ai`).
  - **Project Board**: Create a public GitHub Project board outlining the roadmap and current sprint.
  - **Discord Server**: Create a community Discord (optional but recommended) and link it in the README.

## 12. Branding
Ensure a consistent and professional identity.

- **Tasks**:
  - **Name Decision**: Finalize if keeping "HamaFX-Ai" or adopting a new open-source name.
  - **Assets**: Design/source a clear logo and icon for the `README.md`, docs, and PWA manifest.
  - **Tagline**: Establish a consistent tagline (e.g., "The Open-Source, Multi-User AI Trading Copilot").

## 13. Files to Create/Modify

| File Path | Action | Description |
|-----------|--------|-------------|
| `LICENSE` | Create | Apache 2.0 license text. |
| `CONTRIBUTING.md` | Create | Guide for contributors. |
| `CODE_OF_CONDUCT.md` | Create | Contributor Covenant v2.1. |
| `SECURITY.md` | Create | Security policy and disclosure process. |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | Create | Structured bug report form. |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | Create | Structured feature request form. |
| `.github/PULL_REQUEST_TEMPLATE.md` | Create | Checklist and formatting for PRs. |
| `.github/CODEOWNERS` | Create | Repo ownership mapping. |
| `.github/dependabot.yml` | Create | Dependency update config. |
| `.github/workflows/codeql.yml` | Create | Security scanning workflow. |
| `.github/workflows/release.yml` | Create | Automated versioning/release workflow. |
| `README.md` | Modify | Total overhaul for open-source multi-user context. |
| `.env.example` | Modify | Sanitize and structure variables. |
| `package.json` | Modify | Update license, remove private flag. |
| `docs/*.md` | Modify | Update 12 existing docs to remove single-user bias. |
| `docs/10-self-hosting.md` | Create | Deployment guide. |
| `docs/11-contributing-guide.md` | Create | Deep dive architecture for contributors. |

## 14. Effort Estimate & Dependencies

| Task Group | Estimated Effort | Dependencies |
|------------|------------------|--------------|
| 1. License & Basic Docs (`LICENSE`, `CODE_OF_CONDUCT`) | Low (2 hours) | None |
| 2. GitHub Templates & Community Config | Low (3 hours) | None |
| 3. Environment Sanitization | Low (1 hour) | Multi-User DB Plan (for updated env vars) |
| 4. README & Branding Update | Medium (4 hours) | Multi-User Auth Plan (to explain features) |
| 5. Internal Docs Rewrite (`docs/*.md`) | High (8-10 hours) | All Multi-User Plans (to accurately reflect new architecture) |
| 6. CI/CD Pipeline Setup | Medium (5 hours) | None |

**Total Estimated Effort**: ~21-25 hours.

**Execution Order**:
This plan can largely be executed in parallel with code changes. However, **Environment Sanitization** should happen immediately to prevent further secret leakage, and **Internal Docs Rewrite** should happen *after* the multi-user architecture is finalized so the documentation accurately reflects the new NextAuth/BYOK setup.
