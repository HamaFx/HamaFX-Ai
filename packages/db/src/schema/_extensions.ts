// Required Postgres extensions. Drizzle does not auto-emit these — we run them
// once via a hand-written migration in ./drizzle/0000_extensions.sql (created
// the first time you run `pnpm --filter @hamafx/db migrate:gen`).
//
// Required:
//   - pgvector  (news embeddings)
//   - uuid-ossp (gen_random_uuid is in pgcrypto on Supabase but uuid-ossp is also handy)
export const REQUIRED_EXTENSIONS = ['vector', 'pgcrypto'] as const;
