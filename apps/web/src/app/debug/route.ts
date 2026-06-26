import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result: Record<string, unknown> = {
    env: {
      DATABASE_URL: typeof process.env.DATABASE_URL,
      POSTGRES_URL: typeof process.env.POSTGRES_URL,
    },
  };

  if (process.env.DATABASE_URL) {
    result.env.DATABASE_URL_length = process.env.DATABASE_URL.length;
    result.env.DATABASE_URL_prefix = process.env.DATABASE_URL.substring(0, 20);
  }
  if (process.env.POSTGRES_URL) {
    result.env.POSTGRES_URL_length = process.env.POSTGRES_URL.length;
    result.env.POSTGRES_URL_prefix = process.env.POSTGRES_URL.substring(0, 20);
  }

  try {
    const { getDb } = await import('@hamafx/db');
    const db = getDb();
    result.getDb_success = true;
  } catch (e) {
    result.getDb_error = String(e).substring(0, 500);
  }

  return NextResponse.json(result);
}
