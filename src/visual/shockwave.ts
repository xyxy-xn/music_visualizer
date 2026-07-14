import type { VisualFrame } from "./types";
import { clamp } from "./types";

type Shock = {
  alive: boolean;
  radius: number;
  maxRadius: number;
  width: number;
  alpha: number;
  speed: number;
  kind: "bass" | "mid" | "high";
  crossedWave: boolean;
};

export class ShockwaveSystem {
  private readonly waves: Shock[] = [];
  private reduced = false;
  private waveBoost = 0;

  constructor(capacity = 24) {
    for (let i = 0; i < capacity; i++) {
      this.waves.push({
        alive: false,
        radius: 0,
        maxRadius: 0,
        width: 2,
        alpha: 0,
        speed: 0,
        kind: "bass",
        crossedWave: false,
      });
    }
  }

  setReducedMotion(value: boolean): void {
    this.reduced = value;
  }

  getWaveBoost(): number {
    return this.waveBoost;
  }

  /** Only bass gets fullscreen shockwaves (P1 §2.1) */
  spawn(kind: "bass" | "mid" | "high", baseR: number): void {
    if (kind !== "bass") return;
    if (this.reduced) return;
    const w = this.waves.find((q) => !q.alive);
    if (!w) return;
    w.alive = true;
    w.kind = "bass";
    w.radius = baseR * 0.9;
    w.maxRadius = baseR * 4.5;
    w.width = 12;
    w.alpha = 0.85;
    w.speed = baseR * 5.5;
    w.crossedWave = false;
  }

  update(dt: number, waveBase: number): void {
    this.waveBoost = Math.max(0, this.waveBoost - dt * 4.5);

    for (const w of this.waves) {
      if (!w.alive) continue;
      // Ease-out: fast start, decelerate (P0 §4.1)
      w.radius += w.speed * dt;
      w.speed *= Math.exp(-dt * 1.8);

      const progress = w.radius / w.maxRadius;
      w.alpha *= Math.exp(-dt * (2.2 + progress * 2.5));
      w.width *= 0.985;

      // Layer interaction: pulse spectrum when shock crosses the ring (P3 §5.2)
      if (!w.crossedWave && Math.abs(w.radius - waveBase) < 22) {
        w.crossedWave = true;
        this.waveBoost = Math.min(1, this.waveBoost + 0.55);
      }

      if (w.radius >= w.maxRadius || w.alpha < 0.02 || w.speed < 4) w.alive = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, _frame: VisualFrame): void {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const w of this.waves) {
      if (!w.alive) continue;
      const a = clamp(w.alpha, 0, 0.85);
      ctx.strokeStyle = `rgba(62, 207, 122, ${a})`;
      ctx.shadowColor = "rgba(46, 180, 90, 0.7)";
      ctx.shadowBlur = 20;
      ctx.lineWidth = w.width;
      ctx.beginPath();
      ctx.arc(cx, cy, w.radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(232, 212, 74, ${a * 0.35})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy, w.radius * 0.92, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
