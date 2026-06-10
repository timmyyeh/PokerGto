import { Card } from '@shared/types';
import { freshDeck, cardToString } from '@engine/deck';
import { Hand } from 'pokersolver';
import { WeightedCombo } from './ranges';

/**
 * Monte Carlo equity vs *random* hands. Kept as the fallback when no range
 * information exists; the coach uses `equityVsCombos` with modeled ranges.
 */
export function monteCarloEquity(
  hero: Card[],
  board: Card[],
  numOpponents: number,
  iterations = 800
): number {
  if (hero.length !== 2) throw new Error('hero must have 2 hole cards');
  if (numOpponents < 1) return 1;

  const usedKeys = new Set<string>();
  for (const c of [...hero, ...board]) usedKeys.add(`${c.rank}${c.suit}`);

  const available = freshDeck().filter((c) => !usedKeys.has(`${c.rank}${c.suit}`));

  const heroStr = hero.map(cardToString);
  const boardStr = board.map(cardToString);

  let wins = 0;
  let ties = 0;

  for (let i = 0; i < iterations; i++) {
    // Shuffle a copy of available cards using Fisher-Yates.
    const pool = available.slice();
    for (let j = pool.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [pool[j], pool[k]] = [pool[k], pool[j]];
    }

    let cursor = 0;
    const oppHands: string[][] = [];
    for (let o = 0; o < numOpponents; o++) {
      oppHands.push([cardToString(pool[cursor++]), cardToString(pool[cursor++])]);
    }
    const fillBoard = boardStr.slice();
    while (fillBoard.length < 5) {
      fillBoard.push(cardToString(pool[cursor++]));
    }

    const heroSolved = Hand.solve([...heroStr, ...fillBoard]);
    const oppSolved = oppHands.map((h) => Hand.solve([...h, ...fillBoard]));
    const allHands = [heroSolved, ...oppSolved];
    const winners = Hand.winners(allHands);
    if (winners.includes(heroSolved)) {
      if (winners.length === 1) wins++;
      else ties++;
    }
  }

  return (wins + ties / 2) / iterations;
}

/**
 * Range-aware Monte Carlo equity: each villain's hand is sampled from their
 * weighted combo range (card-conflict aware), then the board is completed
 * and showdowns are counted. Ties award fractional wins.
 */
export function equityVsCombos(
  hero: Card[],
  board: Card[],
  villains: WeightedCombo[][],
  iterations = 600
): number {
  if (hero.length !== 2) throw new Error('hero must have 2 hole cards');
  if (villains.length === 0) return 1;

  const baseUsed = new Set<string>();
  for (const c of [...hero, ...board]) baseUsed.add(`${c.rank}${c.suit}`);

  const available = freshDeck().filter((c) => !baseUsed.has(`${c.rank}${c.suit}`));
  const heroStr = hero.map(cardToString);
  const boardStr = board.map(cardToString);

  // Prefix sums per villain for O(log n) weighted sampling.
  const cumulative = villains.map((combos) => {
    const sums = new Array<number>(combos.length);
    let acc = 0;
    for (let i = 0; i < combos.length; i++) {
      acc += Math.max(0, combos[i].weight);
      sums[i] = acc;
    }
    return { sums, total: acc };
  });

  const sample = (vi: number, used: Set<string>): [Card, Card] | null => {
    const combos = villains[vi];
    const { sums, total } = cumulative[vi];
    if (combos.length === 0 || total <= 0) return null;
    for (let attempt = 0; attempt < 24; attempt++) {
      const target = Math.random() * total;
      let lo = 0;
      let hi = sums.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sums[mid] < target) lo = mid + 1;
        else hi = mid;
      }
      const [c1, c2] = combos[lo].cards;
      const k1 = `${c1.rank}${c1.suit}`;
      const k2 = `${c2.rank}${c2.suit}`;
      if (!used.has(k1) && !used.has(k2)) {
        used.add(k1);
        used.add(k2);
        return [c1, c2];
      }
    }
    return null;
  };

  let wins = 0;
  let ties = 0;

  for (let i = 0; i < iterations; i++) {
    const used = new Set(baseUsed);
    const oppHands: string[][] = [];
    const pool = available.slice();
    for (let j = pool.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [pool[j], pool[k]] = [pool[k], pool[j]];
    }
    let cursor = 0;
    const drawFromPool = (): Card => {
      while (cursor < pool.length) {
        const c = pool[cursor++];
        if (!used.has(`${c.rank}${c.suit}`)) {
          used.add(`${c.rank}${c.suit}`);
          return c;
        }
      }
      throw new Error('deck exhausted');
    };

    for (let vi = 0; vi < villains.length; vi++) {
      const combo = sample(vi, used) ?? [drawFromPool(), drawFromPool()];
      oppHands.push([cardToString(combo[0]), cardToString(combo[1])]);
    }

    const fillBoard = boardStr.slice();
    while (fillBoard.length < 5) fillBoard.push(cardToString(drawFromPool()));

    const heroSolved = Hand.solve([...heroStr, ...fillBoard]);
    const oppSolved = oppHands.map((h) => Hand.solve([...h, ...fillBoard]));
    const winners = Hand.winners([heroSolved, ...oppSolved]);
    if (winners.includes(heroSolved)) {
      if (winners.length === 1) wins++;
      else ties++;
    }
  }

  return (wins + ties / 2) / iterations;
}
