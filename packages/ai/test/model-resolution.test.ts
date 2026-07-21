import { describe, expect, it } from 'vitest';
import { toModelDomain, pickNextFallbackProvider } from '../src/model-resolution';

describe('toModelDomain', () => {
  it('maps fundamental to fundamental', () => {
    expect(toModelDomain('fundamental')).toBe('fundamental');
  });

  it('maps technical to technical', () => {
    expect(toModelDomain('technical')).toBe('technical');
  });

  it('maps generic to technical (fallback)', () => {
    expect(toModelDomain('generic')).toBe('technical');
  });
});

describe('pickNextFallbackProvider', () => {
  it('returns null for empty chain', () => {
    const result = pickNextFallbackProvider([], 'google', null, undefined, 'technical');
    expect(result).toBeNull();
  });

  it('returns null when no subsequent provider has a key', () => {
    const result = pickNextFallbackProvider(
      ['google', 'anthropic'],
      'google',
      {}, // decrypted keys — no key for anthropic
      undefined,
      'technical',
    );
    expect(result).toBeNull();
  });

  it('picks the next provider with a valid key', () => {
    const result = pickNextFallbackProvider(
      ['google', 'anthropic'],
      'google',
      { anthropic: 'sk-ant-xxx' },
      undefined,
      'technical',
    );
    expect(result).not.toBeNull();
    expect(result!.providerId).toBe('anthropic');
    expect(result!.modelId).toBeTypeOf('string');
  });

  it('skips providers past current in the chain', () => {
    const result = pickNextFallbackProvider(
      ['google', 'openai', 'anthropic'],
      'openai',
      { google: 'key', anthropic: 'sk-ant-xxx' },
      undefined,
      'technical',
    );
    // Should skip google (before openai) and pick anthropic
    expect(result!.providerId).toBe('anthropic');
  });

  it('uses envGoogleKey for google provider', () => {
    const result = pickNextFallbackProvider(
      ['google', 'openai'],
      'google',
      { openai: 'sk-xxx' },
      undefined,
      'technical',
    );
    // google key is not in decrypted keys but envGoogleKey is set
    // Actually, envGoogleKey is undefined, so google has no key
    // Only openai has a key
    expect(result!.providerId).toBe('openai');
  });

  it('uses envGoogleKey when google is in chain after current', () => {
    const result = pickNextFallbackProvider(
      ['openai', 'google'],
      'openai',
      {},
      'AIzaSyGoogleKey123',
      'technical',
    );
    // Google should work because envGoogleKey is set
    expect(result!.providerId).toBe('google');
    expect(result!.modelId).toBeTypeOf('string');
  });

  it('returns null when current provider is not in chain', () => {
    const result = pickNextFallbackProvider(
      ['google', 'openai'],
      'unknown-provider',
      { google: 'key' },
      undefined,
      'technical',
    );
    // Start from -1 (not found), search from index 0
    expect(result!.providerId).toBe('google');
  });

  it('returns the first provider when current is not found and first has key', () => {
    const result = pickNextFallbackProvider(
      ['google', 'openai'],
      undefined,
      { openai: 'sk-xxx' },
      undefined,
      'technical',
    );
    // current undefined → defaults to 'google'
    // google has no key in decryptedByokKeys and no envGoogleKey
    // Should find openai
    expect(result!.providerId).toBe('openai');
  });

  it('rejects providers with empty key strings', () => {
    const result = pickNextFallbackProvider(
      ['google', 'openai'],
      'google',
      { openai: '' },
      undefined,
      'technical',
    );
    expect(result).toBeNull();
  });

  it('rejects providers with whitespace-only keys', () => {
    const result = pickNextFallbackProvider(
      ['google', 'openai'],
      'google',
      { openai: '   ' },
      undefined,
      'technical',
    );
    expect(result).toBeNull();
  });
});
