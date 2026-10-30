import { sfx } from "@/games/audio";
import { burst, decayTrauma, drawBits, shakeOffset, stepBits, type Bit } from "@/games/bits";
import { clamp, palette, VW } from "@/games/palette";
import { drawGround, drawShadow, drawStick, fillArena, hpBar } from "@/games/stick";
import type { Frame, Hud, Pad, Sim } from "@/games/types";

const GROUND = 458;
const GRAV = 1750;
const GRAV_FALL = 2400;
const MOVE = 246;
const JUMP = -570;

type State = "idle" | "run" | "jump" | "punch" | "kick" | "block" | "hurt" | "ko";

type Fighter = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  state: State;
  stateT: number;
  attackHit: boolean;
  onGround: boolean;
  coyote: number;
  jumpBuf: number;
  flash: number;
  squash: number;
  think: number;
  cmd: string;
  prevCmd: string;
  iframe: number;
  attackCd: number;
};

const dur: Partial<Record<State, number>> = { punch: 0.32, kick: 0.46, hurt: 0.3, ko: 0.7 };

function makeFighter(x: number, facing: 1 | -1): Fighter {
  return {
    x,
    y: GROUND,
    vx: 0,
    vy: 0,
    facing,
    hp: 100,
    state: "idle",
    stateT: 0,
    attackHit: false,
    onGround: true,
    coyote: 0.1,
    jumpBuf: 0,
    flash: 0,
    squash: 1,
    think: 0.8,
    cmd: "idle",
    prevCmd: "idle",
    iframe: 0.6,
    attackCd: 0,
  };
}

function control(f: Fighter, pad: Pad, faceTo: number | null, dt: number, bits: Bit[]) {
  if (f.state === "ko") {
    f.stateT += dt;
    f.vy += GRAV * dt;
    f.y += f.vy * dt;
    if (f.y > GROUND) {
      f.y = GROUND;
      f.vy = 0;
    }
    f.flash = Math.max(0, f.flash - dt);
    return;
  }

  f.flash = Math.max(0, f.flash - dt * 3);
  f.squash += (1 - f.squash) * Math.min(1, dt * 9);
  f.iframe = Math.max(0, f.iframe - dt);
  f.attackCd = Math.max(0, f.attackCd - dt);

  const timed = dur[f.state];
  if (timed) {
    f.stateT += dt;
    if (f.stateT >= timed) {
      f.state = f.onGround ? "idle" : "jump";
      f.stateT = 0;
    }
  }

  const busy = f.state === "punch" || f.state === "kick" || f.state === "hurt";

  if (!busy) {
    if (pad.block && f.onGround) f.state = "block";
    else if (f.state === "block") f.state = "idle";
    if (f.state !== "block" && f.attackCd <= 0) {
      if (pad.punchEdge) {
        f.state = "punch";
        f.stateT = 0;
        f.attackHit = false;
        f.attackCd = 0.42;
        sfx.whoosh();
      } else if (pad.kickEdge) {
        f.state = "kick";
        f.stateT = 0;
        f.attackHit = false;
        f.attackCd = 0.55;
        sfx.whoosh();
      }
    }
  }

  let mx = 0;
  if (!busy && f.state !== "block") {
    if (pad.left) mx -= 1;
    if (pad.right) mx += 1;
  }
  const target = mx * (f.onGround ? MOVE : MOVE * 0.86);
  const rate = (f.onGround ? 2400 : 1300) * dt;
  f.vx += clamp(target - f.vx, -rate, rate);
  if (mx === 0 && f.onGround && !busy) f.vx *= Math.max(0, 1 - 9 * dt);

  if (pad.jumpEdge) f.jumpBuf = 0.12;
  else f.jumpBuf = Math.max(0, f.jumpBuf - dt);
  if (f.onGround) f.coyote = 0.1;
  else f.coyote = Math.max(0, f.coyote - dt);

  if (f.jumpBuf > 0 && f.coyote > 0 && f.state !== "hurt") {
    f.vy = JUMP;
    f.onGround = false;
    f.coyote = 0;
    f.jumpBuf = 0;
    f.squash = 1.16;
    if (f.state === "idle" || f.state === "run" || f.state === "block") f.state = "jump";
    sfx.jump();
  }
  if (!pad.jump && f.vy < 0) f.vy += (-f.vy) * Math.min(1, dt * 5);

  const g = f.vy > 60 ? GRAV_FALL : GRAV;
  f.vy = Math.min(920, f.vy + g * dt);
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  if (f.y >= GROUND) {
    if (!f.onGround && f.vy > 180) {
      f.squash = 0.76;
      sfx.land();
      burst(bits, f.x, GROUND, "land");
    }
    f.y = GROUND;
    f.vy = 0;
    f.onGround = true;
    if (f.state === "jump") f.state = "idle";
  } else {
    f.onGround = false;
    if (f.state === "idle" || f.state === "run") f.state = "jump";
  }
  f.x = clamp(f.x, 50, VW - 50);

  if (!busy && f.state !== "block") {
    if (faceTo != null) {
      if (faceTo > f.x + 6) f.facing = 1;
      else if (faceTo < f.x - 6) f.facing = -1;
    } else if (mx !== 0) f.facing = mx > 0 ? 1 : -1;
  }
  if (f.onGround && (f.state === "idle" || f.state === "run")) {
    f.state = Math.abs(f.vx) > 28 ? "run" : "idle";
  }
}

