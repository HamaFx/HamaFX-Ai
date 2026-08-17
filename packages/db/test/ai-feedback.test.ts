import { describe, expect, it } from 'vitest';

import { schema } from '../src/client';

describe('AI feedback and dataset registry schema contracts', () => {
  it('exposes tenant-scoped feedback with user/message uniqueness', () => {
    expect(schema.aiMessageFeedback).toBeDefined();
    expect(schema.aiMessageFeedback.userId).toBeDefined();
    expect(schema.aiMessageFeedback.messageId).toBeDefined();
    expect(schema.aiMessageFeedback.reviewStatus).toBeDefined();
  });

  it('exposes content-addressed dataset lifecycle fields', () => {
    expect(schema.evalDatasets).toBeDefined();
    expect(schema.evalDatasets.version).toBeDefined();
    expect(schema.evalDatasets.contentSha256).toBeDefined();
    expect(schema.evalDatasets.status).toBeDefined();
    expect(schema.evalDatasets.provenance).toBeDefined();
  });
});
