// Reusable executor/stage presets for the five k6 test types.
// Every test file imports the preset it needs so the load model is
// consistent and centrally tunable.

import type { Options } from 'k6/options';

export interface LoadProfileOptions {
  /** Human-readable name for the scenario. */
  name: string;
  /** The executor type. */
  executor: string;
  /** k6 scenario configuration. */
  [key: string]: unknown;
}

// ── Smoke ──────────────────────────────────────────────────────────
export function smoke(
  _name: string,
  vus = 1,
  iterations = 3,
): { scenarios: Record<string, LoadProfileOptions> } {
  return {
    scenarios: {
      smoke: {
        name: _name,
        executor: 'per-vu-iterations',
        vus,
        iterations,
        maxDuration: '1m',
      },
    },
  };
}

// ── Average-load (ramping-arrival-rate) ────────────────────────────
export function averageLoad(
  _name: string,
  targetRps: number,
  preAllocatedVUs: number,
  maxVUs: number,
  holdDuration = '5m',
): { scenarios: Record<string, LoadProfileOptions> } {
  return {
    scenarios: {
      average: {
        name: _name,
        executor: 'ramping-arrival-rate',
        startRate: 0,
        timeUnit: '1s',
        preAllocatedVUs,
        maxVUs,
        stages: [
          { target: Math.ceil(targetRps * 0.3), duration: '30s' },
          { target: targetRps, duration: '30s' },
          { target: targetRps, duration: holdDuration },
          { target: 0, duration: '1m' },
        ],
      },
    },
  };
}

// ── Stress (ramping-arrival-rate, climbing past average) ───────────
export function stress(
  _name: string,
  steps: number[],
  stepDuration = '1m',
  preAllocatedVUs = 50,
  maxVUs = 200,
): { scenarios: Record<string, LoadProfileOptions> } {
  const stages = steps.flatMap((target, i) => {
    // Ramping-arrival-rate automatically ramps between stage targets.
    // Each stage holds at its target for the given duration.
    if (i === 0) return [{ target, duration: stepDuration }];
    return [{ target, duration: stepDuration }];
  });
  return {
    scenarios: {
      stress: {
        name: _name,
        executor: 'ramping-arrival-rate',
        startRate: 0,
        timeUnit: '1s',
        preAllocatedVUs,
        maxVUs,
        stages,
      },
    },
  };
}

// ── Spike (sharp 0→peak→0) ────────────────────────────────────────
export function spike(
  _name: string,
  peakRps: number,
  rampDuration = '20s',
  holdDuration = '1m',
  preAllocatedVUs = 50,
  maxVUs = 150,
): { scenarios: Record<string, LoadProfileOptions> } {
  return {
    scenarios: {
      spike: {
        name: _name,
        executor: 'ramping-arrival-rate',
        startRate: 0,
        timeUnit: '1s',
        preAllocatedVUs,
        maxVUs,
        stages: [
          { target: peakRps, duration: rampDuration },
          { target: peakRps, duration: holdDuration },
          { target: 0, duration: '1m' },
        ],
      },
    },
  };
}

// ── Soak (constant-arrival-rate, long-duration) ────────────────────
export function soak(
  _name: string,
  targetRps: number,
  preAllocatedVUs: number,
  maxVUs: number,
  durationOverride?: string,
): { scenarios: Record<string, LoadProfileOptions> } {
  const duration = durationOverride ?? __ENV['K6_SOAK_DURATION'] ?? '1h';
  return {
    scenarios: {
      soak: {
        name: _name,
        executor: 'constant-arrival-rate',
        rate: targetRps,
        timeUnit: '1s',
        duration,
        preAllocatedVUs,
        maxVUs,
      },
    },
  };
}
