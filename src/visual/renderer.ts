import type { OnsetState } from "../audio/onset";
import type { AudioFrame } from "../audio/analyser";
import { drawCoreAndRings } from "./core";
import { drawCircularWaveform } from "./waveform";
import { ParticleSystem } from "./particles";
import { ShockwaveSystem } from "./shockwave";
import type { VisualFrame } from "./types";
import { attackRelease, clamp, lerp } from "./types";

type Star = { x: number; y: number; z: number; s: number };
type PendingBurst = { kind: "bass" | "mid" | "high"; at: number; intensity: number };

export class VisualRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly particles = new ParticleSystem(2200);
  private readonly shocks = new ShockwaveSystem(16);
  private readonly stars: Star[] = [];
  private readonly pending: PendingBurst[] = [];
  private noiseCanvas: HTMLCanvasElement | null = null;
  private noiseCtx: CanvasRenderingContext2D | null = null;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private smooth = { bass: 0, lowMid: 0, mid: 0, high: 0, overall: 0, rms: 0 };
  private env = { brightness: 0, deform: 0, bg: 0 };
  private midRipple = 0;
  private reduced = false;
  private smoothness = 0.7;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.particles.setReducedMotion(this.reduced);
    this.shocks.setReducedMotion(this.reduced);
    const n = this.reduced ? 50 : 160;
    for (let i = 0; i < n; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        z: Math.random(),
        s: 0.35 + Math.random() * 2.2,
      });
    }
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ensureNoise(128);
  }

  setSmoothness(value: number): void {
    this.smoothness = value;
  }

  private ensureNoise(size: number): void {
    if (this.noiseCanvas) return;
    this.noiseCanvas = document.createElement("canvas");
    this.noiseCanvas.width = size;
    this.noiseCanvas.height = size;
    this.noiseCtx = this.noiseCanvas.getContext("2d");
    if (!this.noiseCtx) return;
    const img = this.noiseCtx.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    this.noiseCtx.putImageData(img, 0, 0);
  }

  render(
    audio: AudioFrame | null,
    onset: OnsetState | null,
    time: number,
    dt: number,
    playing: boolean,
  ): void {
    const ctx = this.ctx;
    const cx = this.w * 0.5;
    const cy = this.h * 0.46;
    const baseR = Math.min(this.w, this.h) * 0.16;
    const nowMs = time * 1000;

    if (audio) {
      const attackBase = lerp(10, 60, this.smoothness);
      const releaseBase = lerp(100, 400, this.smoothness);

      this.smooth.bass = attackRelease(this.smooth.bass, audio.bass, attackBase, releaseBase, dt);
      this.smooth.lowMid = attackRelease(
        this.smooth.lowMid,
        audio.lowMid,
        attackBase,
        releaseBase,
        dt,
      );
      this.smooth.mid = attackRelease(this.smooth.mid, audio.mid, attackBase, releaseBase, dt);
      this.smooth.high = attackRelease(this.smooth.high, audio.high, attackBase, releaseBase, dt);
      this.smooth.overall = attackRelease(
        this.smooth.overall,
        audio.overall,
        attackBase * 2,
        releaseBase * 2,
        dt,
      );
      this.smooth.rms = attackRelease(
        this.smooth.rms,
        audio.rms,
        attackBase * 2,
        releaseBase * 2,
        dt,
      );

      this.env.brightness = attackRelease(this.env.brightness, audio.rms, 30, 200, dt);
      this.env.deform = attackRelease(this.env.deform, audio.bass, 60, 400, dt);
      this.env.bg = attackRelease(this.env.bg, audio.overall, 200, 1000, dt);
    } else {
      const breath = 0.08 + 0.05 * Math.sin(time * 1.2);
      this.smooth.bass = lerp(this.smooth.bass, breath, 0.05);
      this.smooth.lowMid = lerp(this.smooth.lowMid, breath * 0.9, 0.05);
      this.smooth.mid = lerp(this.smooth.mid, breath * 0.8, 0.05);
      this.smooth.high = lerp(this.smooth.high, breath * 0.5, 0.05);
      this.smooth.overall = lerp(this.smooth.overall, breath, 0.05);
      this.smooth.rms = lerp(this.smooth.rms, breath, 0.05);
      this.env.brightness = lerp(this.env.brightness, breath, 0.05);
      this.env.deform = lerp(this.env.deform, breath, 0.05);
      this.env.bg = lerp(this.env.bg, breath, 0.05);
    }

    // Onset routing (P1 §2.1 + P3 §4.3 stagger)
    if (onset?.bass) {
      this.shocks.spawn("bass", baseR);
      this.pending.push({
        kind: "bass",
        at: nowMs + 40,
        intensity: 0.35 + (onset.bassPulse || 0.7) * 0.85,
      });
    }
    if (onset?.mid) {
      // No fullscreen shock — local ripple on spectrum ring
      this.midRipple = Math.min(1, this.midRipple + 0.7);
      this.pending.push({ kind: "mid", at: nowMs + 50, intensity: 0.55 });
    }
    if (onset?.high) {
      // Sparks only, delayed slightly
      this.pending.push({ kind: "high", at: nowMs + 30, intensity: 0.7 });
    }

    this.midRipple = Math.max(0, this.midRipple - dt * 3.2);

    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (nowMs >= p.at) {
        this.particles.burst(cx, cy, baseR, p.kind, p.intensity);
        this.pending.splice(i, 1);
      }
    }

    const frame: VisualFrame = {
      bass: this.smooth.bass,
      lowMid: this.smooth.lowMid,
      mid: this.smooth.mid,
      high: this.smooth.high,
      overall: this.smooth.overall,
      rms: this.smooth.rms,
      bassPulse: onset?.bassPulse ?? 0,
      lowMidPulse: onset?.lowMidPulse ?? 0,
      midPulse: onset?.midPulse ?? 0,
      highPulse: onset?.highPulse ?? 0,
      beatPulse: onset?.beatPulse ?? 0,
      waveBoost: this.shocks.getWaveBoost(),
      midRipple: this.midRipple,
      frequency: audio?.frequency ?? idleSpectrum(time),
      waveform: audio?.waveform ?? idleWave(time),
      time,
      dt,
    };

    // Longer trail after heavy beats (P2 §3.3)
    ctx.globalCompositeOperation = "source-over";
    const beatHold = frame.beatPulse > 0.35 ? 0.18 : lerp(0.28, 0.42, this.env.bg);
    const trailAlpha = playing ? beatHold : 0.45;
    ctx.fillStyle = `rgba(3, 8, 5, ${trailAlpha})`;
    ctx.fillRect(0, 0, this.w, this.h);

    this.drawStars(ctx, frame);
    this.drawFarOrbits(ctx, cx, cy, baseR, frame);

    const waveBase = baseR * (1.9 + frame.bass * 0.08 + frame.beatPulse * 0.03);
    this.shocks.update(dt, waveBase);
    this.particles.update(cx, cy, baseR, frame);

    this.shocks.draw(ctx, cx, cy, frame);
    drawCircularWaveform(ctx, cx, cy, baseR, frame);
    drawCoreAndRings(ctx, cx, cy, baseR, frame);
    this.particles.draw(ctx);

    this.drawGrain(ctx);
    this.drawVignette(ctx, cx, cy, baseR);
  }

  private drawStars(ctx: CanvasRenderingContext2D, frame: VisualFrame): void {
    // Stronger, more parallax (P2 §1.3)
    const drift = frame.time * 0.03;
    for (const star of this.stars) {
      const x = ((star.x + drift * (0.04 + star.z * 0.1)) % 1) * this.w;
      const y = ((star.y + drift * star.z * 0.015) % 1) * this.h;
      const a = clamp(0.22 + star.z * 0.45 + frame.high * 0.15, 0, 0.75);
      ctx.fillStyle = `rgba(200, 245, 210, ${a})`;
      ctx.beginPath();
      ctx.arc(x, y, star.s * (0.55 + star.z * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawFarOrbits(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    baseR: number,
    frame: VisualFrame,
  ): void {
    ctx.save();
    ctx.strokeStyle = `rgba(62, 207, 122, ${0.035 + frame.overall * 0.02})`;
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 2; i++) {
      const r = baseR * (3.2 + i * 0.55) * (1 + Math.sin(frame.time * 0.3 + i) * 0.01);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawGrain(ctx: CanvasRenderingContext2D): void {
    if (!this.noiseCanvas) return;
    ctx.save();
    ctx.globalAlpha = 0.028;
    ctx.globalCompositeOperation = "overlay";
    const tile = 128;
    for (let y = 0; y < this.h; y += tile) {
      for (let x = 0; x < this.w; x += tile) {
        ctx.drawImage(this.noiseCanvas, x, y, tile, tile);
      }
    }
    ctx.restore();
  }

  private drawVignette(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    baseR: number,
  ): void {
    const vig = ctx.createRadialGradient(
      cx,
      cy,
      baseR * 0.5,
      cx,
      cy,
      Math.max(this.w, this.h) * 0.72,
    );
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.w, this.h);
  }
}

const idleFreq = new Uint8Array(1024);
const idleWaveBuf = new Uint8Array(2048);

function idleSpectrum(time: number): Uint8Array {
  for (let i = 0; i < idleFreq.length; i++) {
    const t = i / idleFreq.length;
    idleFreq[i] = Math.floor(
      (28 +
        22 * Math.sin(time * 1.6 + t * 14) +
        16 * Math.sin(time * 0.9 + t * 5) +
        10 * Math.sin(time * 2.4 + t * 28) +
        8 * Math.sin(time * 0.4 + t * 2.2)) *
        (1 - t * 0.55),
    );
  }
  return idleFreq;
}

function idleWave(time: number): Uint8Array {
  for (let i = 0; i < idleWaveBuf.length; i++) {
    const t = i / idleWaveBuf.length;
    idleWaveBuf[i] = Math.floor(128 + 18 * Math.sin(time * 2 + t * Math.PI * 8));
  }
  return idleWaveBuf;
}
