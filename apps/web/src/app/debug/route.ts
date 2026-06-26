import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const env: Record<string, unknown> = {
    DATABASE_URL_type: typeof process.env.DATABASE_URL,
    POSTGRES_URL_type: typeof process.env.POSTGRES_URL,
    DATABASE_URL_set: !!process.env.DATABASE_URL,
    POSTGRES_URL_set: !!process.env.POSTGRES_URL,
  };

  if (process.env.DATABASE_URL) {
    env.DATABASE_URL_length = process.env.DATABASE_URL.length;
    env.DATABASE_URL_prefix = process.env.DATABASE_URL.substring(0, 20);
  }
  if (process.env.POSTGRES_URL) {
    env.POSTGRES_URL_length = process.env.POSTGRES_URL.length;
    env.POSTGRES_URL_prefix = process.env.POSTGRES_URL.substring(0, 20);
  }

  const result: Record<string, unknown> = { env };

  try {
    const { getDb } = await import('@hamafx/db');
    const db = getDb();
    result.getDb_success = true;

    // Try an actual query to see if the connection works
    const { sql } = await import('drizzle-orm');
    const testResult = await db.execute(sql`SELECT 1 AS ok`);
    result.query_success = true;
    result.query_result = String(testResult).substring(0, 500);

    // Try the rate-limit table insert to check if that table exists
    try {
      const { withRateLimit } = await import('@hamafx/db');
      const rateResult = await withRateLimit('debug-test-user', 'debug_test', 100);
      result.rate_limit_success = true;
      result.rate_limit_result = JSON.stringify(rateResult);
    } catch (rateErr) {
      result.rate_limit_error = String(rateErr).substring(0, 1000);
    }
  } catch (e) {
    result.getDb_error = String(e).substring(0, 1000);
    if (e instanceof Error) {
      result.getDb_error_name = e.name;
      result.getDb_error_message = e.message.substring(0, 500);
      result.getDb_error_stack = (e.stack || '').substring(0, 1000);
    }
  }

  return NextResponse.json(result);
}
