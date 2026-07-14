import type { VisualFrame } from "./types";
import { clamp, lerp } from "./types";

let prevBeat = 0;
let anticip = 0;

export function drawCoreAndRings(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  baseR: number,
  frame: VisualFrame,
): void {
  const { bass, lowMid, mid, high, bassPulse, midPulse, highPulse, beatPulse } = frame;

  const dBeat = beatPulse - prevBeat;
  prevBeat = beatPulse;
  if (dBeat > 0.08) anticip = 1;
  anticip = Math.max(0, anticip - frame.dt * 8);

  const coreFocus = clamp(1 + bassPulse * 0.4 - highPulse * 0.25, 0.6, 1.4);

  const coreR =
    baseR *
    (0.28 - bass * 0.03 + bassPulse * 0.09 + beatPulse * 0.04 - anticip * 0.035);

  const squash = 1 - beatPulse * 0.06 - anticip * 0.04;
  const stretch = 1 + beatPulse * 0.07 * (1 - anticip);

  const glowR = coreR * (2.4 + lowMid * 0.5);
  const glow = ctx.createRadialGradient(cx, cy, coreR * 0.2, cx, cy, glowR);
  glow.addColorStop(
    0,
    `rgba(122, 239, 176, ${clamp((0.22 + bass * 0.18 + bassPulse * 0.18) * coreFocus, 0, 0.55)})`,
  );
  glow.addColorStop(0.35, `rgba(46, 160, 90, ${clamp(0.12 + lowMid * 0.12, 0, 0.35)})`);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;

  ctx.save();
  ctx.translate(cx, cy);
  const tiltX = Math.sin(frame.time * 0.7) * mid * 0.08;
  const tiltY = Math.cos(frame.time * 0.8) * mid * 0.08;
  ctx.transform(1, tiltY, tiltX, 1, 0, 0);

  ctx.beginPath();
  ctx.scale(stretch, squash);
  ctx.arc(0, 0, glowR, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, coreR, 0, Math.PI * 2);
  ctx.clip();

  const hx = -coreR * 0.22;
  const hy = -coreR * 0.28;
  const coreGrad = ctx.createRadialGradient(hx, hy, 0, 0, 0, coreR);
  coreGrad.addColorStop(0, "#e8ffe8");
  coreGrad.addColorStop(0.35, "#5ee89a");
  coreGrad.addColorStop(0.7, "#1f9a55");
  coreGrad.addColorStop(1, "rgba(12, 60, 32, 0.35)");
  ctx.fillStyle = coreGrad;
  ctx.fill();

  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate(frame.time * (0.2 + i * 0.1) + (i * Math.PI) / 3);
    const ox = Math.sin(frame.time * 0.5 + i) * coreR * 0.3;
    const oy = Math.cos(frame.time * 0.4 - i) * coreR * 0.3;
    const nebGrad = ctx.createRadialGradient(ox, oy, 0, ox, oy, coreR * 1.2);
    const r = 40 + i * 20 + mid * 120;
    const g = 180 + i * 20;
    const b = 60 + high * 40;
    nebGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${clamp(0.25 + bassPulse * 0.15, 0, 0.45)})`);
    nebGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = nebGrad;
    ctx.beginPath();
    ctx.arc(ox, oy, coreR * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalCompositeOperation = "source-over";

  ctx.strokeStyle = `rgba(200, 255, 180, ${clamp((0.35 + beatPulse * 0.3) * coreFocus, 0, 0.7)})`;
  ctx.lineWidth = 1.4 + bassPulse;
  ctx.beginPath();
  ctx.arc(0, 0, coreR * 0.98, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.transform(1, tiltY * 0.5, tiltX * 0.5, 1, 0, 0);

  const rings = [
    { mul: 1.4, a: 0.08 + lowMid * 0.1 + midPulse * 0.06, w: 1.1 },
    { mul: 2.35, a: 0.035 + lowMid * 0.05 + beatPulse * 0.04, w: 0.7 },
  ];

  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    const breathe = 1 + Math.sin(frame.time * (0.7 + i * 0.2) + i) * 0.008 * (1 + lowMid);
    const r = baseR * ring.mul * breathe * (1 + lowMid * 0.025);
    ctx.strokeStyle = `rgba(62, 207, 122, ${clamp(ring.a, 0, 0.18)})`;
    ctx.lineWidth = ring.w;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    if (i === 0 && beatPulse > 0.3) {
      ctx.save();
      ctx.setLineDash([6, 12]);
      ctx.strokeStyle = `rgba(232, 212, 74, ${clamp((beatPulse - 0.3) * 0.25, 0, 0.18)})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.strokeStyle = `rgba(62, 207, 122, ${0.03 + high * 0.02})`;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(0, 0, baseR * 3.6, 0, Math.PI * 2);
  ctx.stroke();

  const tickR = baseR * lerp(1.65, 1.72, mid);
  const ticks = 36;
  const spinRate = 0.12 * (1 + lowMid * 0.6);
  ctx.save();
  ctx.rotate(frame.time * spinRate);
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * Math.PI * 2;
    const len = 3 + (i % 4 === 0 ? 4 : 0) + high * 3;
    const x0 = Math.cos(a) * tickR;
    const y0 = Math.sin(a) * tickR;
    const x1 = Math.cos(a) * (tickR + len);
    const y1 = Math.sin(a) * (tickR + len);
    ctx.strokeStyle = `rgba(62, 207, 122, ${clamp(0.06 + high * 0.08, 0, 0.2)})`;
    ctx.lineWidth = i % 4 === 0 ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.restore();

  ctx.restore();
}
