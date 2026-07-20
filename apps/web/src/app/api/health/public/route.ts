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

// PR-05: Unauthenticated public health endpoint for uptime monitors.
//
// Unlike the authenticated /api/health endpoint (which requires a user
// session and returns rich diagnostics), this endpoint is:
//   - UNAUTHENTICATED — for external uptime monitors (Better Stack,
//     Pingdom, healthchecks.io HTTP checks)
//   - MINIMAL — DB connectivity only, no env secrets, no cron/analysis
//     job details
//   - RATE-LIMITED — global sliding window per IP to prevent abuse
//     (no user context available for per-user rate limiting)
//
// Returns:
//   200 — DB is reachable
//   503 — DB is unreachable
//   429 — rate limited

import { NextResponse } from 'next/server';
import { getDb } from '@hamafx/ai';
import { sql } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Simple in-memory IP rate limiter for the public endpoint.
// Since there's no user session, we rate-limit by IP with a generous
// window: 60 requests per minute per IP.
const ipCounters = new Map<string, { count: number; resetAt: number }>();
const PUBLIC_HEALTH_RATE_LIMIT = 60; // requests per minute per IP
const MAX_IP_ENTRIES = 10_000; // hard cap to prevent memory exhaustion under DDoS
const CLEANUP_INTERVAL_MS = 60_000; // clean stale entries every minute
let lastCleanup = Date.now();

function getClientIp(request: Request): string {
  // Trust Vercel's x-forwarded-for header (first IP in the chain).
  // Fall back to x-real-ip or a placeholder.
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]!.trim();
  }
  return request.headers.get('x-real-ip') ?? 'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; count: number } {
  const now = Date.now();

  // Hard cap: if under DDoS with spoofed IPs, clear all entries to prevent
  // unbounded memory growth. This is a blunt instrument — legitimate clients
  // will be temporarily unblocked, but that's better than an OOM crash.
  if (ipCounters.size > MAX_IP_ENTRIES) {
    ipCounters.clear();
    lastCleanup = now;
  }

  // Periodic cleanup of stale entries
  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    for (const [key, entry] of ipCounters) {
      if (now > entry.resetAt) ipCounters.delete(key);
    }
    lastCleanup = now;
  }

  const entry = ipCounters.get(ip);
  if (!entry || now > entry.resetAt) {
    ipCounters.set(ip, { count: 1, resetAt: now + 60_000 });
    return { allowed: true, count: 1 };
  }

  entry.count++;
  if (entry.count > PUBLIC_HEALTH_RATE_LIMIT) {
    return { allowed: false, count: entry.count };
  }

  return { allowed: true, count: entry.count };
}

export async function GET(request: Request): Promise<Response> {
  // Rate limit by IP
  const ip = getClientIp(request);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { status: 'rate_limited', message: 'Too many health checks' },
      {
        status: 429,
        headers: { 'Retry-After': '60' },
      },
    );
  }

  // Minimal check: DB connectivity only.
  let dbOk = false;
  try {
    const start = Date.now();
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    void start; // latency not exposed in public endpoint
    dbOk = true;
  } catch {
    // DB unreachable — will return 503 below
  }

  const healthy = dbOk;
  const httpStatus = healthy ? 200 : 503;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'error',
      ts: new Date().toISOString(),
      version: process.env.DEPLOYED_SHA ?? 'unknown',
    },
    {
      status: httpStatus,
      // Prevent caching so uptime monitors always get a fresh result
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    },
  );
}
