import { getNoiseConfig } from '@hamafx/ai';
import type { NoiseConfig, Severity } from '@hamafx/shared';
import { SEVERITY_RANK } from '@hamafx/shared';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEVERITY_LABELS: Severity[] = ['info', 'warning', 'error', 'critical'];

interface SimBreakdown {
  total: number;
  allowed: number;
  blocked: number;
  bySeverity: { severity: Severity; total: number; allowed: number; blocked: number }[];
  digestMode: boolean;
}

const BASE_VOLUMES: Record<Severity, number> = {
  info: 80,
  warning: 40,
  error: 15,
  critical: 5,
};

function simulateBreakdown(config: NoiseConfig, time: Date): SimBreakdown {
  const hour = time.getUTCHours();
  const qh = config.quietHours;
  const qhStart = qh?.start ?? '';
  const qhEnd = qh?.end ?? '';
  const qhStartH = parseInt(qhStart.split(':')[0] ?? '0', 10);
  const qhEndH = parseInt(qhEnd.split(':')[0] ?? '0', 10);
  const inQuietHours = qh !== null && hour >= qhStartH && hour < qhEndH;

  const effectiveMinSeverity = inQuietHours
    ? config.minSeverityDuringQuietHours
    : config.minSeverity;

  const minRank = SEVERITY_RANK[effectiveMinSeverity] ?? 0;

  let total = 0;
  let allowed = 0;
  let blocked = 0;

  const bySeverity = SEVERITY_LABELS.map((severity) => {
    const raw = BASE_VOLUMES[severity];
    const sevRank = SEVERITY_RANK[severity] ?? 0;
    const isBlocked = sevRank < minRank;
    const sevAllowed = isBlocked ? 0 : raw;
    const sevBlocked = isBlocked ? raw : 0;

    total += raw;
    allowed += sevAllowed;
    blocked += sevBlocked;

    return { severity, total: raw, allowed: sevAllowed, blocked: sevBlocked };
  });

  return {
    total,
    allowed,
    blocked,
    bySeverity,
    digestMode: config.dailyDigestMode,
  };
}

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const config = await getNoiseConfig(user.userId);
    const breakdown = simulateBreakdown(config, new Date());
    const allowedPct = breakdown.total > 0 ? Math.round((breakdown.allowed / breakdown.total) * 100) : 100;
    const blockedPct = 100 - allowedPct;

    return Response.json({
      breakdown,
      allowedPct,
      blockedPct,
      dailyEstimate: breakdown.allowed * 3,
    });
  } catch (err) {
    return errorResponse(err);
  }
});
