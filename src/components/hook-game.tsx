import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isMuted, resumeAudio, setMuted, sfx, unlockAudio } from "@/games/audio";
import { palette, VH, VW } from "@/games/palette";
import { RAZORPAY_LABEL, RAZORPAY_URL } from "@/games/pay";

type HookPt = { x: number; y: number; amp: number; speed: number };
type Spring = { x: number; y: number };
type Course = {
  name: string;
  width: number;
  start: { x: number; y: number };
  goal: { x: number; y: number };
  hooks: HookPt[];
  springs: Spring[];
};

const COURSES: Course[] = [
  {
    name: "First swing",
    width: 2600,
    start: { x: 200, y: 240 },
    goal: { x: 2320, y: 210 },
    hooks: [
      { x: 280, y: 140, amp: 0, speed: 0 },
      { x: 680, y: 96, amp: 0, speed: 0 },
      { x: 1020, y: 150, amp: 0, speed: 0 },
      { x: 1360, y: 100, amp: 0, speed: 0 },
      { x: 1700, y: 148, amp: 0, speed: 0 },
      { x: 2040, y: 108, amp: 0, speed: 0 },
      { x: 2340, y: 140, amp: 0, speed: 0 },
    ],
    springs: [{ x: 1180, y: 448 }],
  },
  {
    name: "High line",
    width: 3000,
    start: { x: 190, y: 250 },
    goal: { x: 2680, y: 180 },
    hooks: [
      { x: 360, y: 140, amp: 0, speed: 0 },
      { x: 720, y: 78, amp: 34, speed: 1.2 },
      { x: 1080, y: 160, amp: 0, speed: 0 },
      { x: 1440, y: 88, amp: 0, speed: 0 },
      { x: 1800, y: 70, amp: 26, speed: 1.5 },
      { x: 2140, y: 150, amp: 0, speed: 0 },
      { x: 2460, y: 96, amp: 0, speed: 0 },
      { x: 2720, y: 130, amp: 0, speed: 0 },
    ],
    springs: [
      { x: 900, y: 448 },
      { x: 1980, y: 448 },
    ],
  },
];

const GRAV = 1680;
const REACH = 400;
const GROUND = 470;

function hookAt(h: HookPt, time: number) {
  return { x: h.x + Math.sin(time * h.speed) * h.amp, y: h.y };
}

type Run = {
  course: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hold: boolean;
  rope: number;
  hookIndex: number;
  hx: number;
  hy: number;
  attached: boolean;
  hair: number;
  time: number;
  cam: number;
  over: "none" | "fall" | "bell";
  settled: boolean;
  best: number;
  grace: number;
  sparks: { x: number; y: number; vx: number; vy: number; life: number }[];
};

function fresh(course: number, best: number): Run {
  const c = COURSES[course]!;
  return {
    course,
    x: c.start.x,
    y: c.start.y,
    vx: 30,
    vy: 0,
    hold: false,
    rope: 0,
    hookIndex: -1,
    hx: 0,
    hy: 0,
    attached: false,
    hair: 0.4,
    time: 0,
    cam: 0,
    over: "none",
    settled: false,
    best,
    grace: 0,
    sparks: [],
  };
}

function nearestHook(run: Run) {
  const course = COURSES[run.course]!;
  let best: { i: number; x: number; y: number; d: number } | null = null;
  for (let i = 0; i < course.hooks.length; i++) {
    const p = hookAt(course.hooks[i]!, run.time);
    const dx = p.x - run.x;
    const dy = p.y - run.y;
    const d = Math.hypot(dx, dy);
    if (d > REACH || d < 24) continue;
    if (dx < -50 && run.vx >= 0) continue;
    if (!best || d < best.d) best = { i, x: p.x, y: p.y, d };
  }
  return best;
}

function burst(run: Run) {
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6;
    run.sparks.push({
      x: run.x,
      y: run.y,
      vx: Math.cos(a) * 90,
      vy: Math.sin(a) * 90,
      life: 0.35,
    });
  }
}

