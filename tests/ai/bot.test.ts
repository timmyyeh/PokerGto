import { describe, it, expect } from 'vitest';
import { startHand, applyAction } from '@engine/gameState';
import { decideAction } from '@ai/bot';
import { freshDeck, stringToCard } from '@engine/deck';
import { Card } from '@shared/types';

const cs = (s: string) => stringToCard(s);

/**
 * Build a deterministic deck where each seat receives the intended hole cards.
 * Engine deals cards in orderFromButton([sorted seats], buttonSeat) order,
 * 2 rounds, starting AT the button seat.
 */
function buildRiggedDeck(
  holeCardsBySeat: Map<number, [Card, Card]>,
  buttonSeat: number,
  board: Card[] = []
): Card[] {
  const seats = Array.from(holeCardsBySeat.keys()).sort((a, b) => a - b);
  const btnIndex = seats.indexOf(buttonSeat);
  const dealOrder = Array.from(
    { length: seats.length },
    (_, i) => seats[(btnIndex + i) % seats.length]
  );
  const out: Card[] = [];
  for (let r = 0; r < 2; r++) {
    for (const s of dealOrder) out.push(holeCardsBySeat.get(s)![r]);
  }
  out.push(...board);
  const usedKeys = new Set(out.map((c) => `${c.rank}${c.suit}`));
  for (const c of freshDeck()) {
    if (!usedKeys.has(`${c.rank}${c.suit}`)) out.push(c);
  }
  return out;
}

describe('decideAction', () => {
  const baseSeeds = Array.from({ length: 8 }, (_, i) => ({
    seat: i,
    name: `P${i}`,
    isHero: false,
    stack: 200,
    personality: 'TAG' as const,
  }));

  it('TAG bot folds 72o from UTG preflop', () => {
    const hole = new Map<number, [Card, Card]>([
      [0, [cs('Ah'), cs('Kh')]],
      [1, [cs('2c'), cs('3d')]],
      [2, [cs('2h'), cs('3h')]],
      [3, [cs('7c'), cs('2h')]], // UTG seat 3 — terrible hand
      [4, [cs('5c'), cs('6d')]],
      [5, [cs('Ts'), cs('9c')]],
      [6, [cs('Jc'), cs('8c')]],
      [7, [cs('4d'), cs('4s')]],
    ]);
    const deck = buildRiggedDeck(hole, 0);
    const s = startHand(baseSeeds, { smallBlind: 1, bigBlind: 2, buttonSeat: 0, deck });
    expect(s.toAct).toBe(3);
    const action = decideAction(s);
    expect(action.type).toBe('fold');
  });

  it('TAG bot raises with AA from UTG preflop', () => {
    const hole = new Map<number, [Card, Card]>([
      [0, [cs('2c'), cs('3d')]],
      [1, [cs('4c'), cs('5d')]],
      [2, [cs('6c'), cs('7d')]],
      [3, [cs('Ah'), cs('Ad')]], // UTG with AA
      [4, [cs('Tc'), cs('Th')]],
      [5, [cs('Jc'), cs('Jh')]],
      [6, [cs('Qc'), cs('Qh')]],
      [7, [cs('Kc'), cs('Kh')]],
    ]);
    const deck = buildRiggedDeck(hole, 0);
    const s = startHand(baseSeeds, { smallBlind: 1, bigBlind: 2, buttonSeat: 0, deck });
    expect(s.toAct).toBe(3);
    const action = decideAction(s);
    expect(action.type).toBe('raise');
    expect(action.amount).toBeGreaterThan(2);
  });

  it('bot returns a legal action for every personality', () => {
    const personalities = ['TAG', 'LAG', 'Rock', 'Station', 'GTO'] as const;
    for (const p of personalities) {
      const seeds = baseSeeds.map((sd) => ({ ...sd, personality: p }));
      const s = startHand(seeds, { smallBlind: 1, bigBlind: 2, buttonSeat: 0 });
      while (s.street !== 'complete') {
        const action = decideAction(s);
        expect(['fold', 'check', 'call', 'bet', 'raise', 'allin']).toContain(action.type);
        applyAction(s, action);
      }
    }
  });

  it('short-stacked bot jams a premium instead of min-raising', () => {
    const shortSeeds = baseSeeds.map((sd) => ({ ...sd, stack: 16 })); // 8bb
    const hole = new Map<number, [Card, Card]>([
      [0, [cs('2c'), cs('3d')]],
      [1, [cs('4c'), cs('5d')]],
      [2, [cs('6c'), cs('7d')]],
      [3, [cs('Ah'), cs('Kh')]], // UTG with AKs
      [4, [cs('Tc'), cs('Th')]],
      [5, [cs('Jc'), cs('Jh')]],
      [6, [cs('Qc'), cs('Qh')]],
      [7, [cs('Kc'), cs('Kd')]],
    ]);
    const deck = buildRiggedDeck(hole, 0);
    const s = startHand(shortSeeds, { smallBlind: 1, bigBlind: 2, buttonSeat: 0, deck });
    expect(s.toAct).toBe(3);
    const action = decideAction(s, () => 0.01);
    expect(action.type).toBe('allin');
  });

  it('bot uses provided rng for determinism', () => {
    const seeds = baseSeeds.map((sd) => ({ ...sd, personality: 'LAG' as const }));
    const fixedRng = () => 0.5;
    const s = startHand(seeds, { smallBlind: 1, bigBlind: 2, buttonSeat: 0 });
    const a1 = decideAction(s, fixedRng);
    const a2 = decideAction(s, fixedRng);
    expect(a1).toEqual(a2);
  });
});
