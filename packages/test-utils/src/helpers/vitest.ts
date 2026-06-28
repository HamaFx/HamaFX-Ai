import { vi } from 'vitest';

export function installServerOnlyStub(): void {
  vi.mock('server-only', () => ({}));
}

export interface TestEnvVars {
  [key: string]: string;
}

export function setupTestEnvironment(env?: TestEnvVars): void {
  if (env) {
    Object.entries(env).forEach(([key, value]) => {
      process.env[key] = value;
    });
  }
}

export function teardownTestEnvironment(envKeys?: string[]): void {
  if (envKeys) {
    envKeys.forEach((key) => {
      delete process.env[key];
    });
  }
}

export function freezeTime(epochMs: number): void {
  vi.setSystemTime(new Date(epochMs));
}

export function advanceTime(ms: number): void {
  vi.advanceTimersByTime(ms);
}

export function useFakeTimers(): void {
  vi.useFakeTimers();
}

export function useRealTimers(): void {
  vi.useRealTimers();
}
