// One-shot: install pgvector into the extensions schema.
// Must run BEFORE drizzle-kit migrate, because CREATE EXTENSION inside the
// migration transaction doesn't make the new type visible to subsequent
// statements in the same transaction.
import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL, { prepare: false, max: 1 });

await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions`;
console.info('pgcrypto: ok');

await sql`CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions`;
console.info('vector:   ok');

const r = await sql`SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector','pgcrypto') ORDER BY extname`;
console.info(JSON.stringify(r, null, 2));

const test = await sql`SELECT '[1,2,3]'::vector(3) AS v`;
console.info('vector type works:', test[0]);

await sql.end();
