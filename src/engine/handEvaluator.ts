import { Hand, SolvedHand } from 'pokersolver';
import { Card } from '@shared/types';
import { cardsToStrings } from './deck';

export type { SolvedHand };

export function solveHand(holeCards: Card[], board: Card[]): SolvedHand {
  const all = cardsToStrings([...holeCards, ...board]);
  return Hand.solve(all);
}

export type WinnerResult = {
  seat: number;
  hand: SolvedHand;
};

/** Returns the seat indices that win at showdown among the given contenders. */
export function pickWinners(
  contenders: { seat: number; holeCards: Card[] }[],
  board: Card[]
): WinnerResult[] {
  const solved = contenders.map((c) => ({
    seat: c.seat,
    hand: solveHand(c.holeCards, board),
  }));
  const winningHands = Hand.winners(solved.map((s) => s.hand));
  return solved.filter((s) => winningHands.includes(s.hand));
}
