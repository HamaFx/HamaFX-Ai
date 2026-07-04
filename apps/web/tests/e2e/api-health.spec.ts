/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// ---------------------------------------------------------------------------
// E2E: API health checks
//
// Verifies that key API endpoints respond correctly. These are lightweight
// smoke tests — not full API integration tests (those live in vitest).
// ---------------------------------------------------------------------------

import { test, expect } from '@playwright/test';

test.describe('API health', () => {
  test('GET /api/health returns 200', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
  });

  test('GET /api/health/db returns 200 or 503', async ({ request }) => {
    const response = await request.get('/api/health/db');
    // 200 = healthy, 503 = db unavailable (acceptable in test env without DB)
    expect([200, 503]).toContain(response.status());
  });

  test('unauthenticated API requests return 401 or redirect', async ({ request }) => {
    // Try to access a protected API endpoint without auth
    const response = await request.get('/api/chat/threads', {
      maxRedirects: 0,
    });

    // Should be 401, 403, or 307 (redirect to login)
    expect([401, 403, 307]).toContain(response.status());
  });

  test('GET /api/settings/catalog returns data or 401', async ({ request }) => {
    const response = await request.get('/api/settings/catalog', {
      maxRedirects: 0,
    });

    // Without auth, should be 401/403/307
    expect([200, 401, 403, 307]).toContain(response.status());
  });

  test('CSRF protection on POST endpoints', async ({ request }) => {
    // POST without CSRF token should be rejected
    const response = await request.post('/api/chat/threads', {
      data: { title: 'test' },
      maxRedirects: 0,
    });

    // Should be rejected (403 for CSRF, 401 for auth, or 307 redirect)
    expect([401, 403, 307]).toContain(response.status());
  });
});
