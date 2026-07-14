/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// High-density canvas sparkline — microscopic industrial ticker chart.
// Renders a strict 1px solid line with no gradient fills underneath.
// Dimensions: 64px × 24px.
//
// Colors are passed via `tone`:
//   'bull'   → --color-bull   (positive)
//   'bear'   → --color-bear   (negative)
//   'neutral' → --color-neutral (flat)

'use client';

import { useEffect, useRef } from 'react';

interface SparklineCanvasProps {
  values: readonly number[];
  tone: 'bull' | 'bear' | 'neutral';
  /** Optional accessible label. */
  label?: string;
}

const W = 64;
const H = 24;
const PAD = 2; // pixel padding so the line never clips the canvas edge
const STROKE = 1;

const TONE_HEX: Record<SparklineCanvasProps['tone'], string> = {
  bull: '#22C55E',
  bear: '#EF4444',
  neutral: '#71717A',
};

export function SparklineCanvas({ values, tone, label }: SparklineCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // HiDPI support
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, W, H);

    if (values.length < 2) return;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const drawW = W - PAD * 2;
    const drawH = H - PAD * 2;

    ctx.beginPath();
    ctx.strokeStyle = TONE_HEX[tone];
    ctx.lineWidth = STROKE;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';

    for (let i = 0; i < values.length; i++) {
      const v = values[i]!;
      const x = PAD + (i / (values.length - 1)) * drawW;
      const y = PAD + drawH - ((v - min) / range) * drawH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.stroke();
  }, [values, tone]);

  return (
    <canvas
      ref={ref}
      className="inline-block shrink-0"
      style={{ width: W, height: H }}
      width={W}
      height={H}
      role="img"
      aria-label={label ?? 'Sparkline'}
    />
  );
}
