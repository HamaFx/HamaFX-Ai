// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assertProductionSecurity } from '../src/auth.config';

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  AUTH_MODE: process.env.AUTH_MODE,
  AUTH_SECRET: process.env.AUTH_SECRET,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
};

describe('assertProductionSecurity', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_MODE = 'normal';
    process.env.AUTH_SECRET = 'a'.repeat(32);
    delete process.env.NEXTAUTH_SECRET;
  });

  afterEach(() => {
    if (originalEnv.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv.NODE_ENV;
    if (originalEnv.AUTH_MODE === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = originalEnv.AUTH_MODE;
    if (originalEnv.AUTH_SECRET === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalEnv.AUTH_SECRET;
    if (originalEnv.NEXTAUTH_SECRET === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = originalEnv.NEXTAUTH_SECRET;
  });

  it('allows normal production authentication with a valid secret', () => {
    expect(() => assertProductionSecurity()).not.toThrow();
  });

  it('rejects legacy authentication in production', () => {
    process.env.AUTH_MODE = 'legacy';

    expect(() => assertProductionSecurity()).toThrow(
      /AUTH_MODE=legacy is forbidden in production/,
    );
  });

  it('allows legacy authentication outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.AUTH_MODE = 'legacy';

    expect(() => assertProductionSecurity()).not.toThrow();
  });

  it('rejects production authentication without a signing secret', () => {
    delete process.env.AUTH_SECRET;

    expect(() => assertProductionSecurity()).toThrow(
      /AUTH_SECRET \(or NEXTAUTH_SECRET\) must be set in production/,
    );
  });
});
