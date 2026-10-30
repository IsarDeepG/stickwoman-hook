import { sfx } from "@/games/audio";
import { burst, decayTrauma, drawBits, shakeOffset, stepBits, type Bit } from "@/games/bits";
import { clamp, palette, VW } from "@/games/palette";
import { drawShadow, drawStick, fillArena } from "@/games/stick";
import type { Frame, Hud, Sim } from "@/games/types";

type Plat = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  mover?: { amp: number; speed: number };
};

const PLATS: Plat[] = [
  { id: 1, x: 0, y: 460, w: 500, h: 180 },
  { id: 2, x: 630, y: 460, w: 300, h: 180 },
  { id: 3, x: 1020, y: 388, w: 170, h: 22 },
  { id: 4, x: 1280, y: 316, w: 170, h: 22 },
  { id: 5, x: 1540, y: 388, w: 160, h: 22 },
  { id: 6, x: 1780, y: 460, w: 340, h: 180 },
  { id: 7, x: 2200, y: 392, w: 140, h: 20, mover: { amp: 32, speed: 1.15 } },
  { id: 8, x: 2460, y: 324, w: 160, h: 22 },
  { id: 9, x: 2700, y: 400, w: 150, h: 22 },
  { id: 10, x: 2940, y: 460, w: 520, h: 180 },
];

const LEVEL_W = 3520;
const GOAL = { x: 3280, y: 390, w: 48, h: 80 };

type Guard = { base: number; range: number; y: number; speed: number; offset: number };
const GUARDS: Guard[] = [
  { base: 760, range: 70, y: 460, speed: 1.1, offset: 0 },
  { base: 1940, range: 80, y: 460, speed: 0.9, offset: 1.2 },
  { base: 3160, range: 60, y: 460, speed: 1.05, offset: 0.4 },
];

const CPS = [
  { x: 100, y: 460 },
  { x: 720, y: 460 },
  { x: 1900, y: 460 },
  { x: 3060, y: 460 },
];

function platX(p: Plat, time: number) {
  if (!p.mover) return p.x;
  return p.x + Math.sin(time * p.mover.speed) * p.mover.amp;
}

function guardX(g: Guard, time: number) {
  return g.base + Math.sin(time * g.speed + g.offset) * g.range;
}

