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
  const n = Math.floor(frequency.length * 0.75);
  for (let i = 0; i < bins; i++) {
    const t = i / bins;
    // Left-right mirrored mapping (P0 §1.1): bottom=low, top=high, both sides symmetric
    const mirrored = t < 0.5 ? t * 2 : (1 - t) * 2; // 0..1..0
    const freqT = Math.pow(1 - mirrored, 1.5); // bottom=0 (low), top=1 (high)
    const centerIdx = Math.floor(freqT * (n - 1));

    let sum = 0;
    let count = 0;
    const window = Math.max(1, Math.floor((1 - freqT) * 3) + 1);
    for (let j = Math.max(0, centerIdx - window); j <= Math.min(n - 1, centerIdx + window); j++) {
      sum += frequency[j];
      count++;
    }

    const raw = sum / (count * 255);
    const mapped = Math.pow(raw, 0.65);
    // 70% audio + 30% soft asymmetry so it isn't a perfect oscilloscope
    const asym = 0.97 + 0.03 * Math.sin(t * Math.PI * 4 + freqT * 2);
    target[i] = lerp(target[i], mapped * asym, lerpT);
  }

  const temp = new Float32Array(bins);
  for (let i = 0; i < bins; i++) {
    const prev2 = target[(i - 2 + bins) % bins];
    const prev1 = target[(i - 1 + bins) % bins];
    const cur = target[i];
    const next1 = target[(i + 1) % bins];
    const next2 = target[(i + 2) % bins];
    temp[i] = prev2 * 0.1 + prev1 * 0.2 + cur * 0.4 + next1 * 0.2 + next2 * 0.1;
  }
  for (let i = 0; i < bins; i++) target[i] = temp[i];
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
  const wobble =
    Math.sin(a * 3 + time * 1.1) * 0.012 +
    Math.sin(a * 7 - time * 0.7) * 0.008 +
    Math.sin(a * 13 + time * 1.6) * 0.004 * detail;
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

/** Frequency weight at angle t: 0=low(bottom), 1=high(top) — for cool/warm color language */
function freqWeightAt(t: number): number {
  const mirrored = t < 0.5 ? t * 2 : (1 - t) * 2;
  return 1 - mirrored;
}

export function drawCircularWaveform(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  baseR: number,
  frame: VisualFrame,
): number {
  const {
    frequency,
    bass,
    lowMid,
    mid,
    high,
    beatPulse,
    bassPulse,
    highPulse,
    midRipple,
    waveBoost,
    time,
    dt,
  } = frame;

  sampleSpectrum(frequency, BINS, smoothData, 0.4);

  for (let i = 0; i < BINS; i++) {
    trailData[i] = Math.max(smoothData[i], trailData[i] - dt * 1.2);
  }

  const waveBase = baseR * (1.9 + bass * 0.08 + beatPulse * 0.03);
  const waveAmp = waveBase * (0.32 + lowMid * 0.18 + beatPulse * 0.08 + midRipple * 0.06);

  // Spin modulated by lowMid (P2 §4.4)
  const spin = time * (0.04 * (1 + lowMid * 0.6));

  // Focus mutual exclusion (P1 §1.2): outer ring yields to core on bass, takes lead on high
  const waveFocus = clamp(1 + highPulse * 0.35 - bassPulse * 0.25, 0.55, 1.35);
  const boost = 1 + waveBoost * 0.35;

  traceRing(ctx, cx, cy, smoothData, BINS, waveBase, waveAmp, mid + bass, time, spin, true);
  const fill = ctx.createRadialGradient(cx, cy, waveBase * 0.6, cx, cy, waveBase + waveAmp);
  fill.addColorStop(0, "rgba(30, 120, 60, 0.0)");
  fill.addColorStop(0.6, `rgba(62, 207, 122, ${(0.04 + lowMid * 0.06) * waveFocus})`);
  fill.addColorStop(1, `rgba(232, 212, 74, ${(0.025 + beatPulse * 0.05) * waveFocus})`);
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Delayed trail — yellow accent on beat residue
  traceRing(ctx, cx, cy, trailData, BINS, waveBase * 1.02, waveAmp * 1.05, mid, time, spin, true);
  ctx.strokeStyle = `rgba(232, 212, 74, ${clamp((0.12 + beatPulse * 0.15) * waveFocus, 0, 0.4)})`;
  ctx.lineWidth = 1.4;
  ctx.shadowColor = "rgba(232, 212, 74, 0.35)";
  ctx.shadowBlur = 10;
  ctx.stroke();

  // Main stroke — green primary
  traceRing(ctx, cx, cy, smoothData, BINS, waveBase, waveAmp, mid + bass, time, spin, true);
  const mainA = clamp((0.35 + mid * 0.3 + beatPulse * 0.2 + midRipple * 0.15) * waveFocus * boost, 0, 0.78);
  ctx.strokeStyle = `rgba(122, 239, 176, ${mainA})`;
  ctx.lineWidth = 2 + high * 1.2 + beatPulse + midRipple * 0.8;
  ctx.shadowColor = "rgba(62, 207, 122, 0.5)";
  ctx.shadowBlur = clamp(12 + beatPulse * 14, 0, 28);
  ctx.stroke();
  ctx.restore();

  // Teeth: yellow = high energy accent, green = low/mid body
  const teeth = 96;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < teeth; i++) {
    const t = i / teeth;
    const fi = Math.floor(t * (BINS - 1));
    const energy = smoothData[fi];
    if (energy < 0.08) continue;
    const a = t * Math.PI * 2 - Math.PI / 2 + spin;
    const len = energy * waveAmp * (0.35 + (i % 3) * 0.12);
    const r0 = waveBase - 4;
    const r1 = r0 + len;
    const fw = freqWeightAt(t);
    const yellow = fw > 0.55 && energy > 0.12;
    const color = yellow
      ? `rgba(255, 230, 100, ${clamp(0.08 + energy * 0.35 * high, 0, 0.45)})`
      : `rgba(80, 220, 130, ${clamp(0.08 + energy * 0.4, 0, 0.5)})`;
    ctx.strokeStyle = color;
    ctx.lineWidth = i % 4 === 0 ? 1.4 : 0.7;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();

  // Soft inner shimmer
  const { waveform } = frame;
  const steps = 96;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wi = Math.floor(t * (waveform.length - 1));
    const sample = (waveform[wi] - 128) / 128;
    const a = t * Math.PI * 2 - Math.PI / 2;
    const r = baseR * 1.05 + sample * baseR * (0.08 + bass * 0.1);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = `rgba(216, 245, 224, ${clamp(0.1 + bass * 0.18, 0, 0.35)})`;
  ctx.lineWidth = 1;
  ctx.stroke();

  return waveBase;
}
