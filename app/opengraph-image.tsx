import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'CAVEAT · Autonomous Execution Checkpoint';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background:
            'radial-gradient(circle at 8% 0%, rgba(255,21,88,0.35), transparent 55%), radial-gradient(circle at 95% 100%, rgba(199,255,50,0.18), transparent 55%), #07090C',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginBottom: 48,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 6,
              border: '3px solid #FF1558',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: 14, height: 14, borderRadius: 2, background: '#FF1558' }} />
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: 6,
              color: '#EAF3FF',
            }}
          >
            CAVEAT
          </div>
        </div>
        <div
          style={{
            fontSize: 66,
            fontWeight: 800,
            letterSpacing: -2,
            lineHeight: 1.08,
            color: '#EAF3FF',
            maxWidth: 980,
          }}
        >
          Permission can stay valid.
        </div>
        <div
          style={{
            fontSize: 66,
            fontWeight: 800,
            letterSpacing: -2,
            lineHeight: 1.08,
            color: '#FF6B8F',
            maxWidth: 980,
            marginBottom: 36,
          }}
        >
          Intent can change.
        </div>
        <div
          style={{
            fontSize: 26,
            color: '#84909F',
            maxWidth: 880,
            lineHeight: 1.5,
          }}
        >
          A context-aware execution checkpoint for autonomous agents, on GenLayer.
        </div>
      </div>
    ),
    { ...size },
  );
}
