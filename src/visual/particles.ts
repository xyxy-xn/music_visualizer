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

  constructor(capacity = 2800) {
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
    p.glow = kind === "ember" ? 1.8 : kind === "spark" ? 1.4 : kind === "streak" ? 1.1 : 0.85;
    p.spin = (Math.random() - 0.5) * (kind === "streak" ? 8 : 3);
  }

  update(cx: number, cy: number, baseR: number, frame: VisualFrame): void {
    const { bass, mid, high, bassPulse, midPulse, highPulse, beatPulse, dt } = frame;
    const rateMul = this.reduced ? 0.22 : 1;

    // Continuous mixed emission (reduced for less always-on)
    this.emitAcc += (2 + mid * 15 + high * 10 + bass * 5) * rateMul * dt;
    while (this.emitAcc >= 1) {
      this.emitAcc -= 1;
      const roll = Math.random();
      if (roll < 0.6) {
        this.spawn(
          cx,
          cy,
          baseR * 1.15,
          "dust",
          20 + mid * 40,
          0.8 + Math.random(),
          0.8 + Math.random() * 1.1,
        );
      } else {
        this.spawn(
          cx,
          cy,
          baseR * 1.1,
          "ember",
          20 + bass * 40,
          1.5 + Math.random() * 2,
          1.0 + Math.random() * 0.9,
        );
      }
    }

    // Extra high-frequency glitter (transients)
    this.sparkAcc += (high * 15 + highPulse * 80) * rateMul * dt;
    while (this.sparkAcc >= 1) {
      this.sparkAcc -= 1;
      const isStreak = Math.random() < 0.3;
      this.spawn(
        cx,
        cy,
        baseR * (1.2 + Math.random() * 0.5),
        isStreak ? "streak" : "spark",
        90 + high * 200,
        0.8 + Math.random() * 1.4,
        0.3 + Math.random() * 0.4,
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
        (p.kind === "dust" ? 22 : p.kind === "ember" ? 14 : 30) +
        mid * 50 +
        bass * 12 +
        bassPulse * 28;
      const outward = (8 + high * 20 + beatPulse * 30) * (p.kind === "streak" ? 1.4 : 1);
      p.vx += tx * swirl * dt + nx * outward * dt + (Math.random() - 0.5) * high * 40 * dt;
      p.vy += ty * swirl * dt + ny * outward * dt + (Math.random() - 0.5) * high * 40 * dt;

      // micro curl noise
      const curl = Math.sin(dist * 0.02 + frame.time * 2 + p.hue * 6) * (12 + mid * 20);
      p.vx += (-ny) * curl * dt * 0.15;
      p.vy += nx * curl * dt * 0.15;

      const drag =
        p.kind === "streak"
          ? 0.985
          : p.kind === "spark"
            ? 0.988
            : 0.993 - midPulse * 0.002 - highPulse * 0.001;
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.size *= p.kind === "ember" ? 0.997 : 0.9985;
      if (p.life <= 0 || dist > baseR * 7.5) p.alive = false;
    }
  }

  burst(cx: number, cy: number, baseR: number, kind: "bass" | "mid" | "high"): void {
    const count = this.reduced
      ? kind === "bass"
        ? 28
        : 14
      : kind === "bass"
        ? 90
        : kind === "mid"
          ? 60
          : 48;

    for (let i = 0; i < count; i++) {
      if (kind === "bass") {
        const roll = Math.random();
        if (roll < 0.45) {
          this.spawn(cx, cy, baseR * 1.0, "ember", 100 + Math.random() * 160, 2.5 + Math.random() * 3.5, 1.0 + Math.random() * 0.7);
        } else if (roll < 0.8) {
          this.spawn(cx, cy, baseR * 1.1, "dust", 80 + Math.random() * 140, 1.5 + Math.random() * 2, 0.9 + Math.random() * 0.6);
        } else {
          this.spawn(cx, cy, baseR * 1.15, "streak", 160 + Math.random() * 180, 2 + Math.random() * 2, 0.45 + Math.random() * 0.35);
        }
      } else if (kind === "mid") {
        this.spawn(
          cx,
          cy,
          baseR * 1.2,
          Math.random() < 0.5 ? "spark" : "dust",
          110 + Math.random() * 150,
          1.4 + Math.random() * 2,
          0.55 + Math.random() * 0.5,
        );
      } else {
        this.spawn(
          cx,
          cy,
          baseR * 1.3,
          Math.random() < 0.6 ? "spark" : "streak",
          150 + Math.random() * 220,
          0.9 + Math.random() * 1.4,
          0.3 + Math.random() * 0.4,
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
      const alpha = clamp(t * (p.kind === "dust" ? 0.7 : 0.95), 0, 0.95);
      const warm = p.hue < 0.62;
      let r, g, b;
      
      if (p.kind === "spark" || p.kind === "streak") {
        // High frequency: Ice blue / White
        r = 200 + p.hue * 55;
        g = 230 + p.hue * 25;
        b = 255;
      } else {
        // Low/Mid frequency: Amber / Gold
        r = 255;
        g = warm ? 150 + p.hue * 70 : 210;
        b = warm ? 70 + p.hue * 40 : 170;
      }

      // Trail for sparks / streaks
      if (p.kind === "streak" || p.kind === "spark") {
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.55})`;
        ctx.lineWidth = Math.max(0.6, p.size * 0.45 * t);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }

      const radius = p.size * (0.55 + t * 0.9) * (p.kind === "ember" ? 1.25 : 1);

      // Soft glow halo
      if (p.glow > 1 || p.kind === "ember") {
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 3.2);
        grd.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.45 * p.glow})`);
        grd.addColorStop(0.4, `rgba(${r}, ${Math.floor(g * 0.7)}, 40, ${alpha * 0.18})`);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = `rgba(${r}, ${Math.min(255, g + 30)}, ${Math.min(220, b + 40)}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Hot core
      if (p.kind !== "dust") {
        ctx.fillStyle = p.kind === "spark" || p.kind === "streak" 
          ? `rgba(255, 255, 255, ${alpha * 0.95})`
          : `rgba(255, 245, 220, ${alpha * 0.85})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, radius * 0.35), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
