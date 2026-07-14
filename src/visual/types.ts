export type VisualFrame = {
  bass: number;
  lowMid: number;
  mid: number;
  high: number;
  overall: number;
  rms: number;
  bassPulse: number;
  lowMidPulse: number;
  midPulse: number;
  highPulse: number;
  beatPulse: number;
  /** Shockwave crossing the spectrum ring */
  waveBoost: number;
  /** Mid onset local ripple on the ring */
  midRipple: number;
  frequency: Uint8Array;
  waveform: Uint8Array;
  time: number;
  dt: number;
};

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function attackRelease(current: number, target: number, attackMs: number, releaseMs: number, dt: number): number {
  const diff = target - current;
  const timeConst = diff > 0 ? attackMs : releaseMs;
  if (timeConst <= 0) return target;
  // dt is in seconds, timeConst is in ms
  const alpha = 1 - Math.exp(-(dt * 1000) / timeConst);
  return current + diff * alpha;
}
