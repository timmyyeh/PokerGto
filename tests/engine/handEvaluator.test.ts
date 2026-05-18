import { describe, it, expect } from 'vitest';
import { solveHand, pickWinners } from '@engine/handEvaluator';
import { stringToCard } from '@engine/deck';

const cs = (s: string) => stringToCard(s);

describe('handEvaluator', () => {
  it('identifies a flush', () => {
    const h = solveHand([cs('Ah'), cs('Kh')], [cs('5h'), cs('9h'), cs('2h'), cs('3d'), cs('4c')]);
    expect(h.name.toLowerCase()).toContain('flush');
  });

  it('picks the better straight at showdown', () => {
    // P1: 9-high straight, P2: T-high straight
    const winners = pickWinners(
      [
        { seat: 1, holeCards: [cs('5d'), cs('6d')] }, // 6,7,8,9,5... uses board 7,8,9; straight 5-9
        { seat: 2, holeCards: [cs('Tc'), cs('Jc')] }, // 7,8,9,T,J straight
      ],
      [cs('7s'), cs('8h'), cs('9d'), cs('2c'), cs('3h')]
    );
    expect(winners.map((w) => w.seat)).toEqual([2]);
  });

  it('split pot when both have same straight', () => {
    const winners = pickWinners(
      [
        { seat: 1, holeCards: [cs('Td'), cs('5c')] },
        { seat: 2, holeCards: [cs('Th'), cs('4c')] },
      ],
      [cs('Jh'), cs('Qd'), cs('Kc'), cs('Ah'), cs('2s')]
    );
    expect(winners.length).toBe(2);
  });
});
