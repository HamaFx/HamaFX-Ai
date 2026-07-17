// Reusable executor/stage presets for the five k6 test types.
// Every test file imports the preset it needs so the load model is
// consistent and centrally tunable.
// NB: Do NOT add 'name' to scenario configs — k6 v2.0 rejects unknown fields.

export interface LoadProfileOptions {
  executor: string;
  [key: string]: unknown;
}

// ── Smoke ──────────────────────────────────────────────────────────
export function smoke(
  vus = 1,
  iterations = 3,
): { scenarios: Record<string, LoadProfileOptions> } {
  return {
    scenarios: {
      smoke: {
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
  targetRps: number,
  preAllocatedVUs: number,
  maxVUs: number,
  holdDuration = '5m',
): { scenarios: Record<string, LoadProfileOptions> } {
  return {
    scenarios: {
      average: {
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
  steps: number[],
  stepDuration = '1m',
  preAllocatedVUs = 50,
  maxVUs = 200,
): { scenarios: Record<string, LoadProfileOptions> } {
  // Ramping-arrival-rate automatically ramps between stage targets.
  // Each stage holds at its target for the given duration.
  const stages = steps.map((target) => ({ target, duration: stepDuration }));
  return {
    scenarios: {
      stress: {
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
  peakRps: number,
  rampDuration = '20s',
  holdDuration = '1m',
  preAllocatedVUs = 50,
  maxVUs = 150,
): { scenarios: Record<string, LoadProfileOptions> } {
  return {
    scenarios: {
      spike: {
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
  targetRps: number,
  preAllocatedVUs: number,
  maxVUs: number,
  durationOverride?: string,
): { scenarios: Record<string, LoadProfileOptions> } {
  const duration = durationOverride ?? __ENV['K6_SOAK_DURATION'] ?? '1h';
  return {
    scenarios: {
      soak: {
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
