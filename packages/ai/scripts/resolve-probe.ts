import { resolveXauusdMastraModel } from '../src/mastra/run';

console.log('MASTRA_XAUUSD_MODEL env:', JSON.stringify(process.env.MASTRA_XAUUSD_MODEL));
console.log('GOOGLE key set:', (process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '').length > 0);

try {
  const r = resolveXauusdMastraModel({ aiApiKeys: null, chatModel: null }, process.env);
  console.log('resolved:', r.modelId, '|', r.providerId);
} catch (err) {
  console.log('resolve error:', err instanceof Error ? err.message : String(err));
}
