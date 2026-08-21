import { getDb } from '@kestrel/db';
import { sql } from 'drizzle-orm';

async function main(): Promise<void> {
  const db = getDb();
  const col = await db.execute(sql`
    SELECT data_type FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'max_daily_usd'
  `);
  console.log('max_daily_usd column type:', JSON.stringify(col[0]?.data_type));

  const rows = await db.execute(sql`
    SELECT user_id, max_daily_usd FROM user_settings
    WHERE user_id = '79b27cb4-3757-4edb-8cb4-a2c120cc5a8c'
  `);
  console.log('user settings:', JSON.stringify(rows[0] ?? null));
}

void main();
