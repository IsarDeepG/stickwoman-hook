import { sfx } from "@/games/audio";
import { burst, decayTrauma, drawBits, shakeOffset, stepBits, type Bit } from "@/games/bits";
import { clamp, palette, VW } from "@/games/palette";
import { drawGround, drawShadow, drawStick, fillArena } from "@/games/stick";
import type { Frame, Hud, Sim } from "@/games/types";

const GROUND = 470;
const HAND = { x: 156, y: GROUND - 72 };
const ROUND = 45;

type Arrow = { x: number; y: number; vx: number; vy: number; life: number };
type Target = {
  x: number;
  y: number;
  dir: 1 | -1;
  min: number;
  max: number;
  speed: number;
  alive: boolean;
  respawn: number;
  flash: number;
  ko: number;
};
type Pop = { x: number; y: number; text: string; life: number };

const LANES: Array<Pick<Target, "y" | "min" | "max" | "speed">> = [
  { y: GROUND, min: 500, max: 900, speed: 78 },
  { y: 348, min: 540, max: 880, speed: 96 },
  { y: 236, min: 600, max: 900, speed: 70 },
];

function makeTarget(i: number): Target {
  const lane = LANES[i % LANES.length]!;
  return {
    x: lane.min + ((i * 137) % (lane.max - lane.min)),
    y: lane.y,
    dir: i % 2 === 0 ? 1 : -1,
    min: lane.min,
    max: lane.max,
    speed: lane.speed,
    alive: true,
    respawn: 0,
    flash: 0,
    ko: 0,
  };
}

