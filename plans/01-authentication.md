# Implementation Plan: Authentication & Authorization Overhaul

## 1. Current State
HamaFX-Ai currently operates under a single-user assumption:
- **Authentication**: Secured via a single `APP_PASSWORD` environment variable.
- **Session Management**: A custom HMAC-signed cookie (`hfx_auth`) containing only `{iat, exp}` claims.
- **User Management**: No user accounts, no `sessions` table, no registration flow.
- **Middleware**: `apps/web/src/middleware.ts` validates the cookie signature but has no concept of identity.
- **Rate Limiting**: In-memory rate limiting per IP (resets on application restart).
- **Core Files**: 
  - `apps/web/src/lib/auth.ts` (~170 lines, Edge-compatible using Web Crypto).
  - `apps/web/src/app/api/auth/login/route.ts` handles password validation and cookie issuance.

## 2. Target State: NextAuth.js v5 (Auth.js)

The goal is to transition to a multi-user, self-hosted system utilizing NextAuth.js (Auth.js v5), Drizzle ORM for session/user storage, and a Bring-Your-Own-Key (BYOK) architecture for AI services.

### 2.1 Installation & Setup
- **Dependencies**: Install `next-auth@beta` (v5) and `@auth/drizzle-adapter` in `apps/web`.
- **Configuration**: Create `auth.config.ts` (for Edge compatibility in middleware) and `auth.ts` (for Node.js runtimes) in `apps/web/src/`.
- **Adapter**: Configure the Drizzle adapter to use the existing Postgres connection from `@hamafx/db`.
- **Strategy**: Use JWT session strategy to maintain Edge compatibility for the Next.js middleware.

```typescript
// apps/web/src/auth.config.ts
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/login",
    newUser: "/auth/register",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnAuth = nextUrl.pathname.startsWith('/auth');
      // ... logic to redirect based on auth state
      return true;
    },
  },
  providers: [], // configured in auth.ts
} satisfies NextAuthConfig;
```

### 2.2 Auth Providers
Enable multiple authentication pathways configurable via environment variables:
- **Credentials**: Email + password login, using `bcrypt` (or `bcryptjs` for Edge) for password hashing. Ideal for pure self-hosted environments.
- **Google OAuth**: Optional. Enabled if `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are provided.
- **GitHub OAuth**: Optional. Enabled if `GITHUB_ID` and `GITHUB_SECRET` are provided.
- **Magic Link / Email**: Optional. Utilizes existing Resend integration. Enabled if `RESEND_API_KEY` is present.

### 2.3 Database Tables (new)
Introduce NextAuth standard tables using Drizzle schema definitions in `packages/db/src/schema/auth.ts`:

```typescript
// packages/db/src/schema/auth.ts
import { pgTable, text, timestamp, boolean, primaryKey } from "drizzle-orm/pg-core";