function stepRun(run: Run, dt: number) {
  if (run.over !== "none") return;
  run.time += dt;
  const course = COURSES[run.course]!;
  run.grace = Math.max(0, run.grace - dt);

  if (run.hold && !run.attached && run.grace <= 0) {
    const hook = nearestHook(run);
    if (hook) {
      run.attached = true;
      run.hookIndex = hook.i;
      run.hx = hook.x;
      run.hy = hook.y;
      run.rope = Math.max(90, Math.min(hook.d, 250));
      burst(run);
      sfx.whoosh();
    }
  }
  if (!run.hold && run.attached) {
    run.attached = false;
    run.hookIndex = -1;
    burst(run);
    sfx.jump();
  }

  run.vy += GRAV * dt;
  run.x += run.vx * dt;
  run.y += run.vy * dt;

  if (run.attached && run.hookIndex >= 0) {
    const live = hookAt(course.hooks[run.hookIndex]!, run.time);
    run.hx = live.x;
    run.hy = live.y;
    const dx = run.x - live.x;
    const dy = run.y - live.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const vr = run.vx * nx + run.vy * ny;
    run.vx -= vr * nx;
    run.vy -= vr * ny;
    run.x = live.x + nx * run.rope;
    run.y = live.y + ny * run.rope;
  } else {
    run.vx *= 1 - Math.min(1, dt * 0.12);
  }

  const speed = Math.hypot(run.vx, run.vy);
  if (speed > 1100) {
    run.vx *= 1100 / speed;
    run.vy *= 1100 / speed;
  }

  for (const spring of course.springs) {
    if (Math.abs(run.x - spring.x) < 40 && run.y > spring.y - 36 && run.y < spring.y + 18 && run.vy > -20) {
      run.vy = -980;
      run.y = spring.y - 28;
      run.attached = false;
      run.hookIndex = -1;
      run.grace = 0.22;
      sfx.land();
    }
  }

  for (const spark of run.sparks) {
    spark.life -= dt;
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
  }
  run.sparks = run.sparks.filter((s) => s.life > 0);

  if (Math.hypot(run.x - course.goal.x, run.y - course.goal.y) < 52) {
    run.over = "bell";
    run.best = Math.max(run.best, run.course + 1);
    sfx.win();
  } else if (run.y > 640) {
    run.over = "fall";
    sfx.fail();
  }

  const focus = Math.max(0, Math.min(course.width - VW, run.x - 280));
  run.cam += (focus - run.cam) * (1 - Math.exp(-5 * dt));
  const aim = Math.atan2(run.vy, Math.abs(run.vx) < 8 ? 1 : run.vx);
  run.hair += (aim - run.hair) * Math.min(1, dt * 7);
}

