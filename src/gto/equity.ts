import { Card } from '@shared/types';
import { freshDeck, cardToString } from '@engine/deck';
import { Hand } from 'pokersolver';

/**
 * Monte Carlo equity: probability hero wins (ties count as fractional wins)
 * against `numOpponents` random hands, given hero's hole cards and the current board.
 *
 * For an MVP we treat opponents as having random hands (no range filtering).
 * The interface is identical to a future range-aware version.
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
