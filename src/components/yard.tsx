import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isMuted, resumeAudio, setMuted, sfx, unlockAudio } from "@/games/audio";
import { clearHolds, forceKeys, pokeJump, readInput, setHold, setInputVersus, type HoldName } from "@/games/input";
import { bindInput } from "@/games/input";
import { palette, VH, VW } from "@/games/palette";
import { commitScore, loadScores, type ScoreMap } from "@/games/scores";
import { drawGround, drawShadow, drawStick, fillArena, type StickAnim } from "@/games/stick";
import { createDash } from "@/games/dash";
import { createDraw } from "@/games/archery";
import { createDuel } from "@/games/duel";
import { createRoof } from "@/games/roof";
import type { GameId, Hud, Sim } from "@/games/types";

type Card = {
  id: GameId;
  name: string;
  blurb: string;
  anim: StickAnim;
  hint: string;
  best: (n: number) => string;
};

const CARDS: Card[] = [
  {
    id: "duel",
    name: "Duel",
    blurb: "Trade punches until one stick falls.",
    anim: "punch",
    hint: "A/D move · W jump · J punch · K kick · L block. Friend: arrows, N, M, B.",
    best: (n) => (n > 0 ? `Best streak ${n}` : "No streak yet"),
  },
  {
    id: "dash",
    name: "Dash",
    blurb: "Jump the blockers. Slide the leapers.",
    anim: "run",
    hint: "Space or tap jumps. S or Down slides. You only run forward.",
    best: (n) => (n > 0 ? `Best ${n} m` : "No run yet"),
  },
  {
    id: "draw",
    name: "Draw",
    blurb: "Pull, loose, drop a stick. Heads pay more.",
    anim: "draw",
    hint: "Drag from the bow to aim. Farther pull, harder shot. Release to loose.",
    best: (n) => (n > 0 ? `Best ${n} pts` : "No score yet"),
  },
  {
    id: "roof",
    name: "Roof",
    blurb: "Cross the roofs. Reach the waving stick.",
    anim: "jump",
    hint: "A left · D right · W or Space jumps. Tap the roof to hop.",
    best: (n) => (n > 0 ? `Best ${n}` : "Flag still waiting"),
  },
];

const emptyHud = (id: GameId): Hud => ({
  kicker: CARDS.find((c) => c.id === id)?.name ?? "",
  left: "—",
  right: "—",
  sub: "",
  over: false,
  won: false,
  overTitle: "",
  overBody: "",
  score: 0,
  commit: false,
});

function makeSim(id: GameId): Sim {
  if (id === "duel") return createDuel();
  if (id === "dash") return createDash();
  if (id === "draw") return createDraw();
  return createRoof();
}

function hudKey(h: Hud) {
  return `${h.kicker}|${h.left}|${h.right}|${h.sub}|${h.over}|${h.won}|${h.overTitle}|${h.overBody}`;
}

declare global {
  interface Window {
    __yard?: {
      game: GameId | null;
      debug: () => { x: number; y: number; vx: number };
      setKeys: (codes: string[]) => void;
    };
  }
}

