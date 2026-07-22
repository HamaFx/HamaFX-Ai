// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { parseJsonBody } from '../src/lib/api';

const Schema = z.object({ payload: z.string() });

function reqWithBody(body: string, contentLength?: number): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (contentLength !== undefined) {
    headers.set('content-length', String(contentLength));
  }
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers,
    body,
  });
}

describe('parseJsonBody — payload cap', () => {
  beforeEach(() => {
    delete process.env.MAX_JSON_BODY_BYTES;
  });
  afterEach(() => {
    delete process.env.MAX_JSON_BODY_BYTES;
  });

  it('parses a small valid body', async () => {
    const body = JSON.stringify({ payload: 'hello' });
    const result = await parseJsonBody(reqWithBody(body, body.length), Schema);
    expect(result).toEqual({ payload: 'hello' });
  });

  it('rejects via Content-Length pre-check when the header overflows the cap', async () => {
    // Set a small cap so the test is fast.
    process.env.MAX_JSON_BODY_BYTES = '256';
    const huge = 'x'.repeat(2_000);
    const body = JSON.stringify({ payload: huge });
    await expect(
      parseJsonBody(reqWithBody(body, body.length), Schema),
    ).rejects.toMatchObject({ code: 'VALIDATION', status: 400 });
  });

  it('rejects via streamed byte count when no Content-Length is sent', async () => {
    process.env.MAX_JSON_BODY_BYTES = '256';
    const huge = 'x'.repeat(2_000);
    const body = JSON.stringify({ payload: huge });
    // No content-length header — the streaming path enforces the cap.
    await expect(parseJsonBody(reqWithBody(body), Schema)).rejects.toMatchObject({
      code: 'VALIDATION',
      status: 400,
    });
  });

  it('returns a clean validation error on malformed JSON', async () => {
    const body = '{not-json';
    await expect(
      parseJsonBody(reqWithBody(body, body.length), Schema),
    ).rejects.toMatchObject({ code: 'VALIDATION', status: 400 });
  });
});