function tryHit(att: Fighter, def: Fighter, bits: Bit[], juice: { freeze: number; trauma: number }) {
  if (att.attackHit || att.state === "ko" || def.state === "ko" || def.iframe > 0) return;
  if (att.state !== "punch" && att.state !== "kick") return;
  const total = dur[att.state] ?? 1;
  const phase = att.stateT / total;
  const active = att.state === "punch" ? phase > 0.28 && phase < 0.52 : phase > 0.3 && phase < 0.55;
  if (!active) return;
  const reach = att.state === "punch" ? 56 : 74;
  const hx = att.x + att.facing * reach;
  const hy = att.state === "punch" ? att.y - 44 : att.y - 22;
  const spots = [
    { x: def.x, y: def.y - 64, r: 16 },
    { x: def.x, y: def.y - 34, r: 20 },
  ];
  const hit = spots.some((s) => (s.x - hx) ** 2 + (s.y - hy) ** 2 < (s.r + 16) ** 2);
  if (!hit) return;
  att.attackHit = true;
  const blocking = def.state === "block" && def.facing === (att.facing === 1 ? -1 : 1);
  if (blocking) {
    def.hp = Math.max(0, def.hp - 2);
    def.vx = att.facing * 90;
    att.vx = -att.facing * 50;
    def.iframe = 0.12;
    sfx.block();
    juice.freeze = Math.max(juice.freeze, 0.03);
    juice.trauma = Math.min(1, juice.trauma + 0.18);
    return;
  }
  const dmg = att.state === "punch" ? 8 : 13;
  def.hp = Math.max(0, def.hp - dmg);
  def.flash = 0.16;
  def.iframe = 0.38;
  def.vx = att.facing * (att.state === "kick" ? 260 : 160);
  def.vy = att.state === "kick" ? -200 : -90;
  def.onGround = false;
  def.state = def.hp <= 0 ? "ko" : "hurt";
  def.stateT = 0;
  sfx.hit();
  burst(bits, hx, hy, def.hp <= 0 ? "ko" : "hit");
  juice.freeze = Math.max(juice.freeze, def.hp <= 0 ? 0.1 : 0.055);
  juice.trauma = Math.min(1, juice.trauma + (def.hp <= 0 ? 0.85 : att.state === "kick" ? 0.48 : 0.32));
  if (def.hp <= 0) sfx.ko();
}

