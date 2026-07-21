import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock all external dependencies for buildLiveSnapshot
vi.mock('@hamafx/data', () => ({
  getPrice: vi.fn(),
}));

vi.mock('@hamafx/db', () => ({
  schema: {},
  listUserSymbols: vi.fn(),
}));

vi.mock('../src/db', () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
  })),
}));

vi.mock('@hamafx/shared', () => ({
  SYMBOLS: ['XAUUSD'],
  getMarketPhase: vi.fn(() => 'off'),
}));

vi.mock('drizzle-orm', () => ({
  desc: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@hamafx/shared/logger', () => ({
  createCategorizedLogger: vi.fn(() => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('buildLiveSnapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('detects London session at Monday 10:00 UTC', async () => {
    // London: hour 7-12. July 20, 2026 is Monday
    vi.setSystemTime(new Date('2026-07-20T10:00:00Z'));
    const { buildLiveSnapshot } = await import('../src/context');

    const snapshot = await buildLiveSnapshot({});
    expect(snapshot.session).toBe('london');
  });

  it('detects NY session at Monday 17:00 UTC', async () => {
    // NY: hour 12-21
    vi.setSystemTime(new Date('2026-07-20T17:00:00Z'));
    const { buildLiveSnapshot } = await import('../src/context');

    const snapshot = await buildLiveSnapshot({});
    expect(snapshot.session).toBe('ny');
  });

  it('detects Asia session at Monday 3:00 UTC', async () => {
    // Asia: hour 0-7
    vi.setSystemTime(new Date('2026-07-20T03:00:00Z'));
    const { buildLiveSnapshot } = await import('../src/context');

    const snapshot = await buildLiveSnapshot({});
    expect(snapshot.session).toBe('asia');
  });

  it('detects off session on Saturday (day 6)', async () => {
    // Saturday: day 6 is always 'off'
    vi.setSystemTime(new Date('2026-07-25T10:00:00Z'));
    const { buildLiveSnapshot } = await import('../src/context');

    const snapshot = await buildLiveSnapshot({});
    expect(snapshot.session).toBe('off');
  });

  it('detects off session on Sunday before 22:00 UTC', async () => {
    // Sunday before 22:00 UTC
    vi.setSystemTime(new Date('2026-07-19T10:00:00Z'));
    const { buildLiveSnapshot } = await import('../src/context');

    const snapshot = await buildLiveSnapshot({});
    expect(snapshot.session).toBe('off');
  });

  it('detects Asia session on Sunday after 22:00 UTC (FX open)', async () => {
    // Sunday after 22:00 UTC → Monday's Asia session starts
    vi.setSystemTime(new Date('2026-07-19T23:00:00Z'));
    const { buildLiveSnapshot } = await import('../src/context');

    const snapshot = await buildLiveSnapshot({});
    expect(snapshot.session).toBe('asia');
  });

  it('returns a valid snapshot structure with prices and marketPhase', async () => {
    vi.setSystemTime(new Date('2026-07-20T10:00:00Z'));
    const { buildLiveSnapshot } = await import('../src/context');

    const snapshot = await buildLiveSnapshot({});
    expect(snapshot).toHaveProperty('session');
    expect(snapshot).toHaveProperty('prices');
    expect(snapshot).toHaveProperty('marketPhase');
    expect(snapshot).toHaveProperty('asOf');
    expect(snapshot.asOf).toBe('2026-07-20T10:00:00.000Z');
  });

  it('handles optional userId for watchlist', async () => {
    vi.setSystemTime(new Date('2026-07-20T10:00:00Z'));
    const { buildLiveSnapshot } = await import('../src/context');

    const snapshot = await buildLiveSnapshot({ userId: 'test-user' });
    expect(snapshot).toBeDefined();
    expect(snapshot.session).toBe('london');
  });
});
