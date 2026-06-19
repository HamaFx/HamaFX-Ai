// Quick diagnostic against the live Postgres URL. Local-only; not committed.
import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL, { prepare: false, max: 1 });

console.info('=== installed extensions ===');
const exts = await sql`SELECT extname, extnamespace::regnamespace::text AS schema, extversion FROM pg_extension ORDER BY extname`;
console.info(JSON.stringify(exts, null, 2));

console.info('=== pgvector available? ===');
const avail = await sql`SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name = 'vector'`;
console.info(JSON.stringify(avail, null, 2));

console.info('=== current search_path ===');
const sp = await sql`SHOW search_path`;
console.info(sp[0]);

console.info('=== try to use vector type ===');
try {
  const r = await sql`SELECT '[1,2,3]'::vector(3) AS v`;
  console.info('OK:', r[0]);
} catch (e) {
  console.info('FAIL:', e.message);
}

await sql.end();