function aiPad(cpu: Fighter, you: Fighter, dt: number): Pad {
  cpu.think -= dt;
  if (cpu.think <= 0) {
    cpu.think = 0.38 + Math.random() * 0.45;
    cpu.prevCmd = cpu.cmd;
    const dx = you.x - cpu.x;
    const dist = Math.abs(dx);
    const attacking = you.state === "punch" || you.state === "kick";
    if (you.iframe > 0.05) cpu.cmd = dx > 0 ? "left" : "right";
    else if (attacking && dist < 130 && Math.random() < 0.45) cpu.cmd = "block";
    else if (dist < 78 && cpu.attackCd <= 0 && Math.random() < 0.72) cpu.cmd = Math.random() < 0.5 ? "kick" : "punch";
    else if (dist < 140 && Math.random() < 0.22) cpu.cmd = "jump";
    else if (dist < 100 && Math.random() < 0.35) cpu.cmd = dx > 0 ? "left" : "right";
    else cpu.cmd = dx > 0 ? "right" : "left";
  }
  const edge = cpu.cmd !== cpu.prevCmd;
  if (edge) cpu.prevCmd = cpu.cmd;
  const none: Pad = {
    left: false,
    right: false,
    down: false,
    jump: false,
    punch: false,
    kick: false,
    block: false,
    jumpEdge: false,
    punchEdge: false,
    kickEdge: false,
  };
  if (cpu.cmd === "left") none.left = true;
  if (cpu.cmd === "right") none.right = true;
  if (cpu.cmd === "block") none.block = true;
  if (cpu.cmd === "jump") {
    none.jump = true;
    none.jumpEdge = edge;
  }
  if (cpu.cmd === "punch") {
    none.punch = true;
    none.punchEdge = edge;
  }
  if (cpu.cmd === "kick") {
    none.kick = true;
    none.kickEdge = edge;
  }
  return none;
}

function animOf(f: Fighter): { anim: "idle" | "run" | "jump" | "fall" | "punch" | "kick" | "block" | "hurt" | "ko"; phase: number } {
  if (f.state === "ko") return { anim: "ko", phase: Math.min(1, f.stateT / 0.45) };
  if (f.state === "punch") return { anim: "punch", phase: f.stateT / 0.32 };
  if (f.state === "kick") return { anim: "kick", phase: f.stateT / 0.46 };
  if (f.state === "hurt") return { anim: "hurt", phase: Math.min(1, f.stateT / 0.3) };
  if (f.state === "block") return { anim: "block", phase: 0 };
  if (f.state === "jump") return { anim: f.vy > 50 ? "fall" : "jump", phase: 0 };
  if (f.state === "run") return { anim: "run", phase: 0 };
  return { anim: "idle", phase: 0 };
}

