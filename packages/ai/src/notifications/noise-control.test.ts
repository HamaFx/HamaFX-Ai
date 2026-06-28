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

// F4 — Noise Control Engine Tests
//
// Tests the pure noise evaluation logic: dedup, cooldown, quiet hours,
// and severity filtering.

import { describe, expect, it, beforeEach } from 'vitest';

import {
  evaluateNoise,
  hashContent,
  isQuietHours,
  InMemoryNoiseState,
} from './noise-control';
import { DEFAULT_NOISE_CONFIG } from '@hamafx/shared';

describe('hashContent', () => {
  it('produces a stable hash for the same content + route', () => {
    const a = hashContent('XAUUSD alert: price > 2700', 'alert');
    const b = hashContent('XAUUSD alert: price > 2700', 'alert');
    expect(a).toBe(b);
  });

  it('produces different hashes for different content', () => {
    const a = hashContent('XAUUSD alert: price > 2700', 'alert');
    const b = hashContent('EURUSD alert: price > 1.10', 'alert');
    expect(a).not.toBe(b);
  });

  it('produces different hashes for different route types with same content', () => {
    const a = hashContent('Same content', 'alert');
    const b = hashContent('Same content', 'report');
    expect(a).not.toBe(b);
  });
});

describe('isQuietHours', () => {
  it('returns false when quietHours is null', () => {
    expect(isQuietHours(null, 'UTC', new Date('2026-01-01T23:00:00Z'))).toBe(false);
  });

  it('detects same-day quiet hours correctly', () => {
    // 09:00-17:00 quiet hours
    const quietHours = { start: '09:00', end: '17:00' };
    expect(isQuietHours(quietHours, 'UTC', new Date('2026-01-01T10:00:00Z'))).toBe(true);
    expect(isQuietHours(quietHours, 'UTC', new Date('2026-01-01T08:00:00Z'))).toBe(false);
    expect(isQuietHours(quietHours, 'UTC', new Date('2026-01-01T17:30:00Z'))).toBe(false);
  });

  it('detects overnight quiet hours correctly', () => {
    // 22:00-07:00 quiet hours
    const quietHours = { start: '22:00', end: '07:00' };
    expect(isQuietHours(quietHours, 'UTC', new Date('2026-01-01T23:00:00Z'))).toBe(true);
    expect(isQuietHours(quietHours, 'UTC', new Date('2026-01-01T03:00:00Z'))).toBe(true);
    expect(isQuietHours(quietHours, 'UTC', new Date('2026-01-01T12:00:00Z'))).toBe(false);
    expect(isQuietHours(quietHours, 'UTC', new Date('2026-01-01T08:00:00Z'))).toBe(false);
  });
});

describe('evaluateNoise', () => {
  let state: InMemoryNoiseState;

  beforeEach(() => {
    state = new InMemoryNoiseState();
  });

  it('allows the first notification', async () => {
    const decision = await evaluateNoise(
      'XAUUSD price alert',
      'alert',
      'warning',
      DEFAULT_NOISE_CONFIG,
      state,
    );
    expect(decision.shouldSend).toBe(true);
    expect(decision.reasonCode).toBe('allowed');
  });

  it('suppresses duplicate content within dedup TTL', async () => {
    await evaluateNoise('XAUUSD price alert', 'alert', 'warning', DEFAULT_NOISE_CONFIG, state);
    const decision = await evaluateNoise(
      'XAUUSD price alert',
      'alert',
      'warning',
      DEFAULT_NOISE_CONFIG,
      state,
    );
    expect(decision.shouldSend).toBe(false);
    expect(decision.reasonCode).toBe('duplicate');
  });

  it('allows different content within dedup TTL', async () => {
    const config = { ...DEFAULT_NOISE_CONFIG, cooldownSeconds: 0 };
    await evaluateNoise('XAUUSD price alert', 'alert', 'warning', config, state);
    const decision = await evaluateNoise(
      'EURUSD price alert',
      'alert',
      'warning',
      config,
      state,
    );
    expect(decision.shouldSend).toBe(true);
  });

  it('suppresses below min severity', async () => {
    const config = { ...DEFAULT_NOISE_CONFIG, minSeverity: 'error' as const };
    const decision = await evaluateNoise(
      'Info message',
      'report',
      'info',
      config,
      state,
    );
    expect(decision.shouldSend).toBe(false);
    expect(decision.reasonCode).toBe('below_min_severity');
  });

  it('allows at or above min severity', async () => {
    const config = { ...DEFAULT_NOISE_CONFIG, minSeverity: 'error' as const };
    const decision = await evaluateNoise(
      'Error message',
      'report',
      'error',
      config,
      state,
    );
    expect(decision.shouldSend).toBe(true);
  });

  it('suppresses during quiet hours below quiet-hours min severity', async () => {
    const config = {
      ...DEFAULT_NOISE_CONFIG,
      quietHours: { start: '00:00', end: '23:59' }, // All day quiet hours
      minSeverityDuringQuietHours: 'critical' as const,
    };
    const decision = await evaluateNoise(
      'Warning message',
      'alert',
      'warning',
      config,
      state,
    );
    expect(decision.shouldSend).toBe(false);
    expect(decision.reasonCode).toBe('quiet_hours');
  });

  it('allows critical during quiet hours', async () => {
    const config = {
      ...DEFAULT_NOISE_CONFIG,
      quietHours: { start: '00:00', end: '23:59' },
      minSeverityDuringQuietHours: 'critical' as const,
    };
    const decision = await evaluateNoise(
      'Critical message',
      'alert',
      'critical',
      config,
      state,
    );
    expect(decision.shouldSend).toBe(true);
  });

  it('suppresses same route type within cooldown', async () => {
    // First notification goes through
    await evaluateNoise('First alert', 'alert', 'warning', DEFAULT_NOISE_CONFIG, state);
    // Second notification with different content but same route type
    const decision = await evaluateNoise(
      'Second alert different content',
      'alert',
      'warning',
      DEFAULT_NOISE_CONFIG,
      state,
    );
    expect(decision.shouldSend).toBe(false);
    expect(decision.reasonCode).toBe('cooldown');
  });

  it('allows different route types within cooldown', async () => {
    await evaluateNoise('First alert', 'alert', 'warning', DEFAULT_NOISE_CONFIG, state);
    const decision = await evaluateNoise(
      'Report content',
      'report',
      'warning',
      DEFAULT_NOISE_CONFIG,
      state,
    );
    expect(decision.shouldSend).toBe(true);
  });
});