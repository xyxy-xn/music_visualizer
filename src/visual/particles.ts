import type { VisualFrame } from "./types";
import { clamp } from "./types";

type ParticleKind = "dust" | "spark" | "ember" | "streak";

type Particle = {
  alive: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  glow: number;
  spin: number;
};

export class ParticleSystem {
  private readonly pool: Particle[] = [];
  private reduced = false;
  private emitAcc = 0;
  private sparkAcc = 0;

  constructor(capacity = 2200) {
    for (let i = 0; i < capacity; i++) {
      this.pool.push({
        alive: false,
        kind: "dust",
        x: 0,
        y: 0,
        px: 0,
        py: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        hue: 0,
        glow: 1,
        spin: 0,
      });
    }
  }

  setReducedMotion(value: boolean): void {
    this.reduced = value;
  }

  private acquire(): Particle | null {
    return this.pool.find((q) => !q.alive) ?? null;
  }

  private spawn(
    cx: number,
    cy: number,
    baseR: number,
    kind: ParticleKind,
    speed: number,
    size: number,
    life: number,
    spread = Math.PI * 2,
    angle0 = Math.random() * Math.PI * 2,
  ): void {
    const p = this.acquire();
    if (!p) return;
    const a = angle0 + (Math.random() - 0.5) * spread;
    const r0 =
      kind === "dust"
        ? baseR * (0.85 + Math.random() * 0.45)
        : kind === "ember"
          ? baseR * (0.95 + Math.random() * 0.2)
          : baseR * (1.05 + Math.random() * 0.35);
    p.alive = true;
    p.kind = kind;
    p.x = cx + Math.cos(a) * r0;
    p.y = cy + Math.sin(a) * r0;
    p.px = p.x;
    p.py = p.y;
    const s = speed * (0.65 + Math.random() * 0.7);
    const tx = -Math.sin(a);
    const ty = Math.cos(a);
    const tangential =
      kind === "streak" ? 0.55 : kind === "spark" ? 0.35 : kind === "ember" ? 0.2 : 0.28;
    p.vx = Math.cos(a) * s + tx * s * tangential;
    p.vy = Math.sin(a) * s + ty * s * tangential;
    p.maxLife = life;
    p.life = life;
    p.size = size;
    p.hue = Math.random();
    p.glow = kind === "ember" ? 1.5 : kind === "spark" ? 1.25 : kind === "streak" ? 1.05 : 0.75;
    p.spin = (Math.random() - 0.5) * (kind === "streak" ? 8 : 3);
  }

  update(cx: number, cy: number, baseR: number, frame: VisualFrame): void {
    const { bass, mid, high, bassPulse, midPulse, highPulse, beatPulse, dt } = frame;
    const rateMul = this.reduced ? 0.22 : 1;

    // Sparse dust (P1 §2.2): half rate, shorter life, faster
    this.emitAcc += (1 + mid * 7 + high * 4 + bass * 2) * rateMul * dt;
    while (this.emitAcc >= 1) {
      this.emitAcc -= 1;
      const roll = Math.random();
      if (roll < 0.65) {
        this.spawn(
          cx,
          cy,
          baseR * 1.15,
          "dust",
          35 + mid * 55,
          0.7 + Math.random() * 0.8,
          0.5 + Math.random() * 0.45,
        );
      } else {
        this.spawn(
          cx,
          cy,
          baseR * 1.1,
          "ember",
          30 + bass * 50,
          1.2 + Math.random() * 1.6,
          0.55 + Math.random() * 0.5,
        );
      }
    }

    this.sparkAcc += (high * 12 + highPulse * 70) * rateMul * dt;
    while (this.sparkAcc >= 1) {
      this.sparkAcc -= 1;
      const isStreak = Math.random() < 0.3;
      this.spawn(
        cx,
        cy,
        baseR * (1.2 + Math.random() * 0.5),
        isStreak ? "streak" : "spark",
        110 + high * 220,
        0.7 + Math.random() * 1.2,
        0.25 + Math.random() * 0.3,
        isStreak ? Math.PI * 2 : Math.PI * 0.35,
        Math.random() * Math.PI * 2,
      );
    }

    for (const p of this.pool) {
      if (!p.alive) continue;
      p.px = p.x;
      p.py = p.y;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const tx = -dy / dist;
      const ty = dx / dist;
      const nx = dx / dist;
      const ny = dy / dist;

      const swirl =
        (p.kind === "dust" ? 18 : p.kind === "ember" ? 12 : 28) +
        mid * 40 +
        bass * 10 +
        bassPulse * 22;
      const outward = (10 + high * 22 + beatPulse * 28) * (p.kind === "streak" ? 1.4 : 1);
      p.vx += tx * swirl * dt + nx * outward * dt + (Math.random() - 0.5) * high * 35 * dt;
      p.vy += ty * swirl * dt + ny * outward * dt + (Math.random() - 0.5) * high * 35 * dt;

      const curl = Math.sin(dist * 0.02 + frame.time * 2 + p.hue * 6) * (10 + mid * 16);
      p.vx += -ny * curl * dt * 0.15;
      p.vy += nx * curl * dt * 0.15;

      const drag =
        p.kind === "streak"
          ? 0.984
          : p.kind === "spark"
            ? 0.986
            : 0.991 - midPulse * 0.002 - highPulse * 0.001;
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.size *= p.kind === "ember" ? 0.996 : 0.998;
      if (p.life <= 0 || dist > baseR * 7.5) p.alive = false;
    }
  }

