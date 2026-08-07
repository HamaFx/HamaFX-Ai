// One-shot: install the extensions required by the migration chain.
//
// Migrations use unqualified `vector(...)` and `gen_random_uuid()` types/
// functions. Keep both extensions in `public` so fresh databases and
// drizzle-kit connections resolve them with PostgreSQL's default search path.
// Existing installations that used the old `extensions` schema are moved to
// `public` when the database role has permission to alter the extension.
import postgres from 'postgres';

const databaseUrl = process.env.DIRECT_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!databaseUrl) {
  throw new Error('Set DIRECT_URL, POSTGRES_URL_NON_POOLING, DATABASE_URL, or POSTGRES_URL before installing database extensions.');
}

const sql = postgres(databaseUrl, { prepare: false, max: 1 });

try {
  await sql`CREATE SCHEMA IF NOT EXISTS public`;

  // Repair databases created by the former extensions-schema installer before
  // creating anything new. PostgreSQL's IF NOT EXISTS does not move an
  // existing extension between schemas.
  const existingExtensions = await sql`
    SELECT e.extname, n.nspname AS schema_name
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname IN ('vector', 'pgcrypto')
  `;
  for (const extension of existingExtensions) {
    if (
      (extension.extname === 'vector' || extension.extname === 'pgcrypto') &&
      extension.schema_name !== 'public'
    ) {
      await sql.unsafe(`ALTER EXTENSION ${extension.extname} SET SCHEMA public`);
    }
  }

  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;

  // Repair databases created by the former extensions-schema installer.
  const extensionSchemas = await sql`
    SELECT e.extname, n.nspname AS schema_name
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname IN ('vector', 'pgcrypto')
  `;
  for (const extension of extensionSchemas) {
    if (
      (extension.extname === 'vector' || extension.extname === 'pgcrypto') &&
      extension.schema_name !== 'public'
    ) {
      const name = extension.extname;
      await sql.unsafe(`ALTER EXTENSION ${name} SET SCHEMA public`);
    }
  }

  const extensions = await sql`
    SELECT extname, extversion
    FROM pg_extension
    WHERE extname IN ('vector', 'pgcrypto')
    ORDER BY extname
  `;
  console.info(JSON.stringify(extensions, null, 2));

  const test = await sql`SELECT '[1,2,3]'::vector(3) AS v, gen_random_uuid() AS id`;
  console.info('required extensions work:', test[0]);
} finally {
  await sql.end();
}
