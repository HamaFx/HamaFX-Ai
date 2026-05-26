import postgres from 'postgres';
const sql = postgres(process.env.POSTGRES_URL, { prepare: false, max: 1 });
const tables = await sql`
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename
`;
console.log(`public tables (${tables.length}):`);
for (const r of tables) console.log('  •', r.tablename);

const indexes = await sql`
  SELECT indexname, tablename
  FROM pg_indexes
  WHERE schemaname = 'public' AND indexname NOT LIKE '%_pkey'
  ORDER BY tablename, indexname
`;
console.log(`\npublic indexes (${indexes.length}):`);
for (const r of indexes) console.log(`  • ${r.tablename}.${r.indexname}`);

await sql.end();