export const users = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  hashedPassword: text("hashedPassword"),
  role: text("role").default("user"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

export const accounts = pgTable("account", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("providerAccountId").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: timestamp("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
}, (account) => ({
  compoundKey: primaryKey({ columns: [account.provider, account.providerAccountId] }),
}));

// Additional tables: sessions, verification_tokens
```

### 2.4 User Settings Table
Isolate application-specific settings from the core NextAuth `users` table:

```typescript
// packages/db/src/schema/settings.ts
import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const userSettings = pgTable("user_settings", {
  userId: text("userId").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  defaultSymbol: text("defaultSymbol").default("EURUSD"),
  timezone: text("timezone").default("UTC"),
  language: text("language").default("en"),
  reduceMotion: boolean("reduceMotion").default(false),
  telegramBotToken: text("telegramBotToken"),
  telegramChatId: text("telegramChatId"),
  alertEmail: text("alertEmail"),
  aiApiKeys: text("aiApiKeys"), // Encrypted JSON payload containing BYOK keys
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});
```

### 2.5 BYOK (Bring Your Own Key) Management
To shift AI costs to the user and avoid global API rate limits:
- **Configuration**: Users provide their own keys for Gemini, OpenAI, or Anthropic via the UI settings page.
- **Encryption**: Keys are encrypted before resting in the database using `AES-256-GCM`.
  - Requires a new environment variable: `ENCRYPTION_SECRET` (32 bytes hex).
- **Validation**: On save, test the key against a lightweight endpoint (e.g., list models) to ensure validity.
- **Graceful Degradation**: If no keys are configured, UI elements requiring AI features are disabled or prompt the user to configure keys.

### 2.6 JWT Token Structure
By using a JWT session strategy, the Next.js middleware can authenticate requests without a database roundtrip.

```typescript
// Inside auth.ts callbacks
callbacks: {
  async jwt({ token, user }) {
    if (user) {
      token.id = user.id;
      token.email = user.email;
      token.name = user.name;
    }
    return token;
  },
  async session({ session, token }) {
    if (token && session.user) {
      session.user.id = token.id as string;
    }
    return session;
  }
}
```

### 2.7 Middleware Refactor
Refactor `apps/web/src/middleware.ts` to utilize NextAuth:
- Replace the custom `hfx_auth` validation with `auth()` from NextAuth.
- Extract `userId` from the JWT session.
- Inject `userId` into downstream requests via the `x-user-id` header.
- Retain existing CSRF double-submit patterns and `X-Request-Id` stamping.
- Bypass authentication for the `/api/cron` route, relying on the `CRON_SECRET` bearer token.

### 2.8 Registration Flow
Create a new registration pipeline:
- **Routes**: `/auth/register` UI page gathering Name, Email, and Password.
- **Validation**: Passwords must be a minimum of 8 characters (enforced via Zod schema in `packages/shared`).
- **Verification**: Dispatch verification emails via Resend.
- **Admin Approval**: Optional environment flag `REQUIRE_ADMIN_APPROVAL=true`. If enabled, users are created with `approved: false` and require manual activation.

### 2.9 Migration from Single-User
Ensure a smooth transition for existing deployments:
- **Admin Auto-Creation**: On application startup (e.g., in a bootstrap script or migrations check), if the `users` table is empty and `APP_PASSWORD` is set, automatically create an admin user using the `ADMIN_EMAIL` (new env var) and the hashed `APP_PASSWORD`.
- **Legacy Cookie Detection**: If a request presents a valid `hfx_auth` cookie but no NextAuth session, redirect the user to a migration/login prompt to re-authenticate under the new system.
- **Legacy Mode**: An environment flag `AUTH_MODE=legacy|nextauth` (default: nextauth) could be used to toggle mechanisms if necessary.

### 2.10 Rate Limiting Upgrade
Move away from the simplistic in-memory IP map:
- **Storage**: Implement rate limits using a Postgres-based rate limiter (e.g., using `pglite` or dedicated Drizzle table) or Redis if available.
- **Scope**: Rate limit primarily by `userId` (extracted from the JWT) rather than IP address, preventing one user from impacting others on the same network.
- **Buckets**: Configure limits per endpoint type:
  - Login attempts (prevent brute force)
  - API calls/min (general usage)
  - Chat turns/day (AI spend control)

### 2.11 Files to Create/Modify

| File Path | Action | Description |
|-----------|--------|-------------|
| `packages/db/src/schema/auth.ts` | Create | Drizzle schema for NextAuth tables (`users`, `accounts`, etc.) |
| `packages/db/src/schema/settings.ts` | Create | Drizzle schema for `user_settings` |
| `packages/db/src/index.ts` | Modify | Export new schemas |
| `packages/shared/src/schemas/auth.ts` | Create | Zod schemas for login, registration, BYOK payloads |
| `apps/web/src/auth.config.ts` | Create | NextAuth Edge configuration |
| `apps/web/src/auth.ts` | Create | NextAuth Node.js configuration + providers |
| `apps/web/src/middleware.ts` | Modify | Replace custom auth logic with NextAuth, set `x-user-id` |
| `apps/web/src/lib/auth.ts` | Delete | Remove legacy single-user auth utility |
| `apps/web/src/lib/encryption.ts` | Create | AES-256-GCM utilities for BYOK encryption |
| `apps/web/src/app/api/auth/[...nextauth]/route.ts` | Create | NextAuth API catch-all route |
| `apps/web/src/app/auth/login/page.tsx` | Create/Modify | NextAuth-compatible login UI |
| `apps/web/src/app/auth/register/page.tsx` | Create | User registration UI |
| `apps/web/src/app/settings/page.tsx` | Modify | Add BYOK inputs and test connection UI |
| `apps/web/src/app/api/settings/keys/route.ts` | Create | Endpoint to save/test BYOK keys |
| `apps/web/src/lib/rate-limit.ts` | Modify | Upgrade from in-memory Map to Postgres-backed user-centric limits |
| `packages/ai/src/index.ts` | Modify | Update AI orchestration to use decrypted keys from context instead of env vars |

### 2.12 Effort Estimate

| Task | Estimated Effort |
|------|------------------|
| Database Schema & Migrations (`auth`, `settings`) | 0.5 Days |
| NextAuth Installation & Configuration (Providers, Adapter) | 1.0 Day |
| BYOK Encryption Utility & Settings UI | 1.5 Days |
| Middleware Refactor & Route Protection | 0.5 Days |
| Registration Flow & Email Verification | 1.0 Day |
| Rate Limiting Upgrade (Postgres/Redis) | 1.0 Day |
| Single-user Migration Script / Bootstrapper | 0.5 Days |
| **Total Estimated Effort** | **6.0 Days** |

### 2.13 Dependencies
- **None block this plan entirely**, but subsequent plans depend on this:
  - **Plan 02 (Database Scoping)**: Relies heavily on the `userId` injected by the new middleware and the `user_settings` table.
  - **Plan 03 (AI Context)**: Relies on the BYOK configuration saved in the database to instantiate LLM clients per-request.