export function Yard() {
  const [game, setGame] = useState<GameId | null>(null);
  const [scores, setScores] = useState<ScoreMap>({ duel: 0, dash: 0, draw: 0, roof: 0 });
  const [muted, setMute] = useState(false);
  const [versus, setVersus] = useState(false);
  const [hud, setHud] = useState<Hud>(emptyHud("duel"));
  const [paused, setPaused] = useState(false);
  const simRef = useRef<Sim | null>(null);
  const versusRef = useRef(false);
  const pausedRef = useRef(false);
  versusRef.current = versus;
  pausedRef.current = paused;

  useEffect(() => {
    setScores(loadScores());
    const stored = localStorage.getItem("stickyard-mute") === "1";
    setMute(stored);
    setMuted(stored);
    bindInput();
    const onVis = () => {
      if (document.visibilityState === "visible") resumeAudio();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  function openGame(id: GameId) {
    unlockAudio();
    sfx.ui();
    setVersus(false);
    setPaused(false);
    setHud(emptyHud(id));
    setGame(id);
  }

  function toggleMute() {
    unlockAudio();
    const next = !muted;
    setMute(next);
    setMuted(next);
    localStorage.setItem("stickyard-mute", next ? "1" : "0");
  }

  return (
    <div className={game ? "play" : "yard"}>
      <header className="topbar">
        <div className="brand">
          {game ? (
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                clearHolds();
                setGame(null);
                setPaused(false);
              }}
            >
              Back
            </button>
          ) : (
            <img src="/favicon.svg" alt="" width={40} height={40} />
          )}
          <div>
            <p className="eyebrow">{game ? "Stickyard" : "Stick figures only"}</p>
            <h1 className="word">{game ? CARDS.find((c) => c.id === game)?.name : "Stickyard"}</h1>
          </div>
        </div>
        <div className="row">
          {game === "duel" ? (
            <button
              type="button"
              className="versus"
              data-on={versus ? "true" : "false"}
              onClick={() => {
                unlockAudio();
                setVersus((v) => !v);
              }}
            >
              {versus ? "Vs friend" : "Vs rival"}
            </button>
          ) : null}
          <button type="button" className="icon-btn" aria-label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
            {muted || isMuted() ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </div>
      </header>

      {game ? (
        <Play
          game={game}
          hud={hud}
          paused={paused}
          simRef={simRef}
          versusRef={versusRef}
          pausedRef={pausedRef}
          onHud={setHud}
          onPause={setPaused}
          onScores={() => setScores(loadScores())}
        />
      ) : (
        <main className="hub">
          <Hero />
          <div className="grid">
            {CARDS.map((card) => (
              <button key={card.id} type="button" className="card" onClick={() => openGame(card.id)}>
                <Mini anim={card.anim} />
                <span>
                  <h2>{card.name}</h2>
                  <p>{card.blurb}</p>
                  <div className="best">{card.best(scores[card.id])}</div>
                </span>
              </button>
            ))}
          </div>
        </main>
      )}
    </div>
  );
}

function Play({
  game,
  hud,
  paused,
  simRef,
  versusRef,
  pausedRef,
  onHud,
  onPause,
  onScores,
}: {
  game: GameId;
  hud: Hud;
  paused: boolean;
  simRef: MutableRefObject<Sim | null>;
  versusRef: MutableRefObject<boolean>;
  pausedRef: MutableRefObject<boolean>;
  onHud: (hud: Hud) => void;
  onPause: (next: boolean | ((p: boolean) => boolean)) => void;
  onScores: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const card = CARDS.find((c) => c.id === game)!;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sim = makeSim(game);
    simRef.current = sim;
    let acc = 0;
    let last = performance.now();
    let raf = 0;
    let tick = 0;
    let seen = "";
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setInputVersus(versusRef.current);
      const frame = readInput();
      if (frame.pauseEdge) onPause((p) => !p);
      if (!pausedRef.current) {
        acc += dt;
        let first = true;
        let steps = 0;
        while (acc >= 1 / 60 && steps < 5) {
          const blank = {
            ...frame.p1,
            jumpEdge: false,
            punchEdge: false,
            kickEdge: false,
          };
          const blank2 = {
            ...frame.p2,
            jumpEdge: false,
            punchEdge: false,
            kickEdge: false,
          };
          sim.step(1 / 60, first ? frame : { ...frame, p1: blank, p2: blank2, pauseEdge: false });
          first = false;
          acc -= 1 / 60;
          steps += 1;
        }
      }
      const ctx = canvas.getContext("2d");
      if (ctx) paint(canvas, ctx, sim);
      tick += 1;
      if (tick % 5 === 0) {
        const next = sim.hud();
        if (next.commit && commitScore(game, next.score)) onScores();
        const key = hudKey(next);
        if (key !== seen) {
          seen = key;
          onHud(next);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    window.__yard = {
      game,
      debug: () => sim.debug(),
      setKeys: forceKeys,
    };
    return () => {
      cancelAnimationFrame(raf);
      clearHolds();
      simRef.current = null;
    };
    // Loop owns the sim for this game. Callbacks are stable enough; refs carry pause/versus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  function onPointer(phase: "down" | "move" | "up", event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    if (phase === "down") {
      unlockAudio();
      event.currentTarget.setPointerCapture(event.pointerId);
      if (game === "dash" || game === "roof") pokeJump();
    }
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / VW, rect.height / VH);
    const ox = (rect.width - VW * scale) / 2;
    const oy = (rect.height - VH * scale) / 2;
    const x = (event.clientX - rect.left - ox) / (scale || 1);
    const y = (event.clientY - rect.top - oy) / (scale || 1);
    sim.pointer(phase, x, y);
  }

  return (
    <>
      <div className="hud">
        <div className="hud-side">
          <p className="hud-kicker">{hud.kicker}</p>
          <p className="hud-num">{hud.left}</p>
        </div>
        <p className="hud-sub">{hud.sub}</p>
        <div className="hud-side" style={{ textAlign: "right" }}>
          <p className="hud-kicker">Now</p>
          <p className="hud-num">{hud.right}</p>
        </div>
      </div>
      <div className="stage">
        <canvas
          ref={canvasRef}
          aria-label={`${card.name} playfield`}
          onPointerDown={(e) => onPointer("down", e)}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) onPointer("move", e);
          }}
          onPointerUp={(e) => onPointer("up", e)}
          onPointerCancel={(e) => onPointer("up", e)}
        />
        {paused || hud.over ? (
          <div className="veil">
            <h3>{paused && !hud.over ? "Paused" : hud.overTitle}</h3>
            <p>{paused && !hud.over ? "P resumes." : hud.overBody}</p>
            <div className="row">
              {paused && !hud.over ? (
                <button type="button" className="btn" onClick={() => onPause(false)}>
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    unlockAudio();
                    simRef.current?.restart();
                    onPause(false);
                  }}
                >
                  Again
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
      <Touch game={game} />
      <p className="keys">{card.hint}</p>
    </>
  );
}

function paint(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, sim: Sim) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const bw = Math.max(1, Math.round(rect.width * dpr));
  const bh = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const scale = Math.min(bw / VW, bh / VH);
  const ox = (bw - VW * scale) / 2;
  const oy = (bh - VH * scale) / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = palette.ink;
  ctx.fillRect(0, 0, bw, bh);
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  sim.draw(ctx);
}

