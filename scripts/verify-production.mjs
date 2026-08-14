#!/usr/bin/env node
/**
 * Copyright 2026 Kestrel
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
 */

/**
 * Read-only production verification.
 *
 * Usage:
 *   PRODUCTION_URL=https://hamafx-ai.vercel.app pnpm verify:production
 *   PRODUCTION_URL=... WORKER_HEALTH_URL=http://127.0.0.1:8081 pnpm verify:production
 *   VERIFY_MIGRATIONS=1 DIRECT_URL=... pnpm verify:production
 *
 * This command never applies migrations and never prints secret values.
 */

import { execFileSync } from 'node:child_process';

const timeoutMs = 15_000;

function requiredUrl(name, value) {
  if (!value) throw new Error(`${name} is required`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${name} must use http or https`);
  }
  return parsed;
}

async function checkEndpoint(name, url, headers = {}) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json', ...headers },
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    // A non-JSON response is still reported as a failed contract check.
  }
  const status = body && typeof body === 'object' && 'status' in body ? body.status : 'unknown';
  console.log(`[verify-production] ${name}: HTTP ${response.status}, status=${String(status)}`);
  if (!response.ok || status !== 'ok') {
    throw new Error(`${name} is not healthy`);
  }
  return body;
}

function verifyMigrationConfiguration() {
  const production = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (!production && process.env.VERIFY_MIGRATIONS !== '1') return;
  if (!process.env.DIRECT_URL && !process.env.POSTGRES_URL_NON_POOLING) {
    throw new Error('DIRECT_URL or POSTGRES_URL_NON_POOLING is required for migration verification');
  }
  if (process.env.VERIFY_MIGRATIONS !== '1') {
    console.log('[verify-production] migration connection configured (status check skipped; set VERIFY_MIGRATIONS=1 to run it)');
    return;
  }

  execFileSync('pnpm', ['--filter', '@kestrel/db', 'migrate:status'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: process.env.DIRECT_URL ?? process.env.POSTGRES_URL_NON_POOLING,
    },
  });
}

function verifyObservabilityConfiguration() {
  const langfuse = [
    process.env.LANGFUSE_PUBLIC_KEY,
    process.env.LANGFUSE_SECRET_KEY,
    process.env.LANGFUSE_BASE_URL,
  ];
  const configured = langfuse.every(Boolean);
  const partial = langfuse.some(Boolean) && !configured;
  if (partial) throw new Error('Langfuse configuration is partial; set all LANGFUSE_PUBLIC_KEY/SECRET_KEY/BASE_URL values or none');
  if (configured && process.env.LANGFUSE_RECORD_IO !== '1' && process.env.LANGFUSE_RECORD_IO !== 'true') {
    console.log('[verify-production] Langfuse: configured with prompt/output capture disabled');
  } else if (configured) {
    console.warn('[verify-production] WARNING: LANGFUSE_RECORD_IO is enabled; confirm privacy approval before production use');
  } else {
    console.log('[verify-production] Langfuse: disabled');
  }
}

export async function verifyProduction() {
  const productionUrl = requiredUrl('PRODUCTION_URL', process.env.PRODUCTION_URL ?? process.env.NEXT_PUBLIC_APP_URL);
  await checkEndpoint('web public health', new URL('/api/health/public', productionUrl));

  if (process.env.WORKER_HEALTH_URL) {
    const workerUrl = requiredUrl('WORKER_HEALTH_URL', process.env.WORKER_HEALTH_URL);
    await checkEndpoint('worker health', new URL('/health', workerUrl));
  } else {
    console.log('[verify-production] worker health: skipped (set WORKER_HEALTH_URL to verify it)');
  }

  if (process.env.VERIFY_ALERTS === '1') {
    const cronSecret = process.env.PRODUCTION_CRON_SECRET ?? process.env.CRON_SECRET;
    if (!cronSecret) throw new Error('CRON_SECRET or PRODUCTION_CRON_SECRET is required when VERIFY_ALERTS=1');
    await checkEndpoint('SLO alert contract', new URL('/api/health/alerts', productionUrl), {
      authorization: `Bearer ${cronSecret}`,
    });
  } else {
    console.log('[verify-production] SLO alert contract: skipped (set VERIFY_ALERTS=1 to verify it)');
  }

  verifyMigrationConfiguration();
  verifyObservabilityConfiguration();
  console.log('[verify-production] verification complete');
}

const isEntryPoint = process.argv[1]?.endsWith('verify-production.mjs') ?? false;
if (isEntryPoint) {
  verifyProduction().catch((error) => {
    console.error(`[verify-production] FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
