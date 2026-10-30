import type { Frame, Pad } from "@/games/types";

const GAME_KEYS = new Set([
  "Space",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
]);

const keys = new Set<string>();

export type HoldName = "left" | "right" | "up" | "down" | "jump" | "punch" | "kick" | "block";

const virtual: Record<HoldName, boolean> = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  punch: false,
  kick: false,
  block: false,
};

let tapJump = false;
let bound = false;
let versus = false;

const last = {
  p1Jump: false,
  p1Punch: false,
  p1Kick: false,
  p2Jump: false,
  p2Punch: false,
  p2Kick: false,
  pause: false,
};

function emptyPad(): Pad {
  return {
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
}

export function pokeJump() {
  tapJump = true;
}

export function bindInput() {
  if (bound || typeof window === "undefined") return;
  bound = true;
  const down = (e: KeyboardEvent) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (GAME_KEYS.has(e.code)) e.preventDefault();
  };
  const up = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };
  window.addEventListener("keydown", down, { passive: false });
  window.addEventListener("keyup", up);
  window.addEventListener("blur", clearTransient);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearTransient();
  });
}

function clearTransient() {
  keys.clear();
  (Object.keys(virtual) as HoldName[]).forEach((k) => {
    virtual[k] = false;
  });
}

export function setHold(name: HoldName, value: boolean) {
  virtual[name] = value;
}

export function clearHolds() {
  clearTransient();
}

export function setInputVersus(next: boolean) {
  versus = next;
}

/** QA hook — replaces the held key set until the next call. */
export function forceKeys(codes: string[]) {
  keys.clear();
  for (const code of codes) keys.add(code);
}

export function readInput(): Frame {
  const arrowsForP1 = !versus;
  const p1 = emptyPad();
  p1.left = keys.has("KeyA") || (arrowsForP1 && keys.has("ArrowLeft")) || virtual.left;
  p1.right = keys.has("KeyD") || (arrowsForP1 && keys.has("ArrowRight")) || virtual.right;
  p1.down = keys.has("KeyS") || (arrowsForP1 && keys.has("ArrowDown")) || virtual.down;
  const p1Up =
    keys.has("KeyW") ||
    keys.has("Space") ||
    (arrowsForP1 && keys.has("ArrowUp")) ||
    virtual.jump ||
    virtual.up ||
    tapJump;
  tapJump = false;
  p1.jump = p1Up;
  p1.punch = keys.has("KeyJ") || keys.has("KeyZ") || virtual.punch;
  p1.kick = keys.has("KeyK") || keys.has("KeyX") || virtual.kick;
  p1.block = keys.has("KeyL") || keys.has("KeyC") || virtual.block;
  p1.jumpEdge = p1.jump && !last.p1Jump;
  p1.punchEdge = p1.punch && !last.p1Punch;
  p1.kickEdge = p1.kick && !last.p1Kick;

  const p2 = emptyPad();
  if (versus) {
    p2.left = keys.has("ArrowLeft");
    p2.right = keys.has("ArrowRight");
    p2.down = keys.has("ArrowDown");
    p2.jump = keys.has("ArrowUp");
    p2.punch = keys.has("KeyN");
    p2.kick = keys.has("KeyM");
    p2.block = keys.has("KeyB");
    p2.jumpEdge = p2.jump && !last.p2Jump;
    p2.punchEdge = p2.punch && !last.p2Punch;
    p2.kickEdge = p2.kick && !last.p2Kick;
  }

  const pause = keys.has("KeyP") || keys.has("Escape");
  const pauseEdge = pause && !last.pause;

  last.p1Jump = p1.jump;
  last.p1Punch = p1.punch;
  last.p1Kick = p1.kick;
  last.p2Jump = p2.jump;
  last.p2Punch = p2.punch;
  last.p2Kick = p2.kick;
  last.pause = pause;

  return { p1, p2, versus, pauseEdge };
}
