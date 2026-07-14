import type { VisualFrame } from "./types";
import { clamp, lerp } from "./types";

const BINS = 256;
const smoothData = new Float32Array(BINS);
const trailData = new Float32Array(BINS);

function sampleSpectrum(
  frequency: Uint8Array,
  bins: number,
  target: Float32Array,
  lerpT: number,
): void {
  const n = Math.floor(frequency.length * 0.75); // Ignore highest 25% which is mostly noise
  for (let i = 0; i < bins; i++) {
    const t = i / bins;
    // Map angle to frequency: bottom (t=0.5) is low freq, top (t=0 or 1) is high freq
    const distFromBottom = Math.abs(t - 0.5) * 2; // 0 at bottom, 1 at top
    
    // Non-linear mapping for frequency index (more bins for low/mid frequencies)
    const freqT = Math.pow(distFromBottom, 1.5); 
    const centerIdx = Math.floor(freqT * (n - 1));
    
    // Neighborhood sampling
    let sum = 0;
    let count = 0;
    const window = Math.max(1, Math.floor(freqT * 4)); // Wider window for high frequencies
    for (let j = Math.max(0, centerIdx - window); j <= Math.min(n - 1, centerIdx + window); j++) {
      sum += frequency[j];
      count++;
    }
    
    // Non-linear amplitude mapping: boost weak signals, compress strong ones
    const raw = (sum / count) / 255;
    const mapped = Math.pow(raw, 0.65); 
    
    target[i] = lerp(target[i], mapped, lerpT);
  }
  
  // Neighborhood smoothing to eliminate sharp peaks
  const temp = new Float32Array(bins);
  for (let i = 0; i < bins; i++) {
    const prev2 = target[(i - 2 + bins) % bins];
    const prev1 = target[(i - 1 + bins) % bins];
    const cur = target[i];
    const next1 = target[(i + 1) % bins];
    const next2 = target[(i + 2) % bins];
    temp[i] = prev2 * 0.1 + prev1 * 0.2 + cur * 0.4 + next1 * 0.2 + next2 * 0.1;
  }
  for (let i = 0; i < bins; i++) {
    target[i] = temp[i];
  }
}

function radiusAt(
  smoothed: Float32Array,
  idx: number,
  bins: number,
  base: number,
  amp: number,
  detail: number,
  time: number,
  spin: number,
): number {
  const v = smoothed[idx];
  const a = (idx / bins) * Math.PI * 2 - Math.PI / 2 + spin;
  // Asymmetric wobble
  const wobble =
    Math.sin(a * 3 + time * 1.1) * 0.015 +
    Math.sin(a * 7 - time * 0.7) * 0.01 +
    Math.sin(a * 13 + time * 1.6) * 0.005 * detail;
  return base + v * amp + base * wobble * (0.5 + detail);
}

function traceRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  smoothed: Float32Array,
  bins: number,
  base: number,
  amp: number,
  detail: number,
  time: number,
  spin: number,
  close: boolean,
): void {
  ctx.beginPath();
  for (let i = 0; i <= bins; i++) {
    const idx = i % bins;
    const a = (idx / bins) * Math.PI * 2 - Math.PI / 2 + spin;
    const r = radiusAt(smoothed, idx, bins, base, amp, detail, time, spin);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  if (close) ctx.closePath();
}

export function drawCircularWaveform(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  baseR: number,
  frame: VisualFrame,
): void {
  const { frequency, bass, lowMid, mid, high, beatPulse, time, dt } = frame;

  sampleSpectrum(frequency, BINS, smoothData, 0.4);
  
  // Update trail data (delayed afterimage)
  for (let i = 0; i < BINS; i++) {
    trailData[i] = Math.max(smoothData[i], trailData[i] - dt * 1.5);
  }

  const waveBase = baseR * (1.9 + bass * 0.08 + beatPulse * 0.03);
  const waveAmp = waveBase * (0.35 + lowMid * 0.2 + beatPulse * 0.1);

  const spin = time * 0.05;

  // Soft fill under wave
  traceRing(ctx, cx, cy, smoothData, BINS, waveBase, waveAmp, mid + bass, time, spin, true);
  const fill = ctx.createRadialGradient(cx, cy, waveBase * 0.6, cx, cy, waveBase + waveAmp);
  fill.addColorStop(0, "rgba(200, 121, 46, 0.0)");
  fill.addColorStop(0.6, `rgba(232, 184, 106, ${0.05 + lowMid * 0.08})`);
  fill.addColorStop(1, `rgba(255, 170, 70, ${0.03 + beatPulse * 0.06})`);
  ctx.fillStyle = fill;
  ctx.fill();

  // Outer delayed trail (energy stickiness)
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  traceRing(ctx, cx, cy, trailData, BINS, waveBase * 1.02, waveAmp * 1.05, mid, time, spin, true);
  ctx.strokeStyle = `rgba(255, 100, 50, ${clamp(0.15 + beatPulse * 0.2, 0, 0.5)})`;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = "rgba(255, 100, 50, 0.5)";
  ctx.shadowBlur = 12;
  ctx.stroke();

  // Main bright stroke
  traceRing(ctx, cx, cy, smoothData, BINS, waveBase, waveAmp, mid + bass, time, spin, true);
  ctx.strokeStyle = `rgba(255, 216, 154, ${clamp(0.4 + mid * 0.4 + beatPulse * 0.3, 0, 0.85)})`;
  ctx.lineWidth = 2 + high * 1.5 + beatPulse * 1.5;
  ctx.shadowColor = "rgba(255, 170, 60, 0.6)";
  ctx.shadowBlur = 16 + beatPulse * 20;
  ctx.stroke();
  ctx.restore();

  // Radial spectrum ticks — denser irregular teeth (only on bottom half where low/mid is)
  const teeth = 120;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < teeth; i++) {
    const t = i / teeth;
    const fi = Math.floor(t * (BINS - 1));
    const energy = smoothData[fi];
    if (energy < 0.08) continue;
    const a = t * Math.PI * 2 - Math.PI / 2 + spin;
    const len = energy * waveAmp * (0.4 + (i % 3) * 0.15);
    const r0 = waveBase - 4;
    const r1 = r0 + len;
    
    // Color based on position (bottom = warm, top = cool)
    const isTop = Math.abs(t - 0.5) > 0.3;
    const color = isTop 
      ? `rgba(200, 230, 255, ${0.1 + energy * 0.4})` 
      : `rgba(255, 180, 80, ${0.1 + energy * 0.5})`;

    ctx.strokeStyle = color;
    ctx.lineWidth = i % 4 === 0 ? 1.6 : 0.8;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();

  // Inner time-domain shimmer
  const { waveform } = frame;
  const steps = 128;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wi = Math.floor(t * (waveform.length - 1));
    const sample = (waveform[wi] - 128) / 128;
    const a = t * Math.PI * 2 - Math.PI / 2;
    const r = baseR * 1.05 + sample * baseR * (0.1 + bass * 0.12);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = `rgba(243, 230, 208, ${0.14 + bass * 0.25})`;
  ctx.lineWidth = 1.1;
  ctx.stroke();
}