export function createDraw(): Sim {
  let arrows: Arrow[] = [];
  let targets = [0, 1, 2].map(makeTarget);
  let pops: Pop[] = [];
  let bits: Bit[] = [];
  let aiming = false;
  let aim = -0.35;
  let power = 0.45;
  let wind = 0;
  let windGoal = 0.2;
  let windT = 0;
  let time = 0;
  let left = ROUND;
  let score = 0;
  let combo = 1;
  let comboT = 0;
  let over = false;
  let trauma = 0;
  let commit = false;
  let pointer = { x: 640, y: 260 };

  function reset() {
    arrows = [];
    targets = [0, 1, 2].map(makeTarget);
    pops = [];
    bits = [];
    aiming = false;
    aim = -0.35;
    power = 0.45;
    wind = 0;
    windGoal = 0.2;
    windT = 0;
    time = 0;
    left = ROUND;
    score = 0;
    combo = 1;
    comboT = 0;
    over = false;
    trauma = 0;
    commit = false;
  }

  function aimAt(x: number, y: number) {
    pointer = { x, y };
    const dx = x - HAND.x;
    const dy = y - HAND.y;
    aim = Math.atan2(dy, dx);
    const dist = Math.hypot(dx, dy);
    power = clamp(dist / 200, 0.15, 1);
  }

  function fire() {
    if (power < 0.18) return;
    const sp = 460 + power * 640;
    arrows.push({
      x: HAND.x + Math.cos(aim) * 40,
      y: HAND.y + Math.sin(aim) * 40,
      vx: Math.cos(aim) * sp + wind * 40,
      vy: Math.sin(aim) * sp,
      life: 2.4,
    });
    sfx.bow();
  }

  return {
    restart: reset,
    debug: () => ({ x: HAND.x, y: HAND.y, vx: arrows.length }),
    pointer(phase, x, y) {
      if (over) return;
      if (phase === "down" || phase === "move") {
        aiming = true;
        aimAt(x, y);
      }
      if (phase === "up") {
        if (aiming) fire();
        aiming = false;
      }
    },
    hud(): Hud {
      const snapshot: Hud = {
        kicker: "Range",
        left: `${score} pts`,
        right: `${Math.ceil(left)}s`,
        sub: combo > 1 ? `Combo x${combo} · wind ${wind > 0.08 ? "→" : wind < -0.08 ? "←" : "still"}` : `Wind ${wind > 0.08 ? "with you" : wind < -0.08 ? "against" : "still"}`,
        over,
        won: score > 0,
        overTitle: score > 0 ? "Quiver empty" : "Time",
        overBody: score > 0 ? `${score} points. Heads pay double.` : "The sticks walked off unbothered.",
        score,
        commit,
      };
      commit = false;
      return snapshot;
    },
    step(dt) {
      time += dt;
      trauma = decayTrauma(trauma, dt, false);
      stepBits(bits, dt);
      pops.forEach((p) => {
        p.life -= dt;
        p.y -= 28 * dt;
      });
      pops = pops.filter((p) => p.life > 0);
      if (over) return;
      left -= dt;
      if (left <= 0) {
        left = 0;
        over = true;
        commit = true;
        if (score > 0) sfx.win();
        else sfx.fail();
        return;
      }
      windT -= dt;
      if (windT <= 0) {
        windT = 2.4 + Math.random() * 1.6;
        windGoal = (Math.random() * 2 - 1) * 0.85;
      }
      wind += (windGoal - wind) * Math.min(1, dt * 1.4);
      if (comboT > 0) {
        comboT -= dt;
        if (comboT <= 0) combo = 1;
      }
      for (const target of targets) {
        target.flash = Math.max(0, target.flash - dt * 3);
        if (!target.alive) {
          target.ko += dt;
          target.respawn -= dt;
          if (target.respawn <= 0) {
            target.alive = true;
            target.ko = 0;
            target.x = target.dir === 1 ? target.min : target.max;
          }
          continue;
        }
        target.x += target.dir * target.speed * dt;
        if (target.x > target.max) target.dir = -1;
        if (target.x < target.min) target.dir = 1;
      }
      const keep: Arrow[] = [];
      for (const arrow of arrows) {
        arrow.life -= dt;
        arrow.vx += wind * 90 * dt;
        arrow.vy += 720 * dt;
        arrow.x += arrow.vx * dt;
        arrow.y += arrow.vy * dt;
        let spent = arrow.life <= 0 || arrow.y > GROUND + 10 || arrow.x > VW + 40 || arrow.x < -40;
        if (!spent) {
          for (const target of targets) {
            if (!target.alive) continue;
            const head = { x: target.x, y: target.y - 64, r: 16 };
            const body = { x: target.x, y: target.y - 32, r: 20 };
            const headshot = (arrow.x - head.x) ** 2 + (arrow.y - head.y) ** 2 < (head.r + 4) ** 2;
            const bodyshot = (arrow.x - body.x) ** 2 + (arrow.y - body.y) ** 2 < (body.r + 4) ** 2;
            if (!headshot && !bodyshot) continue;
            const base = headshot ? 100 : 50;
            const gained = base * combo;
            score += gained;
            commit = true;
            combo = Math.min(4, combo + 1);
            comboT = 2.3;
            target.alive = false;
            target.respawn = 0.85;
            target.ko = 0;
            target.flash = 0.16;
            spent = true;
            trauma = Math.min(1, trauma + 0.28);
            sfx.point();
            burst(bits, arrow.x, arrow.y, "hit");
            pops.push({ x: target.x, y: target.y - 90, text: headshot ? `HEAD ${gained}` : `+${gained}`, life: 0.7 });
            break;
          }
        }
        if (!spent) keep.push(arrow);
        else if (arrow.y > GROUND) combo = 1;
      }
      arrows = keep;
    },
    draw(ctx) {
      const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const shake = shakeOffset(trauma, time, reduced);
      ctx.save();
      ctx.translate(shake.x, shake.y);
      fillArena(ctx);
      ctx.strokeStyle = "rgba(247,242,232,0.35)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(470, 348);
      ctx.lineTo(920, 348);
      ctx.moveTo(540, 236);
      ctx.lineTo(940, 236);
      ctx.stroke();
      drawGround(ctx, GROUND, 80, VW);
      for (const target of targets) {
        drawShadow(ctx, target.x, target.y, 0.75);
        drawStick(ctx, {
          x: target.x,
          y: target.alive ? target.y : target.y + Math.min(18, target.ko * 40),
          facing: target.dir,
          scale: 0.92,
          anim: target.alive ? "walk" : "ko",
          phase: target.alive ? 0 : Math.min(1, target.ko / 0.4),
          time: time + target.min,
          color: palette.signal,
          flash: target.flash,
        });
      }
      drawShadow(ctx, 150, GROUND);
      drawStick(ctx, {
        x: 150,
        y: GROUND,
        facing: 1,
        scale: 1.05,
        anim: "draw",
        phase: aiming ? power : 0.2,
        time,
        aim: aiming ? aim : -0.4,
        color: palette.bone,
      });
      if (aiming) {
        let x = HAND.x + Math.cos(aim) * 40;
        let y = HAND.y + Math.sin(aim) * 40;
        let vx = Math.cos(aim) * (460 + power * 640) + wind * 40;
        let vy = Math.sin(aim) * (460 + power * 640);
        ctx.fillStyle = "rgba(247,242,232,0.75)";
        for (let i = 0; i < 14; i++) {
          vx += wind * 90 * 0.06;
          vy += 720 * 0.06;
          x += vx * 0.06;
          y += vy * 0.06;
          ctx.globalAlpha = 0.85 - i * 0.05;
          ctx.beginPath();
          ctx.arc(x, y, 2.4, 0, Math.PI * 2);
          ctx.fill();
          if (y > GROUND) break;
        }
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = palette.bone;
      ctx.fillStyle = palette.signal;
      ctx.lineWidth = 2.4;
      for (const arrow of arrows) {
        const ang = Math.atan2(arrow.vy, arrow.vx);
        ctx.save();
        ctx.translate(arrow.x, arrow.y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(-16, 0);
        ctx.lineTo(8, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(4, -3.5);
        ctx.lineTo(4, 3.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = palette.bone;
      ctx.font = "600 22px Teko, Impact, sans-serif";
      ctx.textAlign = "center";
      for (const pop of pops) {
        ctx.globalAlpha = Math.max(0, pop.life / 0.7);
        ctx.fillText(pop.text, pop.x, pop.y);
      }
      ctx.globalAlpha = 1;
      const wx = 480 + wind * 70;
      ctx.strokeStyle = palette.signal;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(480, 36);
      ctx.lineTo(wx, 36);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(wx, 36);
      ctx.lineTo(wx - Math.sign(wind || 1) * 8, 30);
      ctx.lineTo(wx - Math.sign(wind || 1) * 8, 42);
      ctx.closePath();
      ctx.fillStyle = palette.signal;
      ctx.fill();
      drawBits(ctx, bits);
      ctx.restore();
    },
  };
}
