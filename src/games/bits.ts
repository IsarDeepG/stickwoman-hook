import { palette } from "@/games/palette";

export type Bit = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  kind: "spark" | "dust";
};

export function burst(bits: Bit[], x: number, y: number, kind: "hit" | "land" | "ko") {
  const n = kind === "ko" ? 16 : kind === "hit" ? 9 : 5;
  const room = 90 - bits.length;
  const count = Math.max(0, Math.min(n, room));
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = kind === "land" ? 30 + Math.random() * 90 : 70 + Math.random() * 200;
    const life = 0.22 + Math.random() * 0.28;
    bits.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - (kind === "land" ? 10 : 50),
      life,
      max: life,
      kind: kind === "land" ? "dust" : "spark",
    });
  }
}

export function stepBits(bits: Bit[], dt: number) {
  for (const b of bits) {
    b.life -= dt;
    b.vy += 640 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  let w = 0;
  for (const b of bits) if (b.life > 0) bits[w++] = b;
  bits.length = w;
}

export function drawBits(ctx: CanvasRenderingContext2D, bits: Bit[]) {
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (const b of bits) {
    ctx.globalAlpha = Math.max(0, b.life / b.max);
    ctx.strokeStyle = b.kind === "dust" ? palette.bone : palette.signal;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function decayTrauma(trauma: number, dt: number, reduced: boolean) {
  return Math.max(0, trauma - dt * (reduced ? 4 : 1.6));
}

export function shakeOffset(trauma: number, time: number, reduced: boolean) {
  if (reduced) return { x: 0, y: 0, rot: 0 };
  const s = trauma * trauma;
  return {
    x: Math.sin(time * 47) * 9 * s,
    y: Math.cos(time * 41) * 7 * s,
    rot: Math.sin(time * 33) * 0.012 * s,
  };
}
