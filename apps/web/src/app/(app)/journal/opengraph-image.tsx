import { ImageResponse } from 'next/og';

export const alt = 'Kestrel Trading Journal & Analytics';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(145deg, #0A0A0A 0%, #121212 50%, #171717 100%)',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          position: 'relative',
        }}
      >
        {/* Accent Glow */}
        <div
          style={{
            position: 'absolute',
            top: -100,
            left: -100,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(245, 110, 15, 0.15) 0%, rgba(245, 110, 15, 0) 70%)',
          }}
        />

        {/* Brand header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 6,
              background: 'rgba(245, 110, 15, 0.12)',
              border: '1.5px solid rgba(245, 110, 15, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30,
              fontWeight: 800,
              color: '#F56E0F',
            }}
          >
            K
          </div>
          <span
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: '#A0A0A0',
              letterSpacing: '-0.02em',
            }}
          >
            Kestrel Analytics
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            display: 'flex',
            fontSize: 64,
            fontWeight: 900,
            color: '#FFFFFF',
            letterSpacing: '-0.03em',
            marginBottom: 16,
          }}
        >
          Trading Journal & Edge
        </div>

        {/* Subtitle */}
        <div
          style={{
            display: 'flex',
            fontSize: 24,
            fontWeight: 500,
            color: '#8E8E8E',
            textAlign: 'center',
            marginBottom: 28,
            maxWidth: 800,
          }}
        >
          Execution tracking, R-multiple distribution, AI post-trade debriefs & equity curves
        </div>

        {/* Badges */}
        <div
          style={{
            display: 'flex',
            gap: 12,
          }}
        >
          <div
            style={{
              padding: '6px 16px',
              borderRadius: 4,
              background: '#1A1A1A',
              border: '1px solid #2E2E2E',
              color: '#A0A0A0',
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            R-Multiple Stats
          </div>
          <div
            style={{
              padding: '6px 16px',
              borderRadius: 4,
              background: '#1A1A1A',
              border: '1px solid #2E2E2E',
              color: '#A0A0A0',
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            AI Trade Review
          </div>
          <div
            style={{
              padding: '6px 16px',
              borderRadius: 4,
              background: 'rgba(245, 110, 15, 0.1)',
              border: '1px solid rgba(245, 110, 15, 0.3)',
              color: '#F56E0F',
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            Win Rate & Profit Factor
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
