// Quick diagnostic against the live Postgres URL. Local-only; not committed.
import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL, { prepare: false, max: 1 });

console.log('=== installed extensions ===');
const exts = await sql`SELECT extname, extnamespace::regnamespace::text AS schema, extversion FROM pg_extension ORDER BY extname`;
console.table(exts);

console.log('=== pgvector available? ===');
const avail = await sql`SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name = 'vector'`;
console.table(avail);

console.log('=== current search_path ===');
const sp = await sql`SHOW search_path`;
console.log(sp[0]);

console.log('=== try to use vector type ===');
try {
  const r = await sql`SELECT '[1,2,3]'::vector(3) AS v`;
  console.log('OK:', r[0]);
} catch (e) {
  console.log('FAIL:', e.message);
}

await sql.end();
