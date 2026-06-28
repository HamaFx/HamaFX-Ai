/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Required Postgres extensions. Drizzle does not auto-emit these — we run them
// once via a hand-written migration in ./drizzle/0000_extensions.sql (created
// the first time you run `pnpm --filter @hamafx/db migrate:gen`).
//
// Required:
//   - pgvector  (news embeddings)
//   - pgcrypto  (gen_random_uuid on Supabase)
//
// Phase 7 §35 — The REQUIRED_EXTENSIONS constant was never imported anywhere.
// Converted to a documentation-only comment. The actual extension installation
// is handled by scripts/install-extensions.mjs and the 0000 migration.