import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'HamaFX-Ai Analysis';
export const size = { width: 1200, height: 630 };

export default async function OGImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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
          background: 'linear-gradient(135deg, #0A0A0A 0%, #141414 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'rgba(250, 250, 250, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              color: '#F0F0F0',
            }}
          >
            ✦
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span style={{ fontSize: 36, fontWeight: 700, color: '#F0F0F0', letterSpacing: '-0.02em' }}>
              HamaFX·Ai
            </span>
            <span style={{ fontSize: 20, color: '#808080', marginTop: 4 }}>
              AI Trading Analysis
            </span>
          </div>
        </div>
        <div
          style={{
            fontSize: 18,
            color: '#666',
            textAlign: 'center',
            maxWidth: 600,
            lineHeight: 1.5,
          }}
        >
          Shared analysis · {id.slice(0, 8)}
        </div>
      </div>
    ),
    { ...size },
  );
}