export function createDuel(): Sim {
  let you = makeFighter(280, 1);
  let rival = makeFighter(680, -1);
  let time = 0;
  let freeze = 0;
  let trauma = 0;
  let bits: Bit[] = [];
  let streak = 0;
  let roundsYou = 0;
  let roundsRival = 0;
  let banner = 0;
  let bannerText = "";
  let over = false;
  let won = false;
  let commit = false;
  let lastVersus = false;
  let matchOver = false;

  function resetRound() {
    const keepYou = you.facing;
    const keepRival = rival.facing;
    you = makeFighter(300, keepYou);
    rival = makeFighter(660, keepRival);
    you.facing = 1;
    rival.facing = -1;
  }

  function fullReset() {
    streak = 0;
    roundsYou = 0;
    roundsRival = 0;
    over = false;
    won = false;
    matchOver = false;
    banner = 0;
    resetRound();
  }

  return {
    restart: fullReset,
    debug: () => ({ x: you.x, y: you.y, vx: you.vx }),
    pointer() {},
    hud(): Hud {
      const score = lastVersus ? roundsYou : streak;
      const snapshot: Hud = {
        kicker: lastVersus ? "Local match · first to 3" : "Win streak",
        left: lastVersus ? `You ${roundsYou}` : `You ${Math.ceil(you.hp)}`,
        right: lastVersus ? `Them ${roundsRival}` : `Rival ${Math.ceil(rival.hp)}`,
        sub: banner > 0 ? bannerText : lastVersus ? "N punch · M kick · B block" : "J punch · K kick · L block",
        over: over || matchOver,
        won,
        overTitle: won ? "Yard is yours" : "Down you go",
        overBody: lastVersus
          ? won
            ? "You took the match."
            : "They took the match."
          : won
            ? `Streak ${streak}. That rival stayed down.`
            : `Streak ended at ${streak}.`,
        score,
        commit,
      };
      commit = false;
      return snapshot;
    },
    step(dt, frame) {
      if (frame.versus !== lastVersus) {
        lastVersus = frame.versus;
        fullReset();
      }
      time += dt;
      trauma = decayTrauma(trauma, dt, false);
      stepBits(bits, dt);
      if (over || matchOver) return;
      if (freeze > 0) {
        freeze = Math.max(0, freeze - dt);
        return;
      }
      const juice = { freeze: 0, trauma };
      const youPad = frame.p1;
      const rivalPad = frame.versus ? frame.p2 : aiPad(rival, you, dt);
      control(you, youPad, rival.x, dt, bits);
      control(rival, rivalPad, you.x, dt, bits);
      const dx = rival.x - you.x;
      const dist = Math.abs(dx);
      if (dist < 40 && dist > 0.01) {
        const push = (40 - dist) / 2;
        const s = Math.sign(dx) || 1;
        you.x -= s * push;
        rival.x += s * push;
      }
      tryHit(you, rival, bits, juice);
      tryHit(rival, you, bits, juice);
      freeze = juice.freeze;
      trauma = juice.trauma;

      const ko = you.hp <= 0 || rival.hp <= 0;
      if (ko && banner <= 0 && you.state !== "hurt" && rival.state !== "hurt") {
        banner = 1.15;
        if (you.hp <= 0 && rival.hp <= 0) bannerText = "Double fall";
        else if (you.hp > 0) {
          bannerText = "Knockout";
          if (frame.versus) roundsYou += 1;
          else {
            streak += 1;
            commit = true;
          }
          sfx.win();
        } else {
          bannerText = "Knockout";
          if (frame.versus) roundsRival += 1;
          sfx.fail();
        }
      }
      if (banner > 0 && ko) {
        banner -= dt;
        if (banner <= 0) {
          if (frame.versus) {
            if (roundsYou >= 3 || roundsRival >= 3) {
              matchOver = true;
              won = roundsYou > roundsRival;
              commit = false;
            } else resetRound();
          } else if (you.hp <= 0) {
            over = true;
            won = false;
          } else resetRound();
        }
      }
    },
    draw(ctx) {
      const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const shake = shakeOffset(trauma, time, reduced);
      ctx.save();
      ctx.translate(shake.x, shake.y);
      ctx.translate(VW / 2, 270);
      ctx.rotate(shake.rot);
      ctx.translate(-VW / 2, -270);
      fillArena(ctx);
      ctx.strokeStyle = "rgba(226,59,40,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(480, GROUND - 6, 150, 18, 0, 0, Math.PI * 2);
      ctx.stroke();
      const crowd = [90, 170, 790, 870];
      crowd.forEach((x, i) => {
        drawShadow(ctx, x, GROUND, 0.6);
        drawStick(ctx, {
          x,
          y: GROUND,
          facing: x < 480 ? 1 : -1,
          scale: 0.62,
          anim: i % 2 === 0 ? "cheer" : "idle",
          phase: 0,
          time: time + i,
          color: palette.bone,
          alpha: 0.35,
        });
      });
      drawGround(ctx, GROUND);
      for (const f of [you, rival]) drawShadow(ctx, f.x, GROUND);
      const order = you.x < rival.x ? [you, rival] : [rival, you];
      for (const f of order) {
        const spec = animOf(f);
        const color = f === you ? palette.bone : palette.signal;
        drawStick(ctx, {
          x: f.x,
          y: f.y,
          facing: f.facing,
          anim: spec.anim,
          phase: spec.phase,
          time,
          color,
          flash: f.flash,
          squash: f.squash,
        });
        hpBar(ctx, f.x, f.y - 92, f.hp, color);
      }
      drawBits(ctx, bits);
      if (banner > 0) {
        ctx.fillStyle = palette.bone;
        ctx.font = "700 72px Teko, Impact, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(bannerText.toUpperCase(), 480, 150);
      }
      ctx.restore();
    },
  };
}
