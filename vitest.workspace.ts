import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/ai/vitest.config.ts',
  'packages/data/vitest.config.ts',
  'packages/db/vitest.config.ts',
  'packages/indicators/vitest.config.ts',
  'packages/shared/vitest.config.ts',
  'packages/test-utils/vitest.config.ts',
  'apps/web/vitest.config.ts',
  'apps/worker/vitest.config.ts',
]);