  burst(
    cx: number,
    cy: number,
    baseR: number,
    kind: "bass" | "mid" | "high",
    intensity = 1,
  ): void {
    const scale = clamp(intensity, 0.25, 1.2);
    const count = this.reduced
      ? kind === "bass"
        ? Math.floor(18 * scale)
        : 10
      : kind === "bass"
        ? Math.floor((28 + 55 * scale))
        : kind === "mid"
          ? Math.floor(22 * scale)
          : Math.floor(16 * scale);

    for (let i = 0; i < count; i++) {
      if (kind === "bass") {
        const roll = Math.random();
        if (roll < 0.45) {
          this.spawn(
            cx,
            cy,
            baseR,
            "ember",
            120 + Math.random() * 180,
            2 + Math.random() * 3,
            0.45 + Math.random() * 0.4,
          );
        } else if (roll < 0.8) {
          this.spawn(
            cx,
            cy,
            baseR * 1.1,
            "dust",
            100 + Math.random() * 150,
            1.2 + Math.random() * 1.6,
            0.4 + Math.random() * 0.4,
          );
        } else {
          this.spawn(
            cx,
            cy,
            baseR * 1.15,
            "streak",
            180 + Math.random() * 200,
            1.6 + Math.random() * 1.6,
            0.3 + Math.random() * 0.25,
          );
        }
      } else if (kind === "mid") {
        this.spawn(
          cx,
          cy,
          baseR * 1.2,
          Math.random() < 0.5 ? "spark" : "dust",
          120 + Math.random() * 140,
          1.1 + Math.random() * 1.5,
          0.35 + Math.random() * 0.35,
        );
      } else {
        this.spawn(
          cx,
          cy,
          baseR * 1.3,
          Math.random() < 0.6 ? "spark" : "streak",
          160 + Math.random() * 220,
          0.8 + Math.random() * 1.2,
          0.22 + Math.random() * 0.28,
        );
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const p of this.pool) {
      if (!p.alive) continue;
      const t = clamp(p.life / p.maxLife, 0, 1);
      const alpha = clamp(t * (p.kind === "dust" ? 0.55 : 0.85), 0, 0.85);
      const warm = p.hue < 0.62;
      let r: number;
      let g: number;
      let b: number;

      if (p.kind === "spark" || p.kind === "streak") {
        // Yellow accent for high-frequency sparks
        r = 220 + p.hue * 35;
        g = 210 + p.hue * 30;
        b = 60 + p.hue * 40;
      } else {
        // Green primary for dust / ember
        r = warm ? 40 + p.hue * 50 : 90;
        g = warm ? 180 + p.hue * 50 : 230;
        b = warm ? 70 + p.hue * 40 : 120;
      }

      if (p.kind === "streak" || p.kind === "spark") {
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`;
        ctx.lineWidth = Math.max(0.5, p.size * 0.4 * t);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }

      const radius = p.size * (0.55 + t * 0.85) * (p.kind === "ember" ? 1.2 : 1);

      // Glow alpha capped to avoid white clipping (P1 §3.2)
      if (p.glow > 1 || p.kind === "ember") {
        const glowA = clamp(alpha * 0.35 * p.glow, 0, 0.55);
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 2.8);
        grd.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${glowA})`);
        grd.addColorStop(0.4, `rgba(${Math.floor(r * 0.5)}, ${g}, ${Math.floor(b * 0.4)}, ${glowA * 0.35})`);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 2.8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = `rgba(${r}, ${Math.min(255, g + 20)}, ${Math.min(220, b + 30)}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();

      if (p.kind !== "dust") {
        ctx.fillStyle =
          p.kind === "spark" || p.kind === "streak"
            ? `rgba(255, 245, 180, ${alpha * 0.8})`
            : `rgba(200, 255, 210, ${alpha * 0.75})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.35, radius * 0.32), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
