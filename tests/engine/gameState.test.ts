import { describe, it, expect } from 'vitest';
import { startHand, applyAction, legalActions, getPlayer } from '@engine/gameState';
import { freshDeck } from '@engine/deck';

const seeds = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    seat: i,
    name: `P${i}`,
    isHero: i === 0,
    stack: 200,
  }));

describe('startHand', () => {
  it('posts blinds and deals 2 cards to each player', () => {
    const s = startHand(seeds(8), { smallBlind: 1, bigBlind: 2, buttonSeat: 0 });
    expect(s.pot).toBe(3);
    expect(getPlayer(s, 1).bet).toBe(1); // SB
    expect(getPlayer(s, 2).bet).toBe(2); // BB
    expect(getPlayer(s, 0).bet).toBe(0);
    s.players.forEach((p) => expect(p.holeCards.length).toBe(2));
    // first to act = seat after BB
    expect(s.toAct).toBe(3);
  });

  it('heads-up: BTN posts SB, other posts BB, BTN acts first preflop', () => {
    const s = startHand(seeds(2), { smallBlind: 1, bigBlind: 2, buttonSeat: 0 });
    expect(getPlayer(s, 0).bet).toBe(1); // BTN/SB
    expect(getPlayer(s, 1).bet).toBe(2); // BB
    expect(s.toAct).toBe(0);
  });
});

describe('betting round flow', () => {
  it('full hand: everyone folds to BB', () => {
    const s = startHand(seeds(8), { smallBlind: 1, bigBlind: 2, buttonSeat: 0 });
    // Seats 3..7, 0, 1 all fold; action ends when only BB is active.
    for (const seat of [3, 4, 5, 6, 7, 0, 1]) {
      expect(s.toAct).toBe(seat);
      applyAction(s, { type: 'fold' });
    }
    expect(s.street).toBe('complete');
    expect(s.winners).toEqual([2]);
    // BB had 200, posted 2, gets back 3 (pot)
    expect(getPlayer(s, 2).stack).toBe(200 - 2 + 3);
  });

  it('limped preflop, all check to river, showdown', () => {
    // Use a fixed deck so we have a deterministic showdown.
    const s = startHand(seeds(2), {
      smallBlind: 1,
      bigBlind: 2,
      buttonSeat: 0,
      deck: freshDeck(),
    });
    // BTN (seat 0) calls 1
    expect(s.toAct).toBe(0);
    applyAction(s, { type: 'call' });
    // BB checks
    expect(s.toAct).toBe(1);
    applyAction(s, { type: 'check' });
    expect(s.street).toBe('flop');

    // Postflop, BB acts first heads-up. Both check each street.
    for (const street of ['flop', 'turn', 'river']) {
      expect(s.street).toBe(street);
      applyAction(s, { type: 'check' });
      applyAction(s, { type: 'check' });
    }
    expect(s.street).toBe('complete');
    expect(s.winners.length).toBeGreaterThanOrEqual(1);
  });

  it('preflop raise reopens action to all who already acted', () => {
    const s = startHand(seeds(4), { smallBlind: 1, bigBlind: 2, buttonSeat: 0 });
    // toAct = seat 3 (UTG in 4-handed = first after BB)
    expect(s.toAct).toBe(3);
    applyAction(s, { type: 'call' }); // seat 3 calls 2
    expect(s.toAct).toBe(0); // BTN
    applyAction(s, { type: 'raise', amount: 8 }); // raise to 8 total
    expect(s.toAct).toBe(1); // SB
    applyAction(s, { type: 'fold' });
    expect(s.toAct).toBe(2); // BB
    applyAction(s, { type: 'fold' });
    expect(s.toAct).toBe(3); // back to UTG who must respond
    applyAction(s, { type: 'fold' });
    expect(s.street).toBe('complete');
    expect(s.winners).toEqual([0]);
  });

  it('legalActions reflects current state', () => {
    const s = startHand(seeds(8), { smallBlind: 1, bigBlind: 2, buttonSeat: 0 });
    const la = legalActions(s);
    expect(la.canFold).toBe(true);
    expect(la.canCheck).toBe(false); // there's a BB to call
    expect(la.canCall).toBe(true);
    expect(la.callAmount).toBe(2);
  });
});

describe('side pots', () => {
  it('side pot: short-stack all-in, two active players check down', () => {
    const players = [
      { seat: 0, name: 'short', isHero: false, stack: 50 },
      { seat: 1, name: 'med', isHero: false, stack: 200 },
      { seat: 2, name: 'big', isHero: false, stack: 200 },
    ];
    const s = startHand(players, { smallBlind: 1, bigBlind: 2, buttonSeat: 2 });
    // 3 players sorted [0,1,2], BTN=2 → SB=0, BB=1. First to act = BTN=2.
    expect(s.toAct).toBe(2);
    applyAction(s, { type: 'raise', amount: 50 });
    applyAction(s, { type: 'allin' }); // SB all-in
    applyAction(s, { type: 'call' }); // BB calls
    expect(s.street).toBe('flop');

    // Two active players (1 and 2) check down each street.
    for (const street of ['flop', 'turn', 'river']) {
      expect(s.street).toBe(street);
      applyAction(s, { type: 'check' });
      applyAction(s, { type: 'check' });
    }
    expect(s.street).toBe('complete');

    const totalStacks = s.players.reduce((sum, p) => sum + p.stack, 0);
    expect(totalStacks).toBe(50 + 200 + 200); // chips conserved
  });

  it('side pot: short-stack all-in vs two who continue to bet', () => {
    // Verify side pot math: short can only win the main pot (3 × 50 = 150),
    // the rest goes into a side pot between the two big stacks.
    const players = [
      { seat: 0, name: 'short', isHero: false, stack: 50 },
      { seat: 1, name: 'med', isHero: false, stack: 200 },
      { seat: 2, name: 'big', isHero: false, stack: 200 },
    ];
    const s = startHand(players, { smallBlind: 1, bigBlind: 2, buttonSeat: 2 });
    applyAction(s, { type: 'raise', amount: 50 }); // BTN raises to 50
    applyAction(s, { type: 'allin' }); // SB all-in 50
    applyAction(s, { type: 'call' }); // BB calls 50

    // Flop: BB bets 50, BTN calls 50. Now seat 1 contributed 100, seat 2 contributed 100, seat 0 stayed at 50.
    applyAction(s, { type: 'bet', amount: 50 });
    applyAction(s, { type: 'call' });
    // Turn: check check
    applyAction(s, { type: 'check' });
    applyAction(s, { type: 'check' });
    // River: check check
    applyAction(s, { type: 'check' });
    applyAction(s, { type: 'check' });

    expect(s.street).toBe('complete');
    const totalStacks = s.players.reduce((sum, p) => sum + p.stack, 0);
    expect(totalStacks).toBe(50 + 200 + 200);
  });
});