function drawScene(ctx: CanvasRenderingContext2D, run: Run) {
  const course = COURSES[run.course]!;
  const sky = ctx.createLinearGradient(0, 0, 0, VH);
  sky.addColorStop(0, "#14110f");
  sky.addColorStop(0.55, "#1c1916");
  sky.addColorStop(1, "#2a221c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VW, VH);

  ctx.save();
  ctx.translate(-run.cam, 0);

  ctx.fillStyle = "rgba(247,242,232,0.09)";
  ctx.beginPath();
  ctx.arc(520 - run.cam * 0.05, 78, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  ctx.arc(536 - run.cam * 0.05, 70, 40, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(239,228,207,0.045)";
  for (let i = 0; i < 18; i++) {
    const bx = i * 190 - ((run.cam * 0.2) % 190);
    const h = 90 + (i % 5) * 28;
    ctx.fillRect(bx, GROUND - h, 54, h);
  }

  ctx.fillStyle = "rgba(28,25,22,0.55)";
  ctx.fillRect(-40, GROUND, course.width + 80, VH);
  ctx.strokeStyle = "rgba(239,228,207,0.55)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  ctx.lineTo(course.width, GROUND);
  ctx.stroke();

  for (const spring of course.springs) {
    ctx.strokeStyle = palette.signal;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const x = spring.x - 18 + i * 6;
      const y = spring.y - (i % 2 === 0 ? 0 : 16);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = palette.signal;
    ctx.beginPath();
    ctx.arc(spring.x, spring.y - 22, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < course.hooks.length; i++) {
    const p = hookAt(course.hooks[i]!, run.time);
    const hot = run.hookIndex === i;
    ctx.strokeStyle = hot ? palette.signal : palette.bone;
    ctx.lineWidth = hot ? 3.4 : 2.4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 12);
    ctx.lineTo(p.x, p.y - 28);
    ctx.stroke();
  }

  if (run.attached) {
    ctx.strokeStyle = palette.bone;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(run.hx, run.hy);
    ctx.lineTo(run.x, run.y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(226,59,40,0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(run.hx + 2, run.hy + 1);
    ctx.lineTo(run.x + 2, run.y + 1);
    ctx.stroke();
  }

  for (const spark of run.sparks) {
    ctx.globalAlpha = Math.max(0, spark.life / 0.35);
    ctx.fillStyle = palette.signal;
    ctx.fillRect(spark.x - 2, spark.y - 2, 4, 4);
    ctx.globalAlpha = 1;
  }

  drawWoman(ctx, run);

  ctx.fillStyle = palette.signal;
  ctx.beginPath();
  ctx.moveTo(course.goal.x - 14, course.goal.y - 8);
  ctx.quadraticCurveTo(course.goal.x, course.goal.y - 28, course.goal.x + 14, course.goal.y - 8);
  ctx.quadraticCurveTo(course.goal.x, course.goal.y + 16, course.goal.x - 14, course.goal.y - 8);
  ctx.fill();
  ctx.strokeStyle = palette.bone;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(course.goal.x, course.goal.y + 6);
  ctx.lineTo(course.goal.x, course.goal.y + 78);
  ctx.stroke();

  ctx.restore();
}

function drawWoman(ctx: CanvasRenderingContext2D, run: Run) {
  const toHook = run.attached ? Math.atan2(run.hy - run.y, run.hx - run.x) : -Math.PI / 2;
  const rot = run.attached ? toHook + Math.PI / 2 : run.vx * 0.00035;
  const kick = Math.sin(run.time * (run.attached ? 7 : 10));
  ctx.save();
  ctx.translate(run.x, run.y);
  ctx.rotate(rot);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 8;
  strokeBody(ctx, kick, run.attached);
  ctx.strokeStyle = palette.bone;
  ctx.lineWidth = 3.6;
  strokeBody(ctx, kick, run.attached);
  ctx.restore();
}

function strokeBody(ctx: CanvasRenderingContext2D, kick: number, attached: boolean) {
  const leg = attached ? kick * 12 : kick * 8;
  ctx.beginPath();
  if (attached) {
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 24);
  }
  ctx.moveTo(0, 54);
  ctx.lineTo(0, 86);
  ctx.moveTo(0, 62);
  ctx.lineTo(attached ? -26 : -18, 84 + kick * 6);
  ctx.moveTo(10, 34);
  ctx.quadraticCurveTo(32, 30, 40, 52 + (attached ? kick * 6 : 0));
  ctx.moveTo(0, 86);
  ctx.lineTo(-16, 112 + leg);
  ctx.lineTo(-8, 138 + leg);
  ctx.moveTo(0, 86);
  ctx.lineTo(16, 114 - leg);
  ctx.lineTo(10, 140 - leg * 0.5);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 40, 13, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = palette.signal;
  ctx.beginPath();
  ctx.moveTo(-16, 80);
  ctx.lineTo(16, 80);
  ctx.lineTo(0, 104);
  ctx.closePath();
  ctx.fill();
}

export function HookGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runRef = useRef<Run>(fresh(0, 0));
  const holdRef = useRef(false);
  const [hud, setHud] = useState("First swing");
  const [runs, setRuns] = useState(0);
  const [pay, setPay] = useState(false);
  const [muted, setMute] = useState(false);
  const [banner, setBanner] = useState("");

  useEffect(() => {
    const paid = localStorage.getItem("hook-paid") === "1";
    const seen = Number(localStorage.getItem("hook-runs") || "0");
    setRuns(seen);
    if (!paid && seen >= 2) setPay(true);
    setMute(localStorage.getItem("hook-mute") === "1");
    setMuted(localStorage.getItem("hook-mute") === "1");
    const onVis = () => {
      if (document.visibilityState === "visible") resumeAudio();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const probe = {
      hold(next: boolean) {
        holdRef.current = next;
      },
      state() {
        const run = runRef.current;
        return { x: run.x, y: run.y, vx: run.vx, vy: run.vy, attached: run.attached, over: run.over, course: run.course };
      },
    };
    (window as unknown as { __hook?: typeof probe }).__hook = probe;

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const run = runRef.current;
      run.hold = holdRef.current;
      if (!pay) stepRun(run, dt);
      const ctx = canvas.getContext("2d");
      if (ctx) {
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
        drawScene(ctx, run);
      }
      const course = COURSES[run.course]!;
      const label = `${course.name} · ${Math.max(0, Math.round(run.x / 10))} m`;
      setHud((prev) => (prev === label ? prev : label));
      if (run.over !== "none" && !run.settled) {
        run.settled = true;
        const nextRuns = Number(localStorage.getItem("hook-runs") || "0") + 1;
        localStorage.setItem("hook-runs", String(nextRuns));
        setRuns(nextRuns);
        setBanner(run.over === "bell" ? "Bell." : "Missed the line.");
        if (localStorage.getItem("hook-paid") !== "1" && nextRuns >= 2) setPay(true);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      delete (window as unknown as { __hook?: unknown }).__hook;
    };
  }, [pay]);

  function again() {
    unlockAudio();
    const run = runRef.current;
    const next = !pay && run.over === "bell" && run.course < COURSES.length - 1 ? run.course + 1 : run.course;
    runRef.current = fresh(pay ? 0 : next, run.best);
    holdRef.current = false;
    setBanner("");
    setPay(false);
  }

  return (
    <div className="hook">
      <header className="topbar">
        <div>
          <p className="eyebrow">Stickwoman</p>
          <h1 className="word">Hook</h1>
        </div>
        <div className="row">
          <p className="hud-num">{hud}</p>
          <button
            type="button"
            className="icon-btn"
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={() => {
              const next = !muted;
              setMute(next);
              setMuted(next);
              localStorage.setItem("hook-mute", next ? "1" : "0");
            }}
          >
            {muted || isMuted() ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </div>
      </header>
      <div className="stage">
        <canvas
          ref={canvasRef}
          aria-label="Stickwoman swinging between hooks"
          onPointerDown={(event) => {
            unlockAudio();
            holdRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={() => {
            holdRef.current = false;
          }}
          onPointerCancel={() => {
            holdRef.current = false;
          }}
        />
        {pay ? (
          <div className="veil">
            <h3>Two swings</h3>
            <p>The next lines unlock on Razorpay. {RAZORPAY_LABEL}.</p>
            <a
              className="btn"
              href={RAZORPAY_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => localStorage.setItem("hook-paid", "1")}
            >
              Pay on Razorpay
            </a>
            <button type="button" className="btn ghost" onClick={again}>
              Swing the first two again
            </button>
          </div>
        ) : banner ? (
          <div className="veil">
            <h3>{banner}</h3>
            <p>Hold anywhere. Let go to fly.</p>
            <button type="button" className="btn" onClick={again}>
              Again
            </button>
          </div>
        ) : null}
      </div>
      <p className="keys">Hold to catch a ring. Release to fly. Run {Math.min(runs, 2)} of 2.</p>
    </div>
  );
}
