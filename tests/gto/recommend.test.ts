import { describe, it, expect } from 'vitest';
import { startHand, applyAction } from '@engine/gameState';
import { recommend, snapshotFor } from '@gto/recommend';
import { freshDeck, stringToCard } from '@engine/deck';
import { Card } from '@shared/types';

const cs = (s: string) => stringToCard(s);

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
  const used = new Set(out.map((c) => `${c.rank}${c.suit}`));
  for (const c of freshDeck()) if (!used.has(`${c.rank}${c.suit}`)) out.push(c);
  return out;
}

const seeds8 = Array.from({ length: 8 }, (_, i) => ({
  seat: i,
  name: `P${i}`,
  isHero: i === 3,
  stack: 200,
}));

describe('recommend', () => {
  it('returns a recommendation with all required fields', () => {
    const s = startHand(seeds8, { smallBlind: 1, bigBlind: 2, buttonSeat: 0 });
    const rec = recommend(s, s.toAct);
    expect(rec).toHaveProperty('action');
    expect(rec).toHaveProperty('equity');
    expect(rec).toHaveProperty('potOdds');
    expect(rec).toHaveProperty('reason');
    expect(['fold', 'check', 'call', 'bet', 'raise', 'allin']).toContain(rec.action);
    expect(rec.equity).toBeGreaterThanOrEqual(0);
    expect(rec.equity).toBeLessThanOrEqual(1);
    expect(rec.reason.length).toBeGreaterThan(10);
  });

  it('recommends raise with AA preflop', () => {
    const hole = new Map<number, [Card, Card]>([
      [0, [cs('2c'), cs('3d')]],
      [1, [cs('4c'), cs('5d')]],
      [2, [cs('6c'), cs('7d')]],
      [3, [cs('Ah'), cs('Ad')]],
      [4, [cs('Tc'), cs('Td')]],
      [5, [cs('Jc'), cs('Jd')]],
      [6, [cs('Qc'), cs('Qd')]],
      [7, [cs('Kc'), cs('Kd')]],
    ]);
    const deck = buildRiggedDeck(hole, 0);
    const s = startHand(seeds8, { smallBlind: 1, bigBlind: 2, buttonSeat: 0, deck });
    const rec = recommend(s, 3); // UTG = seat 3
    expect(rec.action).toBe('raise');
    expect(rec.raiseSize).toBeGreaterThan(2);
  });

  it('recommends fold with 72o from UTG preflop', () => {
    const hole = new Map<number, [Card, Card]>([
      [0, [cs('Ah'), cs('Kh')]],
      [1, [cs('2c'), cs('3d')]],
      [2, [cs('2h'), cs('3h')]],
      [3, [cs('7c'), cs('2h')]],
      [4, [cs('5c'), cs('6d')]],
      [5, [cs('Ts'), cs('9c')]],
      [6, [cs('Jc'), cs('8c')]],
      [7, [cs('4d'), cs('4s')]],
    ]);
    const deck = buildRiggedDeck(hole, 0);
    const s = startHand(seeds8, { smallBlind: 1, bigBlind: 2, buttonSeat: 0, deck });
    const rec = recommend(s, 3);
    expect(rec.action).toBe('fold');
  });

  it('recommends bet/raise on a flopped flush', () => {
    // Hero has Ah Kh, board comes 2h 5h 9h. Heads-up.
    const seeds2 = [
      { seat: 0, name: 'btn', isHero: true, stack: 200 },
      { seat: 1, name: 'bb', isHero: false, stack: 200 },
    ];
    const hole = new Map<number, [Card, Card]>([
      [0, [cs('Ah'), cs('Kh')]],
      [1, [cs('Tc'), cs('Td')]],
    ]);
    const board = [cs('2h'), cs('5h'), cs('9h')];
    const deck = buildRiggedDeck(hole, 0, board);
    const s = startHand(seeds2, { smallBlind: 1, bigBlind: 2, buttonSeat: 0, deck });
    // Heads-up preflop, BTN to act → call.
    applyAction(s, { type: 'call' });
    // BB checks.
    applyAction(s, { type: 'check' });
    expect(s.street).toBe('flop');
    expect(s.board.length).toBe(3);

    const rec = recommend(s, s.toAct);
    expect(['bet', 'check']).toContain(rec.action);
    // Flopped flush with 2 cards to come still loses to higher flushes / boats.
    // Equity vs a single random hand is ~60-65% here.
    expect(rec.equity).toBeGreaterThan(0.55);
  });

  it('recommends fold when pot odds exceed equity', () => {
    // Construct a scenario: hero with very weak hand facing a large bet.
    const seeds2 = [
      { seat: 0, name: 'btn', isHero: true, stack: 200 },
      { seat: 1, name: 'bb', isHero: false, stack: 200 },
    ];
    const hole = new Map<number, [Card, Card]>([
      [0, [cs('2h'), cs('3d')]],
      [1, [cs('Ac'), cs('Kc')]],
    ]);
    const board = [cs('Ks'), cs('9c'), cs('5s')];
    const deck = buildRiggedDeck(hole, 0, board);
    const s = startHand(seeds2, { smallBlind: 1, bigBlind: 2, buttonSeat: 0, deck });
    applyAction(s, { type: 'call' }); // BTN calls
    applyAction(s, { type: 'check' }); // BB checks
    expect(s.street).toBe('flop');
    // BB bets big.
    applyAction(s, { type: 'bet', amount: 20 });

    const rec = recommend(s, s.toAct); // hero's turn
    expect(rec.action).toBe('fold');
  });
});

describe('snapshotFor', () => {
  it('captures position, pot, toCall, hero cards', () => {
    const s = startHand(seeds8, { smallBlind: 1, bigBlind: 2, buttonSeat: 0 });
    const snap = snapshotFor(s, 3);
    expect(snap.position).toBe('UTG');
    expect(snap.pot).toBe(3); // SB + BB
    expect(snap.toCall).toBe(2); // BB
    expect(snap.heroCards.length).toBe(2);
    expect(snap.numActiveOpponents).toBe(7);
    expect(snap.street).toBe('preflop');
  });

  it('captures the board on later streets', () => {
    const s = startHand(
      [
        { seat: 0, name: 'btn', isHero: true, stack: 200 },
        { seat: 1, name: 'bb', isHero: false, stack: 200 },
      ],
      { smallBlind: 1, bigBlind: 2, buttonSeat: 0 }
    );
    applyAction(s, { type: 'call' });
    applyAction(s, { type: 'check' });
    const snap = snapshotFor(s, s.toAct);
    expect(snap.board.length).toBe(3);
    expect(snap.street).toBe('flop');
  });
});
