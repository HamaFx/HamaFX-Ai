import { describe, expect, it } from 'vitest';

import { guardXauusdFollowupText } from '../src/mastra/followup-safety';
import type { XauusdResearchPacket } from '../src/mastra/research-types';
import type { XauusdResearchReport } from '../src/mastra/report-types';

const report = { numericClaims: [{ label: 'price', value: 2400, evidenceId: 'price-1', tolerance: 0.01 }] } as unknown as XauusdResearchReport;
const packet = { packetId: 'packet-1', status: 'ready', price: null } as unknown as XauusdResearchPacket;

describe('guardXauusdFollowupText', () => {
  it('keeps explanations that use trusted report numbers', () => {
    expect(guardXauusdFollowupText('The invalidation is below gold at 2400.', report, packet)).toContain('2400');
  });

  it('fails closed for a new unsupported market number', () => {
    const text = guardXauusdFollowupText('Gold should break resistance at 9999.', report, packet);
    expect(text).toContain('stopped');
    expect(text).not.toContain('9999');
  });
});
