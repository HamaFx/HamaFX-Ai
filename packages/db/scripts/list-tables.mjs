import postgres from 'postgres';
const sql = postgres(process.env.POSTGRES_URL, { prepare: false, max: 1 });
const tables = await sql`
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename
`;
console.info(`public tables (${tables.length}):`);
for (const r of tables) console.info('  •', r.tablename);

const indexes = await sql`
  SELECT indexname, tablename
  FROM pg_indexes
  WHERE schemaname = 'public' AND indexname NOT LIKE '%_pkey'
  ORDER BY tablename, indexname
`;
console.info(`\npublic indexes (${indexes.length}):`);
for (const r of indexes) console.info(`  • ${r.tablename}.${r.indexname}`);

await sql.end();
