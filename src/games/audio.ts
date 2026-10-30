let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(ctx.destination);
  }
  return ctx;
}

export function unlockAudio() {
  const ac = ensure();
  if (ac && ac.state === "suspended") void ac.resume();
}

export function resumeAudio() {
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

export function setMuted(next: boolean) {
  muted = next;
  if (!master || !ctx) return;
  master.gain.setTargetAtTime(next ? 0 : 0.7, ctx.currentTime, 0.02);
}

export function isMuted() {
  return muted;
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, freq2?: number) {
  const ac = ctx;
  if (!ac || !master || muted) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  const rate = 1 + (Math.random() * 2 - 1) * 0.07;
  o.frequency.setValueAtTime(Math.max(40, freq * rate), ac.currentTime);
  if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq2), ac.currentTime + dur);
  g.gain.setValueAtTime(gain, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  o.connect(g);
  g.connect(master);
  o.start();
  o.stop(ac.currentTime + dur + 0.02);
  o.onended = () => {
    o.disconnect();
    g.disconnect();
  };
}

function noise(dur: number, gain: number, rate = 1) {
  const ac = ctx;
  if (!ac || !master || muted) return;
  if (!noiseBuf) {
    const frames = Math.floor(ac.sampleRate * 0.25);
    noiseBuf = ac.createBuffer(1, frames, ac.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = rate;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.6;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start();
  src.stop(ac.currentTime + dur);
  src.onended = () => {
    src.disconnect();
    filter.disconnect();
    g.disconnect();
  };
}

export const sfx = {
  jump() {
    tone(480, 0.09, "square", 0.05, 180);
  },
  land() {
    noise(0.06, 0.08, 0.6);
    tone(110, 0.07, "sine", 0.06, 60);
  },
  whoosh() {
    noise(0.08, 0.05, 1.4);
  },
  hit() {
    noise(0.09, 0.12, 0.8);
    tone(160, 0.12, "triangle", 0.1, 50);
  },
  block() {
    tone(720, 0.05, "square", 0.04, 400);
  },
  ko() {
    tone(220, 0.35, "sawtooth", 0.06, 45);
  },
  bow() {
    noise(0.12, 0.06, 1.8);
    tone(280, 0.14, "triangle", 0.05, 640);
  },
  point() {
    tone(660, 0.07, "square", 0.04, 880);
  },
  ui() {
    tone(520, 0.05, "sine", 0.04, 740);
  },
  win() {
    tone(523, 0.1, "triangle", 0.05);
    setTimeout(() => tone(659, 0.12, "triangle", 0.05), 90);
  },
  fail() {
    tone(180, 0.2, "sine", 0.06, 70);
  },
};
