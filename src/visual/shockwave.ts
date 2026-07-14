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
};

export class ShockwaveSystem {
  private readonly waves: Shock[] = [];
  private reduced = false;

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
      });
    }
  }

  setReducedMotion(value: boolean): void {
    this.reduced = value;
  }

  spawn(kind: "bass" | "mid" | "high", baseR: number): void {
    if (this.reduced && kind === "high") return;
    const w = this.waves.find((q) => !q.alive);
    if (!w) return;
    w.alive = true;
    w.kind = kind;
    w.radius = baseR * (kind === "bass" ? 0.9 : kind === "mid" ? 1.1 : 1.2);
    w.maxRadius = baseR * (kind === "bass" ? 4.5 : kind === "mid" ? 3.5 : 2.5);
    w.width = kind === "bass" ? 12 : kind === "mid" ? 6 : 3;
    w.alpha = kind === "bass" ? 0.85 : kind === "mid" ? 0.6 : 0.45;
    // Speed adjusted to last ~500ms
    w.speed = baseR * (kind === "bass" ? 4.0 : kind === "mid" ? 4.5 : 5.0);
  }

  update(dt: number): void {
    for (const w of this.waves) {
      if (!w.alive) continue;
      w.radius += w.speed * dt;
      const progress = w.radius / w.maxRadius;
      // Decay adjusted for 400-700ms lifespan
      w.alpha *= Math.exp(-dt * (2.5 + progress * 3));
      w.width *= 0.985;
      if (w.radius >= w.maxRadius || w.alpha < 0.02) w.alive = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, _frame: VisualFrame): void {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const w of this.waves) {
      if (!w.alive) continue;
      const a = clamp(w.alpha, 0, 1);
      if (w.kind === "bass") {
        ctx.strokeStyle = `rgba(255, 170, 70, ${a})`;
        ctx.shadowColor = "rgba(255, 140, 40, 0.8)";
        ctx.shadowBlur = 24;
      } else if (w.kind === "mid") {
        ctx.strokeStyle = `rgba(255, 220, 160, ${a})`;
        ctx.shadowColor = "rgba(255, 200, 120, 0.7)";
        ctx.shadowBlur = 14;
      } else {
        ctx.strokeStyle = `rgba(255, 240, 210, ${a * 0.85})`;
        ctx.shadowColor = "rgba(255, 230, 180, 0.5)";
        ctx.shadowBlur = 8;
      }
      ctx.lineWidth = w.width;
      ctx.beginPath();
      ctx.arc(cx, cy, w.radius, 0, Math.PI * 2);
      ctx.stroke();

      // secondary thin echo for bass
      if (w.kind === "bass") {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(255, 236, 200, ${a * 0.35})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, w.radius * 0.92, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
