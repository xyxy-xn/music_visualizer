import type { OnsetState } from "../audio/onset";
import type { AudioFrame } from "../audio/analyser";
import { drawCoreAndRings } from "./core";
import { drawCircularWaveform } from "./waveform";
import { ParticleSystem } from "./particles";
import { ShockwaveSystem } from "./shockwave";
import type { VisualFrame } from "./types";
import { attackRelease, lerp } from "./types";

type Star = { x: number; y: number; z: number; s: number };

export class VisualRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly particles = new ParticleSystem(2800);
  private readonly shocks = new ShockwaveSystem(28);
  private readonly stars: Star[] = [];
  private w = 0;
  private h = 0;
  private dpr = 1;
  private smooth = { bass: 0, lowMid: 0, mid: 0, high: 0, overall: 0, rms: 0 };
  private env = { brightness: 0, deform: 0, bg: 0 };
  private reduced = false;
  private smoothness = 0.7;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.particles.setReducedMotion(this.reduced);
    this.shocks.setReducedMotion(this.reduced);
    for (let i = 0; i < (this.reduced ? 40 : 120); i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        z: Math.random(),
        s: 0.4 + Math.random() * 1.4,
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
  }

  setSmoothness(value: number): void {
    this.smoothness = value;
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

    if (audio) {
      // Smoothness controls the attack/release times
      const attackBase = lerp(10, 60, this.smoothness);
      const releaseBase = lerp(100, 400, this.smoothness);

      this.smooth.bass = attackRelease(this.smooth.bass, audio.bass, attackBase, releaseBase, dt);
      this.smooth.lowMid = attackRelease(this.smooth.lowMid, audio.lowMid, attackBase, releaseBase, dt);
      this.smooth.mid = attackRelease(this.smooth.mid, audio.mid, attackBase, releaseBase, dt);
      this.smooth.high = attackRelease(this.smooth.high, audio.high, attackBase, releaseBase, dt);
      this.smooth.overall = attackRelease(this.smooth.overall, audio.overall, attackBase * 2, releaseBase * 2, dt);
      this.smooth.rms = attackRelease(this.smooth.rms, audio.rms, attackBase * 2, releaseBase * 2, dt);

      // Envelopes for specific visual traits
      this.env.brightness = attackRelease(this.env.brightness, audio.rms, 30, 200, dt);
      this.env.deform = attackRelease(this.env.deform, audio.bass, 60, 400, dt);
      this.env.bg = attackRelease(this.env.bg, audio.overall, 200, 1000, dt);
    } else {
      // idle breathing demo
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
      frequency: audio?.frequency ?? idleSpectrum(time),
      waveform: audio?.waveform ?? idleWave(time),
      time,
      dt,
    };

    // Clear with soft trail for bloom feel
    ctx.globalCompositeOperation = "source-over";
    // Limit background opacity based on env.bg to prevent washing out
    const trailAlpha = playing ? lerp(0.28, 0.45, this.env.bg) : 0.45;
    ctx.fillStyle = `rgba(5, 4, 3, ${trailAlpha})`;
    ctx.fillRect(0, 0, this.w, this.h);

    this.drawStars(ctx, frame);

    if (onset?.bass) this.shocks.spawn("bass", baseR);
    if (onset?.mid) this.shocks.spawn("mid", baseR);
    if (onset?.high) this.shocks.spawn("high", baseR);

    if (onset?.bass) this.particles.burst(cx, cy, baseR, "bass");
    if (onset?.mid) this.particles.burst(cx, cy, baseR, "mid");
    if (onset?.high) this.particles.burst(cx, cy, baseR, "high");

    this.shocks.update(dt);
    this.particles.update(cx, cy, baseR, frame);

    this.shocks.draw(ctx, cx, cy, frame);
    drawCircularWaveform(ctx, cx, cy, baseR, frame);
    drawCoreAndRings(ctx, cx, cy, baseR, frame);
    this.particles.draw(ctx);

    // vignette
    const vig = ctx.createRadialGradient(cx, cy, baseR * 0.5, cx, cy, Math.max(this.w, this.h) * 0.72);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  private drawStars(ctx: CanvasRenderingContext2D, frame: VisualFrame): void {
    const drift = frame.time * 0.01;
    for (const star of this.stars) {
      const x = ((star.x + drift * (0.02 + star.z * 0.04)) % 1) * this.w;
      const y = star.y * this.h;
      const a = 0.15 + star.z * 0.35 + frame.high * 0.2;
      ctx.fillStyle = `rgba(243, 230, 208, ${a})`;
      ctx.beginPath();
      ctx.arc(x, y, star.s * (0.6 + frame.high * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
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
