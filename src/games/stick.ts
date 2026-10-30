import { palette, VW, VH } from "@/games/palette";

export type StickAnim =
  | "idle"
  | "run"
  | "walk"
  | "jump"
  | "fall"
  | "slide"
  | "punch"
  | "kick"
  | "block"
  | "hurt"
  | "ko"
  | "draw"
  | "cheer"
  | "hover";

export type StickDraw = {
  x: number;
  y: number;
  facing: 1 | -1;
  scale?: number;
  anim: StickAnim;
  phase: number;
  time: number;
  color: string;
  flash?: number;
  aim?: number;
  squash?: number;
  alpha?: number;
};

type Pt = { x: number; y: number };

type Pose = {
  lean: number;
  bob: number;
  headX: number;
  lLeg: number;
  lKnee: number;
  rLeg: number;
  rKnee: number;
  lArm: number;
  lElbow: number;
  rArm: number;
  rElbow: number;
};

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - (1 - clamp01(t)) ** 3;

function poseFor(s: StickDraw): Pose {
  const t = s.time;
  const p = s.phase;
  if (s.anim === "run" || s.anim === "walk") {
    const speed = s.anim === "run" ? 11 : 7;
    const amp = s.anim === "run" ? 0.95 : 0.55;
    const sng = Math.sin(t * speed);
    const c = Math.cos(t * speed);
    return {
      lean: s.anim === "run" ? -0.22 : -0.08,
      bob: -Math.abs(sng) * (s.anim === "run" ? 3.2 : 1.6),
      headX: 0.5,
      lLeg: sng * amp,
      lKnee: 0.25 + Math.max(0, -c) * 0.85,
      rLeg: -sng * amp,
      rKnee: 0.25 + Math.max(0, c) * 0.85,
      lArm: -sng * amp,
      lElbow: 0.4,
      rArm: sng * amp,
      rElbow: 0.4,
    };
  }
  if (s.anim === "jump" || s.anim === "hover") {
    return {
      lean: -0.12,
      bob: 0,
      headX: 0,
      lLeg: -0.35,
      lKnee: 1.15,
      rLeg: 0.55,
      rKnee: 1.05,
      lArm: -2.15,
      lElbow: 0.35,
      rArm: -1.7,
      rElbow: 0.25,
    };
  }
  if (s.anim === "fall") {
    return {
      lean: 0.08,
      bob: 0,
      headX: 0,
      lLeg: -0.25,
      lKnee: 0.35,
      rLeg: 0.4,
      rKnee: 0.3,
      lArm: -2.4,
      lElbow: 0.2,
      rArm: 2.2,
      rElbow: 0.25,
    };
  }
  if (s.anim === "slide") {
    return {
      lean: -1.15,
      bob: 6,
      headX: 2,
      lLeg: 0.15,
      lKnee: 0.25,
      rLeg: 0.05,
      rKnee: 0.2,
      lArm: 1.15,
      lElbow: 0.2,
      rArm: 0.4,
      rElbow: 0.35,
    };
  }
  if (s.anim === "punch") {
    const e = ease((p - 0.16) / 0.24);
    return {
      lean: -0.28 * e,
      bob: 0,
      headX: 1,
      lLeg: -0.2,
      lKnee: 0.25,
      rLeg: 0.35 * e,
      rKnee: 0.2,
      lArm: -0.45,
      lElbow: 0.7,
      rArm: lerp(-0.85, 1.5, e),
      rElbow: lerp(1.15, 0.05, e),
    };
  }
  if (s.anim === "kick") {
    const e = ease((p - 0.12) / 0.28);
    return {
      lean: 0.18 * e,
      bob: -2 * e,
      headX: -1,
      lLeg: -0.3,
      lKnee: 0.25,
      rLeg: lerp(0.15, 1.45, e),
      rKnee: lerp(0.55, 0.04, e),
      lArm: -1.3,
      lElbow: 0.3,
      rArm: 0.9,
      rElbow: 0.45,
    };
  }
  if (s.anim === "block") {
    const sng = Math.sin(t * 3) * 0.04;
    return {
      lean: -0.06,
      bob: sng,
      headX: 0,
      lLeg: 0.18,
      lKnee: 0.2,
      rLeg: -0.12,
      rKnee: 0.2,
      lArm: 2.05,
      lElbow: 0.95,
      rArm: 1.65,
      rElbow: 1.05,
    };
  }
  if (s.anim === "hurt") {
    return {
      lean: 0.4,
      bob: 0,
      headX: -3,
      lLeg: -0.45,
      lKnee: 0.3,
      rLeg: 0.25,
      rKnee: 0.5,
      lArm: -2.3,
      lElbow: 0.4,
      rArm: 2.5,
      rElbow: 0.3,
    };
  }
  if (s.anim === "ko") {
    const e = ease(p);
    return {
      lean: lerp(0.2, 1.35, e),
      bob: lerp(0, 16, e),
      headX: -2,
      lLeg: 0.2,
      lKnee: 0.4,
      rLeg: -0.2,
      rKnee: 0.7,
      lArm: -0.6,
      lElbow: 0.5,
      rArm: 1.2,
      rElbow: 0.4,
    };
  }
  if (s.anim === "cheer") {
    const sng = Math.sin(t * 6);
    return {
      lean: -0.05,
      bob: -Math.abs(sng) * 2,
      headX: 0,
      lLeg: 0.15,
      lKnee: 0.2,
      rLeg: -0.12,
      rKnee: 0.15,
      lArm: -2.3 + sng * 0.15,
      lElbow: 0.2,
      rArm: -2.05 - sng * 0.15,
      rElbow: 0.2,
    };
  }
  const idle = Math.sin(t * 2.2);
  return {
    lean: 0,
    bob: idle * 1.1,
    headX: 0,
    lLeg: 0.1,
    lKnee: 0.18,
    rLeg: -0.08,
    rKnee: 0.14,
    lArm: 0.22 + idle * 0.04,
    lElbow: 0.38,
    rArm: -0.32,
    rElbow: 0.32,
  };
}

