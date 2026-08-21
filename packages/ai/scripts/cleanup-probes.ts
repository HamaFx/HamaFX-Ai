import { getDb } from '@kestrel/db';
import { sql } from 'drizzle-orm';

async function main(): Promise<void> {
  const db = getDb();
  const c = await db.execute(
    sql`DELETE FROM ai_shadow_comparisons WHERE prompt_sha256 IN ('probe', 'probe-fixed')`,
  );
  const t = await db.execute(sql`DELETE FROM chat_threads WHERE title = 'probe'`);
  console.log('deleted comparisons:', c.rowCount, '| probe threads:', t.rowCount);
}

void main();
