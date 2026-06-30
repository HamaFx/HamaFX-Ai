import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));

const mockListEntries = vi.hoisted(() => vi.fn());
const mockCreateEntry = vi.hoisted(() => vi.fn());
const mockComputeStats = vi.hoisted(() => vi.fn());
const mockGetEntry = vi.hoisted(() => vi.fn());
const mockUpdateEntry = vi.hoisted(() => vi.fn());
const mockDeleteEntry = vi.hoisted(() => vi.fn());

vi.mock('@hamafx/ai', () => ({
  listEntries: mockListEntries,
  createEntry: mockCreateEntry,
  computeStats: mockComputeStats,
  getEntry: mockGetEntry,
  updateEntry: mockUpdateEntry,
  deleteEntry: mockDeleteEntry,
}));

import { auth } from '@/auth';
import { GET, POST } from '@/app/api/journal/route';
import { PATCH, DELETE } from '@/app/api/journal/[id]/route';

const USER_ID = 'test-user-001';

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
  attachments: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
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
  count: 1,
  wins: 0,
  losses: 0,
  breakevens: 0,
  open: 1,
  winRate: 0,
  avgR: 0,
  totalR: 0,
};

beforeEach(() => {
  (auth as Mock).mockResolvedValue({
    user: { id: USER_ID, email: 'test@example.com' },
    expires: new Date(Date.now() + 86400000).toISOString(),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/journal', () => {
  it('returns entries and stats', async () => {
    mockListEntries.mockResolvedValue([mockEntry]);
    mockComputeStats.mockResolvedValue(mockStats);

    const response = await GET(new Request('http://localhost/api/journal'), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.entries).toEqual([mockEntry]);
    expect(body.stats).toEqual(mockStats);
    expect(mockListEntries).toHaveBeenCalledWith(USER_ID, {});
  });

  it('filters by symbol when ?symbol is provided', async () => {
    mockListEntries.mockResolvedValue([mockEntry]);
    mockComputeStats.mockResolvedValue(mockStats);

    const response = await GET(
      new Request('http://localhost/api/journal?symbol=XAUUSD'),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(200);
    expect(mockListEntries).toHaveBeenCalledWith(USER_ID, { symbol: 'XAUUSD' });
  });

  it('returns 401 when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);

    const response = await GET(new Request('http://localhost/api/journal'), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('POST /api/journal', () => {
  it('creates an entry and returns 201', async () => {
    const created = { ...mockEntry, id: 'new-uuid' };
    mockCreateEntry.mockResolvedValue(created);

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
    expect(body.entry).toEqual(created);
    expect(mockCreateEntry).toHaveBeenCalledWith({
      userId: USER_ID,
      symbol: validCreatePayload.symbol,
      side: validCreatePayload.side,
      openedAt: validCreatePayload.openedAt,
      entry: validCreatePayload.entry,
      stop: validCreatePayload.stop,
      target: validCreatePayload.target,
      size: null,
      notes: null,
      tags: [],
      screenshotUrl: null,
    });
  });

  it('returns 400 for invalid payload', async () => {
    const response = await POST(
      new Request('http://localhost/api/journal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it('returns 401 when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);

    const response = await POST(
      new Request('http://localhost/api/journal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validCreatePayload),
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(401);
  });
});

describe('PATCH /api/journal/[id]', () => {
  it('updates a journal entry', async () => {
    const updated = { ...mockEntry, exit: 2010.0, outcome: 'win' };
    mockUpdateEntry.mockResolvedValue(updated);

    const response = await PATCH(
      new Request('http://localhost/api/journal/id', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ exit: 2010.0, outcome: 'win' }),
      }),
      { params: Promise.resolve({ id: mockEntry.id }) },
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.entry.exit).toBe(2010.0);
    expect(body.entry.outcome).toBe('win');
  });

  it('returns 404 when entry not found', async () => {
    mockUpdateEntry.mockResolvedValue(null);

    const response = await PATCH(
      new Request('http://localhost/api/journal/id', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes: 'updated' }),
      }),
      { params: Promise.resolve({ id: 'nonexistent' }) },
    );
    expect(response.status).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);

    const response = await PATCH(
      new Request('http://localhost/api/journal/id', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes: 'updated' }),
      }),
      { params: Promise.resolve({ id: mockEntry.id }) },
    );
    expect(response.status).toBe(401);
  });
});

describe('DELETE /api/journal/[id]', () => {
  it('deletes a journal entry', async () => {
    mockDeleteEntry.mockResolvedValue(true);

    const response = await DELETE(new Request('http://localhost/api/journal/id', { method: 'DELETE' }), {
      params: Promise.resolve({ id: mockEntry.id }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(mockDeleteEntry).toHaveBeenCalledWith(USER_ID, mockEntry.id);
  });

  it('returns 404 when entry not found', async () => {
    mockDeleteEntry.mockResolvedValue(false);

    const response = await DELETE(new Request('http://localhost/api/journal/id', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'nonexistent' }),
    });
    expect(response.status).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);

    const response = await DELETE(new Request('http://localhost/api/journal/id', { method: 'DELETE' }), {
      params: Promise.resolve({ id: mockEntry.id }),
    });
    expect(response.status).toBe(401);
  });
});
