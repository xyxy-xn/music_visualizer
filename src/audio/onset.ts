export type BandName = "bass" | "lowMid" | "mid" | "high";

export type OnsetState = {
  bass: boolean;
  lowMid: boolean;
  mid: boolean;
  high: boolean;
  bassPulse: number;
  lowMidPulse: number;
  midPulse: number;
  highPulse: number;
  beatPulse: number;
};

type BandTracker = {
  prev: number;
  mean: number;
  variance: number;
  lastOnset: number;
  pulse: number;
};

const COOLDOWN_MS: Record<BandName, number> = {
  bass: 120,
  lowMid: 100,
  mid: 80,
  high: 50,
};

const DECAY: Record<BandName, number> = {
  bass: 3.2,
  lowMid: 3.8,
  mid: 4.2,
  high: 5.5,
};

function createTracker(): BandTracker {
  return { prev: 0, mean: 0.02, variance: 0.0004, lastOnset: -1e9, pulse: 0 };
}

export class OnsetDetector {
  private sensitivity = 1;
  private readonly bands: Record<BandName, BandTracker> = {
    bass: createTracker(),
    lowMid: createTracker(),
    mid: createTracker(),
    high: createTracker(),
  };
  private beatPulse = 0;

  setSensitivity(value: number): void {
    this.sensitivity = Math.max(0.5, Math.min(2, value));
  }

  update(
    energies: { bass: number; lowMid: number; mid: number; high: number },
    nowMs: number,
    dt: number,
  ): OnsetState {
    const bass = this.step("bass", energies.bass, nowMs, dt);
    const lowMid = this.step("lowMid", energies.lowMid, nowMs, dt);
    const mid = this.step("mid", energies.mid, nowMs, dt);
    const high = this.step("high", energies.high, nowMs, dt);

    if (bass.fired || lowMid.fired || mid.fired) {
      this.beatPulse = Math.min(1, this.beatPulse + (bass.fired ? 0.85 : 0.45));
    }
    this.beatPulse = Math.max(0, this.beatPulse - dt * 3.4);

    return {
      bass: bass.fired,
      lowMid: lowMid.fired,
      mid: mid.fired,
      high: high.fired,
      bassPulse: this.bands.bass.pulse,
      lowMidPulse: this.bands.lowMid.pulse,
      midPulse: this.bands.mid.pulse,
      highPulse: this.bands.high.pulse,
      beatPulse: this.beatPulse,
    };
  }

  private step(
    name: BandName,
    energy: number,
    nowMs: number,
    dt: number,
  ): { fired: boolean } {
    const t = this.bands[name];
    const flux = Math.max(0, energy - t.prev);
    t.prev = energy;

    const alpha = 0.08;
    const delta = flux - t.mean;
    t.mean += alpha * delta;
    t.variance = Math.max(1e-6, (1 - alpha) * (t.variance + alpha * delta * delta));
    const std = Math.sqrt(t.variance);

    // Higher sensitivity → lower threshold multiplier
    const k = 2.35 / this.sensitivity;
    const threshold = t.mean + k * std + 0.012 / this.sensitivity;
    const cooled = nowMs - t.lastOnset >= COOLDOWN_MS[name];
    const fired = cooled && flux > threshold && energy > 0.04;

    if (fired) {
      t.lastOnset = nowMs;
      t.pulse = 1;
    } else {
      t.pulse = Math.max(0, t.pulse - dt * DECAY[name]);
    }

    return { fired };
  }
}
