// SPDX-License-Identifier: Apache-2.0

// Integration test: Web → AI pipeline.
//
// Tests that the web API route layer correctly imports from, calls, and
// handles responses from the @hamafx/ai package. The journal route is
// chosen because it exercises read (GET) and write (POST) paths through
// the full middleware → route handler → AI functions → response chain.
//
// Catches:
//   - Middleware auth gating (401 without session)
//   - Route handler → @hamafx/ai function call signatures
//   - Error propagation from @hamafx/ai through errorResponse()
//   - Request body validation with Zod schemas
//   - Response serialization (JSON shape, status codes)

import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';

// Mock @hamafx/ai journal functions
const mockListEntries = vi.hoisted(() => vi.fn());
const mockCreateEntry = vi.hoisted(() => vi.fn());
const mockComputeStats = vi.hoisted(() => vi.fn());
const mockAuthFn = vi.hoisted(() => vi.fn());

vi.mock('@hamafx/ai', () => ({
  listEntries: mockListEntries,
  createEntry: mockCreateEntry,
  computeStats: mockComputeStats,
}));

vi.mock('@/auth', () => ({
  auth: mockAuthFn,
}));

import { auth } from '@/auth';
import { GET, POST } from '@/app/api/journal/route';

const USER_ID = 'test-user-001';

const now = new Date();

const mockEntry = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  userId: USER_ID,
  symbol: 'XAUUSD',
  side: 'long',
  openedAt: Date.now() - 3600000,
  closedAt: null,
  entry: 2000.5,
  stop: 1995.0,
  target: 2010.0,
  exit: null,
  size: null,
  outcome: 'open',
  rMultiple: null,
  notes: 'test entry',
  tags: ['test'],
  screenshotUrl: null,
  attachments: [],
  createdAt: now,
  updatedAt: now,
};

const validCreatePayload = {
  symbol: 'XAUUSD',
  side: 'long',
  openedAt: Date.now() - 3600000,
  entry: 2000.5,
  stop: 1995.0,
  target: 2010.0,
};

const mockStats = {
  count: 1, wins: 0, losses: 0, breakevens: 0, open: 1,
  winRate: 0, avgR: 0, totalR: 0,
};

describe('Web → AI integration (journal route)', () => {
  beforeEach(() => {
    (auth as Mock).mockResolvedValue({
      user: { id: USER_ID, email: 'test@example.com' },
      expires: new Date(Date.now() + 86400000).toISOString(),
    });
    mockListEntries.mockResolvedValue([mockEntry]);
    mockComputeStats.mockResolvedValue(mockStats);
    mockCreateEntry.mockResolvedValue({ ...mockEntry, id: 'new-uuid' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication gating', () => {
    it('returns 401 when no session exists', async () => {
      (auth as Mock).mockResolvedValue(null);

      const response = await GET(
        new Request('http://localhost/api/journal'),
        { params: Promise.resolve({}) },
      );
      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 when session is valid', async () => {
      const response = await GET(
        new Request('http://localhost/api/journal'),
        { params: Promise.resolve({}) },
      );
      expect(response.status).toBe(200);
    });
  });

  describe('read path: GET → listEntries + computeStats', () => {
    it('calls both @hamafx/ai functions with correct userId', async () => {
      const response = await GET(
        new Request('http://localhost/api/journal'),
        { params: Promise.resolve({}) },
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0].id).toBe(mockEntry.id);
      expect(body.entries[0].symbol).toBe(mockEntry.symbol);
      expect(body.entries[0].openedAt).toBe(mockEntry.openedAt);
      expect(body.stats).toEqual(mockStats);
      expect(mockListEntries).toHaveBeenCalledWith(USER_ID, {});
      expect(mockComputeStats).toHaveBeenCalledWith(USER_ID);
    });

    it('filters entries by symbol through the @hamafx/ai boundary', async () => {
      await GET(
        new Request('http://localhost/api/journal?symbol=XAUUSD'),
        { params: Promise.resolve({}) },
      );
      expect(mockListEntries).toHaveBeenCalledWith(USER_ID, { symbol: 'XAUUSD' });
    });
  });

  describe('write path: POST → createEntry', () => {
    it('creates an entry through the @hamafx/ai boundary', async () => {
      const response = await POST(
        new Request('http://localhost/api/journal', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(validCreatePayload),
        }),
        { params: Promise.resolve({}) },
      );
      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.entry.id).toBe('new-uuid');
    });

    it('rejects invalid payloads with 400', async () => {
      const response = await POST(
        new Request('http://localhost/api/journal', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ invalid: true }),
        }),
        { params: Promise.resolve({}) },
      );
      expect(response.status).toBe(400);
    });
  });

  describe('error propagation: @hamafx/ai → route handler', () => {
    it('propagates service errors as 500 responses', async () => {
      mockListEntries.mockRejectedValue(new Error('Database connection refused'));

      const response = await GET(
        new Request('http://localhost/api/journal'),
        { params: Promise.resolve({}) },
      );
      expect(response.status).toBe(500);
    });
  });
});