function Touch({ game }: { game: GameId }) {
  if (game === "draw") {
    return (
      <div className="touchbar draw">
        <p className="keys" style={{ display: "block", padding: "0.2rem 0.4rem 0" }}>
          Drag on the range. Release to shoot.
        </p>
      </div>
    );
  }
  if (game === "dash") {
    return (
      <div className="touchbar dash">
        <Hold name="down" label="Slide">
          Slide
        </Hold>
        <Hold name="jump" label="Jump" primary>
          Jump
        </Hold>
      </div>
    );
  }
  if (game === "roof") {
    return (
      <div className="touchbar roof">
        <Hold name="left" label="Left">
          Left
        </Hold>
        <Hold name="right" label="Right">
          Right
        </Hold>
        <Hold name="jump" label="Jump" primary>
          Jump
        </Hold>
      </div>
    );
  }
  return (
    <div className="touchbar duel">
      <Hold name="left" label="Left">
        Left
      </Hold>
      <Hold name="right" label="Right">
        Right
      </Hold>
      <Hold name="jump" label="Jump" primary>
        Jump
      </Hold>
      <Hold name="punch" label="Punch">
        Punch
      </Hold>
      <Hold name="kick" label="Kick">
        Kick
      </Hold>
      <Hold name="block" label="Block">
        Block
      </Hold>
    </div>
  );
}

function Hold({ name, label, children, primary }: { name: HoldName; label: string; children: string; primary?: boolean }) {
  return (
    <button
      type="button"
      className={primary ? "hold primary" : "hold"}
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        unlockAudio();
        setHold(name, true);
      }}
      onPointerUp={(event) => {
        setHold(name, false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => setHold(name, false)}
    >
      {children}
    </button>
  );
}

function Mini({ anim }: { anim: StickAnim }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth || 104;
      const h = canvas.clientHeight || 104;
      const bw = Math.max(1, Math.round(w * dpr));
      const bh = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = palette.ink;
      ctx.fillRect(0, 0, w, h);
      const t = (now - start) / 1000;
      drawGround(ctx, h * 0.86, 8, w - 8);
      drawShadow(ctx, w * 0.55, h * 0.86, 0.7);
      drawStick(ctx, {
        x: w * 0.55,
        y: h * 0.86,
        facing: anim === "draw" ? 1 : -1,
        scale: Math.min(w, h) / 150,
        anim,
        phase: (Math.sin(t * 2) + 1) / 2,
        time: t,
        aim: -0.5,
        color: anim === "run" || anim === "jump" ? palette.bone : palette.signal,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [anim]);
  return <canvas ref={ref} aria-hidden="true" />;
}

function Hero() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth || 320;
      const h = canvas.clientHeight || 160;
      const bw = Math.max(1, Math.round(w * dpr));
      const bh = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fillArena(ctx);
      ctx.fillRect(0, 0, w, h);
      const t = (now - start) / 1000;
      const ground = h * 0.82;
      const punch = (t % 2.4) / 2.4;
      drawGround(ctx, ground, 0, w);
      drawShadow(ctx, w * 0.38, ground);
      drawShadow(ctx, w * 0.66, ground);
      drawStick(ctx, {
        x: w * 0.38,
        y: ground,
        facing: 1,
        scale: h / 220,
        anim: punch > 0.45 && punch < 0.75 ? "punch" : "idle",
        phase: punch > 0.45 ? (punch - 0.45) / 0.3 : 0,
        time: t,
        color: palette.bone,
      });
      drawStick(ctx, {
        x: w * 0.66,
        y: ground,
        facing: -1,
        scale: h / 220,
        anim: punch > 0.62 && punch < 0.85 ? "hurt" : "block",
        phase: 0.4,
        time: t,
        color: palette.signal,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="hero">
      <canvas ref={ref} aria-hidden="true" />
      <div className="hero-copy">
        <p>Four games. Nobody has a face.</p>
      </div>
    </div>
  );
}
