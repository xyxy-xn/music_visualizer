import type { VisualFrame } from "./types";
import { clamp, lerp } from "./types";

export function drawCoreAndRings(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  baseR: number,
  frame: VisualFrame,
): void {
  const { bass, lowMid, mid, high, bassPulse, midPulse, highPulse, beatPulse } = frame;

  // Compress-release: slightly shrinks on bass, expands on pulse
  const coreR = baseR * (0.28 - bass * 0.03 + bassPulse * 0.09 + beatPulse * 0.04);
  const squash = 1 - beatPulse * 0.08;
  const stretch = 1 + beatPulse * 0.08;

  // Soft glow behind core (lowered max brightness)
  const glowR = coreR * (2.4 + lowMid * 0.5);
  const glow = ctx.createRadialGradient(cx, cy, coreR * 0.2, cx, cy, glowR);
  glow.addColorStop(0, `rgba(255, 216, 154, ${clamp(0.25 + bass * 0.2 + bassPulse * 0.15, 0, 0.6)})`);
  glow.addColorStop(0.35, `rgba(200, 121, 46, ${clamp(0.15 + lowMid * 0.15, 0, 0.4)})`);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  
  ctx.save();
  ctx.translate(cx, cy);
  // Slight tilt/parallax based on time and mid frequencies
  const tiltX = Math.sin(frame.time * 0.7) * mid * 0.1;
  const tiltY = Math.cos(frame.time * 0.8) * mid * 0.1;
  ctx.transform(1, tiltY, tiltX, 1, 0, 0);

  ctx.beginPath();
  ctx.scale(stretch, squash);
  ctx.arc(0, 0, glowR, 0, Math.PI * 2);
  ctx.fill();

  // Core disk clipping for nebula
  ctx.beginPath();
  ctx.arc(0, 0, coreR, 0, Math.PI * 2);
  ctx.clip();

  // Base core color (lowered brightness to preserve layers)
  const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
  coreGrad.addColorStop(0, "#ffe4b5"); // Less white, more amber-white
  coreGrad.addColorStop(0.5, "#d48c36");
  coreGrad.addColorStop(1, "#5c2b09");
  ctx.fillStyle = coreGrad;
  ctx.fill();

  // Nebula/Fluid texture inside core
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate(frame.time * (0.2 + i * 0.1) + i * Math.PI / 3);
    // Offset the gradient centers to create swirling effect
    const ox = Math.sin(frame.time * 0.5 + i) * coreR * 0.3;
    const oy = Math.cos(frame.time * 0.4 - i) * coreR * 0.3;
    const nebGrad = ctx.createRadialGradient(ox, oy, 0, ox, oy, coreR * 1.2);
    // Colors shift slightly with mid/high frequencies
    const r = 200 + i * 20;
    const g = 100 + mid * 100;
    const b = 50 + high * 150;
    nebGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.3 + bassPulse * 0.2})`);
    nebGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = nebGrad;
    ctx.beginPath();
    ctx.arc(ox, oy, coreR * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalCompositeOperation = "source-over";
  
  // Inner bright rim
  ctx.strokeStyle = `rgba(255, 236, 200, ${clamp(0.4 + beatPulse * 0.4, 0, 0.8)})`;
  ctx.lineWidth = 1.5 + bassPulse * 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, coreR * 0.98, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.restore(); // Restore from clip and scale/tilt

  // Transparent concentric rings (Midground)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.transform(1, tiltY * 0.5, tiltX * 0.5, 1, 0, 0); // Less tilt for midground

  const rings = [
    { mul: 1.35, a: 0.15 + lowMid * 0.2 + midPulse * 0.15, w: 1.2 },
    { mul: 1.7, a: 0.1 + mid * 0.2 + highPulse * 0.1, w: 1 },
    { mul: 2.15, a: 0.06 + lowMid * 0.1, w: 0.8 },
    { mul: 2.65, a: 0.04 + high * 0.1 + beatPulse * 0.06, w: 0.7 },
  ];

  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    // LowMid controls the slow breathing of the rings
    const breathe = 1 + Math.sin(frame.time * (0.8 + i * 0.15) + i) * 0.01 * (1 + lowMid);
    const r = baseR * ring.mul * breathe * (1 + lowMid * 0.03 + beatPulse * 0.02);
    ctx.strokeStyle = `rgba(232, 184, 106, ${clamp(ring.a, 0, 0.6)})`; // Limit bloom
    ctx.lineWidth = ring.w + midPulse * 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // subtle dashed accent on alternate rings
    if (i % 2 === 1) {
      ctx.save();
      ctx.setLineDash([6, 10]);
      ctx.strokeStyle = `rgba(255, 216, 154, ${clamp(0.06 + high * 0.1, 0, 0.3)})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Rotating tick marks on mid ring
  const tickR = baseR * lerp(1.7, 1.78, mid);
  const ticks = 48;
  ctx.save();
  ctx.rotate(frame.time * 0.15);
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * Math.PI * 2;
    const len = 4 + (i % 4 === 0 ? 6 : 0) + high * 6;
    const x0 = Math.cos(a) * tickR;
    const y0 = Math.sin(a) * tickR;
    const x1 = Math.cos(a) * (tickR + len);
    const y1 = Math.sin(a) * (tickR + len);
    ctx.strokeStyle = `rgba(232, 184, 106, ${clamp(0.1 + high * 0.2, 0, 0.5)})`;
    ctx.lineWidth = i % 4 === 0 ? 1.2 : 0.6;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.restore();
  
  ctx.restore(); // Restore midground tilt
}
