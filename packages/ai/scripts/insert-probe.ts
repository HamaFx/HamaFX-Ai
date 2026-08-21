import { getDb, schema, createThread, recordAiShadowComparison } from '@kestrel/db';

async function main(): Promise<void> {
  const db = getDb();
  const rows = await db.select().from(schema.users);
  const user = rows.find((u) => u.id !== '__system__' && !(u.email ?? '').endsWith('@localhost')) ?? rows[0]!;

  const thread = await createThread({ userId: user.id, title: 'probe', analysisMode: 'single' });
  try {
    await recordAiShadowComparison({
      userId: user.id,
      threadId: thread.id,
      promptSha256: 'probe-fixed',
      primaryAgent: 'mastra',
      outcome: 'completed',
      legacyChars: 10,
      mastraChars: 12,
      sharedTokenRatio: 0.5,
      overlap: 'medium',
      mastraVerified: true,
      mastraBias: 'bullish',
      mastraDataQuality: 'partial',
    });
    console.log('comparison insert OK ✅');
  } catch (err) {
    console.log('comparison insert FAILED:', (err as { cause?: Error }).cause?.message ?? (err instanceof Error ? err.message : err));
  }
}

void main();