export function createRoof(): Sim {
  let x = 100;
  let y = 460;
  let vx = 0;
  let vy = 0;
  let onGround = true;
  let coyote = 0.12;
  let jumpBuf = 0;
  let facing: 1 | -1 = 1;
  let squash = 1;
  let flash = 0;
  let lives = 3;
  let time = 0;
  let cam = 0;
  let bits: Bit[] = [];
  let trauma = 0;
  let iframe = 0;
  let over = false;
  let won = false;
  let commit = false;
  let cp = 0;
  let groundId = 0;
  let prevMoverX = 0;

  function reset() {
    x = 100;
    y = 460;
    vx = 0;
    vy = 0;
    onGround = true;
    coyote = 0.12;
    jumpBuf = 0;
    facing = 1;
    squash = 1;
    flash = 0;
    lives = 3;
    time = 0;
    cam = 0;
    bits = [];
    trauma = 0;
    iframe = 1;
    over = false;
    won = false;
    commit = false;
    cp = 0;
    groundId = 1;
    prevMoverX = 0;
  }

  function scoreNow() {
    return Math.round(Math.max(80, (52 - time) * 22 + lives * 110));
  }

  function hurt() {
    if (iframe > 0 || over || won) return;
    lives -= 1;
    flash = 0.2;
    trauma = Math.min(1, trauma + 0.55);
    sfx.hit();
    burst(bits, x, y - 30, "hit");
    if (lives <= 0) {
      lives = 0;
      over = true;
      won = false;
      sfx.fail();
      return;
    }
    const spot = CPS[cp] ?? CPS[0]!;
    x = spot.x;
    y = spot.y;
    vx = 0;
    vy = 0;
    onGround = true;
    iframe = 0.9;
  }

  return {
    restart: reset,
    debug: () => ({ x, y, vx }),
    pointer() {},
    hud(): Hud {
      const snapshot: Hud = {
        kicker: won ? "Cleared" : "Rooftop",
        left: `${lives} ${lives === 1 ? "life" : "lives"}`,
        right: `${time.toFixed(1)}s`,
        sub: "Reach the waving stick.",
        over,
        won,
        overTitle: won ? "Flag stick" : "Off the roof",
        overBody: won ? `${time.toFixed(1)}s · score ${scoreNow()}` : "The yard is still up there.",
        score: won ? scoreNow() : 0,
        commit,
      };
      commit = false;
      return snapshot;
    },
    step(dt, frame) {
      if (over) {
        time += 0;
        trauma = decayTrauma(trauma, dt, false);
        stepBits(bits, dt);
        return;
      }
      time += dt;
      trauma = decayTrauma(trauma, dt, false);
      stepBits(bits, dt);
      squash += (1 - squash) * Math.min(1, dt * 8);
      flash = Math.max(0, flash - dt * 3);
      iframe = Math.max(0, iframe - dt);

      const pad = frame.p1;
      if (won) {
        cam += (clamp(x - 300, 0, LEVEL_W - VW) - cam) * (1 - Math.exp(-4 * dt));
        return;
      }

      const mover = PLATS.find((p) => p.id === groundId && p.mover);
      if (onGround && mover) {
        const nx = platX(mover, time);
        x += nx - prevMoverX;
        prevMoverX = nx;
      }

      const target = (pad.left ? -1 : 0) + (pad.right ? 1 : 0);
      if (target !== 0) facing = target > 0 ? 1 : -1;
      const maxV = onGround ? 280 : 260;
      const rate = (onGround ? 2100 : 1200) * dt;
      vx += clamp(target * maxV - vx, -rate, rate);
      if (target === 0 && onGround) vx *= Math.max(0, 1 - 10 * dt);

      if (pad.jumpEdge) jumpBuf = 0.13;
      else jumpBuf = Math.max(0, jumpBuf - dt);
      if (onGround) coyote = 0.12;
      else coyote = Math.max(0, coyote - dt);
      if (jumpBuf > 0 && coyote > 0) {
        vy = -610;
        onGround = false;
        groundId = 0;
        coyote = 0;
        jumpBuf = 0;
        squash = 1.16;
        sfx.jump();
      }
      if (!pad.jump && vy < 0) vy += -vy * Math.min(1, dt * 4.6);
      const g = vy > 50 ? 2500 : 1500;
      vy = Math.min(920, vy + g * dt);

      const hw = 13;
      const ph = 56;
      x += vx * dt;
      x = clamp(x, 16, LEVEL_W - 16);
      for (const p of PLATS) {
        const px = platX(p, time);
        const left = x - hw;
        const right = x + hw;
        const top = y - ph;
        const bottom = y;
        const hit = right > px && left < px + p.w && bottom > p.y && top < p.y + p.h;
        if (!hit) continue;
        if (vx > 0 && x - hw < px + 8) {
          x = px - hw;
          vx = 0;
        } else if (vx < 0 && x + hw > px + p.w - 8) {
          x = px + p.w + hw;
          vx = 0;
        }
      }

      const prevBottom = y;
      y += vy * dt;
      let landed = false;
      let landedId = 0;
      let landedX = 0;
      let landY = 0;
      for (const p of PLATS) {
        const px = platX(p, time);
        const left = x - hw;
        const right = x + hw;
        const overlapX = right > px + 4 && left < px + p.w - 4;
        if (!overlapX) continue;
        if (vy >= 0 && prevBottom <= p.y + 10 && y >= p.y - 0.5) {
          if (!landed || p.y < landY) {
            landed = true;
            landedId = p.id;
            landedX = px;
            landY = p.y;
          }
        } else if (vy < 0) {
          const top = y - ph;
          if (top < p.y + p.h && prevBottom - ph >= p.y + p.h - 6 && right > px && left < px + p.w) {
            y = p.y + p.h + ph;
            vy = Math.max(0, vy);
          }
        }
      }
      if (landed) {
        if (!onGround) {
          squash = 0.78;
          sfx.land();
          burst(bits, x, landY, "land");
        }
        y = landY;
        vy = 0;
        onGround = true;
        groundId = landedId;
        prevMoverX = landedX;
      } else {
        onGround = false;
        groundId = 0;
      }

      for (let i = CPS.length - 1; i >= 0; i--) {
        const spot = CPS[i]!;
        if (x >= spot.x - 20) {
          cp = i;
          break;
        }
      }

      if (y > 700) hurt();

      if (iframe <= 0) {
        for (const g of GUARDS) {
          const gx = guardX(g, time);
          const overlap =
            x + hw > gx - 16 &&
            x - hw < gx + 16 &&
            y > g.y - 58 &&
            y - ph < g.y - 4;
          if (overlap) {
            hurt();
            break;
          }
        }
      }

      if (!over && x > GOAL.x && x < GOAL.x + GOAL.w + 30 && y <= 470 && y >= 400) {
        won = true;
        over = true;
        commit = true;
        sfx.win();
        trauma = Math.min(1, trauma + 0.4);
      }

      const focus = clamp(x + facing * 90 - 280, 0, LEVEL_W - VW);
      cam += (focus - cam) * (1 - Math.exp(-5 * dt));
    },
    draw(ctx) {
      const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const shake = shakeOffset(trauma, time, reduced);
      ctx.save();
      ctx.translate(shake.x + -cam, shake.y);
      fillArena(ctx);
      ctx.fillRect(cam - 20, 0, VW + 40, 540);
      ctx.fillStyle = palette.ink;
      ctx.fillRect(cam - 40, -20, VW + 80, 580);
      ctx.fillStyle = "rgba(247,242,232,0.05)";
      for (let i = 0; i < 12; i++) {
        ctx.fillRect(i * 300 + 40, 120 + (i % 4) * 18, 90, 220);
      }
      ctx.fillStyle = palette.bone;
      for (const p of PLATS) {
        const px = platX(p, time);
        ctx.globalAlpha = p.h > 40 ? 0.9 : 1;
        ctx.fillRect(px, p.y, p.w, p.h > 40 ? 8 : p.h);
        ctx.globalAlpha = 0.25;
        ctx.fillRect(px, p.y + (p.h > 40 ? 8 : p.h), p.w, 4);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = palette.signal;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(GOAL.x + 8, 460);
      ctx.lineTo(GOAL.x + 8, 400);
      ctx.stroke();
      ctx.fillStyle = palette.signal;
      ctx.beginPath();
      ctx.moveTo(GOAL.x + 8, 400);
      ctx.lineTo(GOAL.x + 36, 412);
      ctx.lineTo(GOAL.x + 8, 424);
      ctx.closePath();
      ctx.fill();
      drawStick(ctx, {
        x: GOAL.x + 8,
        y: 460,
        facing: -1,
        anim: "cheer",
        phase: 0,
        time,
        color: palette.bone,
      });

      for (const g of GUARDS) {
        const gx = guardX(g, time);
        const dir: 1 | -1 = Math.cos(time * g.speed + g.offset) > 0 ? 1 : -1;
        drawShadow(ctx, gx, g.y);
        drawStick(ctx, {
          x: gx,
          y: g.y,
          facing: dir,
          anim: "walk",
          phase: 0,
          time,
          color: palette.signal,
        });
      }

      if (iframe <= 0 || Math.sin(time * 28) > 0) {
        drawShadow(ctx, x, Math.min(y, 470));
        const anim = won ? "cheer" : !onGround ? (vy > 40 ? "fall" : "jump") : Math.abs(vx) > 20 ? "run" : "idle";
        drawStick(ctx, {
          x,
          y,
          facing,
          anim,
          phase: 0,
          time,
          color: palette.bone,
          flash,
          squash,
        });
      }
      drawBits(ctx, bits);
      ctx.restore();
    },
  };
}