function limb(ctx: CanvasRenderingContext2D, origin: Pt, ang: number, bend: number, l1: number, l2: number, hand: boolean) {
  const mid = { x: origin.x + Math.sin(ang) * l1, y: origin.y + Math.cos(ang) * l1 };
  const endAng = ang - bend;
  const end = { x: mid.x + Math.sin(endAng) * l2, y: mid.y + Math.cos(endAng) * l2 };
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(mid.x, mid.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  if (hand) {
    ctx.beginPath();
    ctx.arc(end.x, end.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(end.x - 4.5, end.y);
    ctx.lineTo(end.x + 5, end.y);
    ctx.stroke();
  }
}

function drawBow(ctx: CanvasRenderingContext2D, s: StickDraw) {
  const aim = s.aim ?? 0;
  const a = s.facing === 1 ? aim : Math.PI - aim;
  const shoulder = { x: 0, y: -26 };
  const pull = clamp01(s.phase);
  const hand = {
    x: shoulder.x + Math.cos(a) * 32,
    y: shoulder.y + Math.sin(a) * 32,
  };
  const back = {
    x: shoulder.x - Math.cos(a) * (8 + pull * 16),
    y: shoulder.y - Math.sin(a) * (6 + pull * 12) + 4,
  };
  const hip = { x: 0, y: 0 };
  const neck = { x: 0, y: -30 };
  const head = { x: 0, y: -44 };
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(neck.x, neck.y);
  ctx.stroke();
  limb(ctx, hip, 0.12, 0.2, 17, 16, false);
  limb(ctx, hip, -0.1, 0.16, 17, 16, false);
  limb(ctx, shoulder, Math.atan2(hand.x - shoulder.x, hand.y - shoulder.y), 0.15, 16, 15, true);
  limb(ctx, shoulder, Math.atan2(back.x - shoulder.x, back.y - shoulder.y), 0.7, 14, 13, true);
  ctx.beginPath();
  ctx.arc(head.x, head.y, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hand.x, hand.y, 15, a - 1.15, a + 1.15);
  ctx.stroke();
  const tipA = { x: hand.x + Math.cos(a + 1.15) * 15, y: hand.y + Math.sin(a + 1.15) * 15 };
  const tipB = { x: hand.x + Math.cos(a - 1.15) * 15, y: hand.y + Math.sin(a - 1.15) * 15 };
  ctx.beginPath();
  ctx.moveTo(tipA.x, tipA.y);
  ctx.lineTo(back.x, back.y);
  ctx.lineTo(tipB.x, tipB.y);
  ctx.stroke();
  if (pull > 0.05) {
    ctx.beginPath();
    ctx.moveTo(back.x, back.y);
    ctx.lineTo(hand.x + Math.cos(a) * 22, hand.y + Math.sin(a) * 22);
    ctx.stroke();
  }
}

export function drawStick(ctx: CanvasRenderingContext2D, s: StickDraw) {
  const scale = s.scale ?? 1;
  const sq = s.squash ?? 1;
  ctx.save();
  ctx.globalAlpha = s.alpha ?? 1;
  ctx.translate(s.x, s.y);
  ctx.scale(s.facing * scale, scale);
  ctx.scale(1 + (1 - sq) * 0.85, sq);
  ctx.translate(0, -34);
  const pose = poseFor(s);
  ctx.translate(0, pose.bob);
  ctx.rotate(pose.lean);
  const flash = (s.flash ?? 0) > 0.45;
  ctx.strokeStyle = flash ? palette.bone : s.color;
  ctx.fillStyle = flash ? palette.bone : s.color;
  ctx.lineWidth = 3.15;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (s.anim === "draw") {
    drawBow(ctx, s);
    ctx.restore();
    return;
  }

  const hip = { x: 0, y: 0 };
  const neck = { x: pose.headX * 0.15, y: -30 };
  const head = { x: pose.headX, y: -43 };
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(neck.x, neck.y);
  ctx.stroke();
  const shoulder = { x: neck.x, y: -27 };
  limb(ctx, hip, pose.lLeg, pose.lKnee, 17, 16, false);
  limb(ctx, hip, pose.rLeg, pose.rKnee, 17, 16, false);
  limb(ctx, shoulder, pose.lArm, pose.lElbow, 15, 14, true);
  limb(ctx, shoulder, pose.rArm, pose.rElbow, 15, 14, true);
  ctx.beginPath();
  ctx.arc(head.x, head.y, 9.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hip.x, hip.y, 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function fillArena(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = palette.ink;
  ctx.fillRect(0, 0, VW, VH);
  ctx.strokeStyle = "rgba(247,242,232,0.045)";
  ctx.lineWidth = 1;
  for (let y = 28; y < VH - 40; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VW, y);
    ctx.stroke();
  }
}

export function drawGround(ctx: CanvasRenderingContext2D, y: number, x0 = 0, x1 = VW) {
  ctx.strokeStyle = palette.bone;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.strokeStyle = "rgba(247,242,232,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y + 8);
  ctx.lineTo(x1, y + 8);
  ctx.stroke();
}

export function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.save();
  ctx.fillStyle = "rgba(247,242,232,0.08)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 18 * scale, 5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function hpBar(ctx: CanvasRenderingContext2D, x: number, y: number, hp: number, color: string) {
  const w = 56;
  ctx.fillStyle = "rgba(247,242,232,0.16)";
  ctx.fillRect(x - w / 2, y, w, 5);
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, hp / 100)), 5);
}
