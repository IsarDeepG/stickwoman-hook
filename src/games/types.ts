export type GameId = "duel" | "dash" | "draw" | "roof";

export type Pad = {
  left: boolean;
  right: boolean;
  down: boolean;
  jump: boolean;
  punch: boolean;
  kick: boolean;
  block: boolean;
  jumpEdge: boolean;
  punchEdge: boolean;
  kickEdge: boolean;
};

export type Frame = {
  p1: Pad;
  p2: Pad;
  versus: boolean;
  pauseEdge: boolean;
};

export type Hud = {
  kicker: string;
  left: string;
  right: string;
  sub: string;
  over: boolean;
  won: boolean;
  overTitle: string;
  overBody: string;
  score: number;
  commit: boolean;
};

export type Sim = {
  step(dt: number, frame: Frame): void;
  draw(ctx: CanvasRenderingContext2D): void;
  hud(): Hud;
  pointer(phase: "down" | "move" | "up", x: number, y: number): void;
  restart(): void;
  debug(): { x: number; y: number; vx: number };
};
