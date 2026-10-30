import type { GameId } from "@/games/types";

export type ScoreMap = Record<GameId, number>;

const KEY = "stickyard-v1";

const empty = (): ScoreMap => ({ duel: 0, dash: 0, draw: 0, roof: 0 });

export function loadScores(): ScoreMap {
  if (typeof localStorage === "undefined") return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<ScoreMap>;
    const base = empty();
    (Object.keys(base) as GameId[]).forEach((id) => {
      const n = parsed[id];
      if (typeof n === "number" && Number.isFinite(n) && n > 0) base[id] = Math.floor(n);
    });
    return base;
  } catch {
    return empty();
  }
}

/** Returns true when the stored best changes. */
export function commitScore(id: GameId, score: number): boolean {
  if (!Number.isFinite(score) || score <= 0) return false;
  const all = loadScores();
  const next = Math.floor(score);
  if (next <= all[id]) return false;
  all[id] = next;
  localStorage.setItem(KEY, JSON.stringify({ version: 1, ...all }));
  return true;
}
