import { ImageResponse } from 'next/og';

export const alt = 'Kestrel — AI Market Intelligence';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
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
        {/* Subtle accent glow */}
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
            gap: 20,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 6,
              background: 'rgba(245, 110, 15, 0.12)',
              border: '1.5px solid rgba(245, 110, 15, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 38,
              fontWeight: 800,
              color: '#F56E0F',
            }}
          >
            K
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span
              style={{
                fontSize: 48,
                fontWeight: 900,
                color: '#F5F5F5',
                letterSpacing: '-0.03em',
              }}
            >
              Kestrel
            </span>
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            display: 'flex',
            fontSize: 28,
            fontWeight: 600,
            color: '#E0E0E0',
            textAlign: 'center',
            marginBottom: 20,
            maxWidth: 800,
          }}
        >
          AI-Powered Trading Copilot for Gold, Forex, and Crypto
        </div>

        {/* Feature Pills */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 12,
          }}
        >
          <div
            style={{
              padding: '8px 18px',
              borderRadius: 4,
              background: '#1A1A1A',
              border: '1px solid #2E2E2E',
              color: '#A0A0A0',
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            Multi-Tenant
          </div>
          <div
            style={{
              padding: '8px 18px',
              borderRadius: 4,
              background: '#1A1A1A',
              border: '1px solid #2E2E2E',
              color: '#A0A0A0',
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            31 AI Market Tools
          </div>
          <div
            style={{
              padding: '8px 18px',
              borderRadius: 4,
              background: '#1A1A1A',
              border: '1px solid #2E2E2E',
              color: '#A0A0A0',
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            Mastra Workflows
          </div>
          <div
            style={{
              padding: '8px 18px',
              borderRadius: 4,
              background: 'rgba(245, 110, 15, 0.1)',
              border: '1px solid rgba(245, 110, 15, 0.3)',
              color: '#F56E0F',
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            BYOK Engine
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
