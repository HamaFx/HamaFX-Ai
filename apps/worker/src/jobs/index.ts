// Job registry. The systemd one-shot units invoke `node dist/runner/cli.js
// <name>`, which looks up the run function here. Adding a new job means
// (a) writing a `<name>.ts` file with `runX(ctx)`, (b) listing it here,
// and (c) extending `JobName` in ./types.ts.

import { runEmbeddingBackfill } from './embedding-backfill.js';
import type { JobFn, JobName } from './types.js';

export const JOBS: Record<JobName, { run: JobFn; description: string }> = {
  'embedding-backfill': {
    run: runEmbeddingBackfill,
    description:
      'Embed news_articles missing embeddings via the AI Gateway. Phase 8 PR-9 moved this off Vercel.',
  },
};

export type { JobFn, JobName, JobContext, JobResult } from './types.js';
