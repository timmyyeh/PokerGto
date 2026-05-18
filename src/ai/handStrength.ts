import { Card, Rank, Street } from '@shared/types';
import { solveHand } from '@engine/handEvaluator';

const RANK_VALUE: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

/** Preflop strength 0..1 using a Chen-like formula. */
export function preflopStrength(hole: Card[]): number {
  if (hole.length !== 2) return 0;
  const [a, b] = hole;
  const high = Math.max(RANK_VALUE[a.rank], RANK_VALUE[b.rank]);
  const low = Math.min(RANK_VALUE[a.rank], RANK_VALUE[b.rank]);
  const isPair = a.rank === b.rank;
  const isSuited = a.suit === b.suit;
  const gap = high - low;

  let score = 0;
  if (isPair) {
    // pairs: 22→3, AA→20 roughly
    score = high * 2;
    if (high < 5) score += 1;
  } else {
    score = high;
    if (high === 14) score += 4; // bonus for ace
  }
  if (isSuited) score += 2;
  // gap penalty
  if (!isPair) {
    if (gap === 1) score += 1; // connected
    else if (gap === 2) score += 0; // 1-gap
    else if (gap === 3) score -= 2;
    else score -= Math.min(4, gap);
  }
  // Normalize: range roughly -4..28 → clamp to 0..1
  const normalized = Math.max(0, Math.min(1, (score + 4) / 32));
  return normalized;
}

/** Identify made hand class postflop. Returns 0..1. */
export function postflopStrength(hole: Card[], board: Card[]): number {
  if (board.length < 3) return preflopStrength(hole);
  const h = solveHand(hole, board);
  // pokersolver hand ranks: 1 = high card, 9 = straight flush
  const rankToScore: Record<number, number> = {
    1: 0.1,  // high card
    2: 0.3,  // pair
    3: 0.5,  // two pair
    4: 0.65, // three of a kind
    5: 0.75, // straight
    6: 0.8,  // flush
    7: 0.9,  // full house
    8: 0.95, // four of a kind
    9: 0.99, // straight flush
  };
  let base = rankToScore[h.rank] ?? 0.1;

  // Add a small bonus for draws (flush draw / open-ended straight) when on flop/turn.
  if (board.length <= 4) {
    if (hasFlushDraw(hole, board)) base = Math.max(base, 0.4);
    if (hasOpenEnder(hole, board)) base = Math.max(base, 0.35);
  }
  return base;
}

export function strengthFor(hole: Card[], board: Card[], street: Street): number {
  if (street === 'preflop') return preflopStrength(hole);
  return postflopStrength(hole, board);
}

function hasFlushDraw(hole: Card[], board: Card[]): boolean {
  const all = [...hole, ...board];
  const counts: Record<string, number> = { s: 0, h: 0, d: 0, c: 0 };
  for (const c of all) counts[c.suit]++;
  return Object.values(counts).some((v) => v === 4);
}

function hasOpenEnder(hole: Card[], board: Card[]): boolean {
  const all = [...hole, ...board];
  const ranks = new Set(all.map((c) => RANK_VALUE[c.rank]));
  // Also treat A as 1 for wheel.
  if (ranks.has(14)) ranks.add(1);
  const sorted = Array.from(ranks).sort((a, b) => a - b);
  for (let i = 0; i <= sorted.length - 4; i++) {
    if (
      sorted[i + 1] === sorted[i] + 1 &&
      sorted[i + 2] === sorted[i] + 2 &&
      sorted[i + 3] === sorted[i] + 3
    ) {
      return true;
    }
  }
  return false;
}
