// SPDX-License-Identifier: Apache-2.0

// OBS-12 (Phase 5.4): Auth anomaly metrics + threshold alerting.
//
// Tracks auth events in an in-memory sliding window and fires Sentry
// alerts when thresholds are crossed. Designed to be called from:
//   - withAuth() on 401 responses
//   - loginAction / registerAction on success/failure
//   - The credentials provider authorize() on ACCOUNT_LOCKED / 2FA failures
//
// The detector runs entirely in-process (no DB). For a multi-instance
// deployment (Vercel serverless), each instance has its own window —
// this is a best-effort early-warning system, not a precise aggregate.
// The thresholds are conservative to avoid alert fatigue.

import * as Sentry from '@sentry/nextjs';

type AuthEventType =
  | 'login_success'
  | 'login_failure'
  | 'account_locked'
  | '2fa_failure'
  | 'unauthorized_401';

interface AuthEvent {
  type: AuthEventType;
  ts: number;
}

// Sliding window: 5 minutes
const WINDOW_MS = 5 * 60 * 1000;
const events: AuthEvent[] = [];

// Thresholds (per 5-minute window)
const THRESHOLDS = {
  // 401 rate: >50 unauthorized requests in 5 min = likely credential stuffing
  UNAUTHORIZED_401: 50,
  // ACCOUNT_LOCKED: >10 locked accounts in 5 min = brute-force wave
  ACCOUNT_LOCKED: 10,
  // 2FA failures: >15 in 5 min = 2FA bypass attempt
  TWO_FA_FAILURE: 15,
  // Login success rate drops below 30% with >20 total attempts
  MIN_LOGIN_SUCCESS_RATE: 0.30,
  MIN_LOGIN_ATTEMPTS_FOR_RATE: 20,
};

// Rate-limit Sentry captures to avoid duplicate alerts
const lastAlertAt: Partial<Record<AuthEventType, number>> = {};
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function pruneOldEvents(): void {
  const cutoff = Date.now() - WINDOW_MS;
  while (events.length > 0 && events[0]!.ts < cutoff) {
    events.shift();
  }
}

function maybeAlert(type: AuthEventType, message: string, extra?: Record<string, unknown>): void {
  const now = Date.now();
  const lastAt = lastAlertAt[type] ?? 0;
  if (now - lastAt < ALERT_COOLDOWN_MS) return;
  lastAlertAt[type] = now;
  Sentry.captureMessage(message, {
    level: 'warning',
    tags: { component: 'auth-anomaly', anomaly: type },
    ...(extra ? { extra } : {}),
  });
}

/**
 * Record an auth event and check thresholds.
 * Call this from auth-related code paths.
 */
export function recordAuthEvent(type: AuthEventType): void {
  events.push({ type, ts: Date.now() });
  pruneOldEvents();
  checkThresholds();
}

function checkThresholds(): void {
  const now = Date.now();
  const recent = events.filter((e) => now - e.ts < WINDOW_MS);

  // Count by type
  const counts: Record<AuthEventType, number> = {
    login_success: 0,
    login_failure: 0,
    account_locked: 0,
    '2fa_failure': 0,
    unauthorized_401: 0,
  };
  for (const e of recent) {
    counts[e.type] += 1;
  }

  // 401 rate anomaly
  if (counts.unauthorized_401 > THRESHOLDS.UNAUTHORIZED_401) {
    maybeAlert(
      'unauthorized_401',
      `Auth anomaly: ${counts.unauthorized_401} unauthorized (401) requests in 5 min — possible credential stuffing`,
      { count: counts.unauthorized_401, threshold: THRESHOLDS.UNAUTHORIZED_401 },
    );
  }

  // ACCOUNT_LOCKED spike
  if (counts.account_locked > THRESHOLDS.ACCOUNT_LOCKED) {
    maybeAlert(
      'account_locked',
      `Auth anomaly: ${counts.account_locked} account lockouts in 5 min — possible brute-force attack`,
      { count: counts.account_locked, threshold: THRESHOLDS.ACCOUNT_LOCKED },
    );
  }

  // 2FA failure spike
  if (counts['2fa_failure'] > THRESHOLDS.TWO_FA_FAILURE) {
    maybeAlert(
      '2fa_failure',
      `Auth anomaly: ${counts['2fa_failure']} 2FA failures in 5 min — possible 2FA bypass attempt`,
      { count: counts['2fa_failure'], threshold: THRESHOLDS.TWO_FA_FAILURE },
    );
  }

  // Login success rate drop
  const totalLoginAttempts = counts.login_success + counts.login_failure;
  if (
    totalLoginAttempts >= THRESHOLDS.MIN_LOGIN_ATTEMPTS_FOR_RATE &&
    counts.login_success / totalLoginAttempts < THRESHOLDS.MIN_LOGIN_SUCCESS_RATE
  ) {
    const successRate = (counts.login_success / totalLoginAttempts * 100).toFixed(1);
    maybeAlert(
      'login_failure',
      `Auth anomaly: login success rate dropped to ${successRate}% (${counts.login_success}/${totalLoginAttempts} in 5 min)`,
      {
        successCount: counts.login_success,
        failureCount: counts.login_failure,
        totalAttempts: totalLoginAttempts,
        successRate: `${successRate}%`,
      },
    );
  }
}

/**
 * Get current auth event counts (for health endpoint / diagnostics).
 */
export function getAuthEventCounts(): Record<AuthEventType, number> & { windowMs: number } {
  pruneOldEvents();
  const now = Date.now();
  const recent = events.filter((e) => now - e.ts < WINDOW_MS);
  const counts: Record<AuthEventType, number> = {
    login_success: 0,
    login_failure: 0,
    account_locked: 0,
    '2fa_failure': 0,
    unauthorized_401: 0,
  };
  for (const e of recent) {
    counts[e.type] += 1;
  }
  return { ...counts, windowMs: WINDOW_MS };
}
