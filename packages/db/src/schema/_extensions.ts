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
//   - uuid-ossp (gen_random_uuid is in pgcrypto on Supabase but uuid-ossp is also handy)
export const REQUIRED_EXTENSIONS = ['vector', 'pgcrypto'] as const;
