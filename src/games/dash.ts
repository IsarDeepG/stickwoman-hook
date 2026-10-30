import { sfx } from "@/games/audio";
import { burst, decayTrauma, drawBits, shakeOffset, stepBits, type Bit } from "@/games/bits";
import { clamp, palette, VW } from "@/games/palette";
import { drawGround, drawShadow, drawStick, fillArena } from "@/games/stick";
import type { Frame, Hud, Sim } from "@/games/types";

const GROUND = 458;
const PX = 214;
const GRAV = 1680;
const GRAV_FALL = 2680;
const JUMP = -640;

type Kind = "stand" | "hover" | "gap";
type Ob = { x: number; kind: Kind; w: number };

function makeStart(): Ob[] {
  return [
    { x: 560, kind: "stand", w: 36 },
    { x: 980, kind: "hover", w: 78 },
    { x: 1420, kind: "gap", w: 108 },
  ];
}

export function createDash(): Sim {
  let y = GROUND;
  let vy = 0;
  let onGround = true;
  let coyote = 0.1;
  let jumpBuf = 0;
  let sliding = false;
  let squash = 1;
  let flash = 0;
  let dist = 0;
  let dead = false;
  let deadT = 0;
  let over = false;
  let time = 0;
  let trauma = 0;
  let bits: Bit[] = [];
  let obs = makeStart();
  let commit = false;
  let facing: 1 | -1 = 1;

  function reset() {
    y = GROUND;
    vy = 0;
    onGround = true;
    coyote = 0.1;
    jumpBuf = 0;
    sliding = false;
    squash = 1;
    flash = 0;
    dist = 0;
    dead = false;
    deadT = 0;
    over = false;
    trauma = 0;
    bits = [];
    obs = makeStart();
    commit = false;
  }

  function meters() {
    return Math.floor(dist / 42);
  }

  function speed() {
    return 300 + Math.min(240, dist * 0.035);
  }

  function spawn(fromX: number) {
    const last = obs[obs.length - 1];
    const gap = 300 + Math.random() * 160;
    const x = Math.max(fromX, (last ? last.x + last.w : VW) + gap);
    const roll = Math.random();
    const prev = last?.kind;
    let kind: Kind = roll < 0.42 ? "stand" : roll < 0.74 ? "hover" : "gap";
    if (kind === "gap" && prev === "gap") kind = "stand";
    if (kind === "hover" && prev === "hover") kind = "stand";
    const w = kind === "gap" ? 96 + Math.random() * 36 : kind === "hover" ? 74 : 36;
    obs.push({ x, kind, w });
  }

  return {
    restart: reset,
    debug: () => ({ x: PX, y, vx: dead ? 0 : speed() }),
    pointer() {},
    hud(): Hud {
      const score = meters();
      const snapshot: Hud = {
        kicker: "Distance",
        left: `${score} m`,
        right: dead ? "Down" : "Running",
        sub: "Jump the standers. Slide the leapers.",
        over,
        won: false,
        overTitle: "Face first",
        overBody: `${score} metres. The yard keeps going.`,
        score,
        commit,
      };
      commit = false;
      return snapshot;
    },
    step(dt, frame) {
      time += dt;
      trauma = decayTrauma(trauma, dt, false);
      stepBits(bits, dt);
      squash += (1 - squash) * Math.min(1, dt * 9);
      flash = Math.max(0, flash - dt * 3);
      if (over) return;
      if (dead) {
        deadT += dt;
        y += 220 * dt;
        if (deadT > 0.55) over = true;
        return;
      }

      const pad = frame.p1;
      if (pad.jumpEdge) jumpBuf = 0.13;
      else jumpBuf = Math.max(0, jumpBuf - dt);

      const wantSlide = pad.down && onGround && !pad.jump;
      if (pad.jumpEdge) sliding = false;
      else sliding = wantSlide;

      if (onGround) coyote = 0.11;
      else coyote = Math.max(0, coyote - dt);

      if (jumpBuf > 0 && coyote > 0) {
        vy = JUMP;
        onGround = false;
        coyote = 0;
        jumpBuf = 0;
        sliding = false;
        squash = 1.18;
        sfx.jump();
      }
      if (!pad.jump && vy < 0) vy += -vy * Math.min(1, dt * 5.2);

      const g = vy > 40 ? GRAV_FALL : GRAV;
      vy = Math.min(980, vy + g * dt);

      const spd = speed();
      dist += spd * dt;
      for (const o of obs) o.x -= spd * dt;
      obs = obs.filter((o) => o.x + o.w > -80);
      const far = obs.reduce((m, o) => Math.max(m, o.x + o.w), 0);
      if (far < VW + 80) spawn(VW + 40);

      const overGap = obs.some((o) => o.kind === "gap" && PX > o.x + 6 && PX < o.x + o.w - 6);
      y += vy * dt;
      if (!overGap && y >= GROUND && vy >= 0) {
        if (!onGround && vy > 160) {
          squash = 0.74;
          sfx.land();
          burst(bits, PX, GROUND, "land");
        }
        y = GROUND;
        vy = 0;
        onGround = true;
      } else if (y < GROUND) onGround = false;

      if (overGap && y >= GROUND && vy >= 0) onGround = false;

      const h = sliding ? 30 : 64;
      const box = { l: PX - 15, r: PX + 15, t: y - h, b: y - 2 };
      let hit = false;
      for (const o of obs) {
        if (o.kind === "gap") continue;
        const rect =
          o.kind === "stand"
            ? { l: o.x, r: o.x + 32, t: GROUND - 60, b: GROUND - 6 }
            : { l: o.x, r: o.x + o.w, t: GROUND - 112, b: GROUND - 46 };
        const overlap = box.r > rect.l && box.l < rect.r && box.b > rect.t && box.t < rect.b;
        if (overlap) hit = true;
      }
      if (y > GROUND + 150) hit = true;
      if (hit) {
        dead = true;
        deadT = 0;
        flash = 0.2;
        trauma = 0.7;
        sfx.fail();
        burst(bits, PX, y - 30, "ko");
        commit = true;
      } else if (meters() > 0) {
        commit = true;
      }
    },
    draw(ctx) {
      const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const shake = shakeOffset(trauma, time, reduced);
      ctx.save();
      ctx.translate(shake.x, shake.y);
      fillArena(ctx);
      ctx.fillStyle = "rgba(247,242,232,0.04)";
      for (let i = 0; i < 8; i++) {
        const bx = ((i * 180 - dist * 0.15) % (VW + 180)) - 40;
        ctx.fillRect(bx, 80 + (i % 3) * 16, 70, 180);
      }
      for (const o of obs) {
        if (o.kind !== "gap") continue;
        ctx.fillStyle = palette.ink;
        ctx.fillRect(o.x, GROUND + 3, o.w, 78);
      }
      drawGround(ctx, GROUND, 0, VW);
      for (const o of obs) {
        if (o.kind === "gap") {
          ctx.strokeStyle = palette.signal;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(o.x, GROUND);
          ctx.lineTo(o.x + o.w, GROUND);
          ctx.stroke();
          continue;
        }
        if (o.kind === "stand") {
          const sx = o.x + 16;
          drawShadow(ctx, sx, GROUND, 0.8);
          drawStick(ctx, {
            x: sx,
            y: GROUND,
            facing: -1,
            anim: "block",
            phase: 0,
            time,
            color: palette.signal,
          });
        } else {
          const sx = o.x + o.w * 0.5;
          drawStick(ctx, {
            x: sx,
            y: GROUND - 52,
            facing: -1,
            anim: "hover",
            phase: 0,
            time,
            color: palette.signal,
            scale: 0.95,
          });
        }
      }
      drawShadow(ctx, PX, Math.min(y, GROUND), sliding ? 1.3 : 1);
      const anim = dead ? "ko" : !onGround ? (vy > 40 ? "fall" : "jump") : sliding ? "slide" : "run";
      drawStick(ctx, {
        x: PX,
        y: dead ? y : y,
        facing,
        anim,
        phase: dead ? Math.min(1, deadT / 0.45) : 0,
        time,
        color: palette.bone,
        flash,
        squash,
      });
      drawBits(ctx, bits);
      ctx.restore();
    },
  };
}
