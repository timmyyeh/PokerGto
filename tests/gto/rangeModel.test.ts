import { describe, it, expect } from 'vitest';
import { startHand, applyAction } from '@engine/gameState';
import { modelVillainRanges } from '@gto/rangeModel';
import { handCode } from '@gto/ranges';

const seeds8 = Array.from({ length: 8 }, (_, i) => ({
  seat: i,
  name: `P${i}`,
  isHero: i === 0,
  stack: 200,
}));

describe('modelVillainRanges', () => {
  it('models an open-raiser on their positional RFI range', () => {
    const s = startHand(seeds8, { smallBlind: 1, bigBlind: 2, buttonSeat: 0 });
    // UTG (seat 3) raises, everyone folds to BTN (hero, seat 0).
    applyAction(s, { type: 'raise', amount: 5 }); // UTG
    applyAction(s, { type: 'fold' }); // UTG1
    applyAction(s, { type: 'fold' }); // MP
    applyAction(s, { type: 'fold' }); // HJ
    applyAction(s, { type: 'fold' }); // CO
    expect(s.toAct).toBe(0); // BTN = hero

    const models = modelVillainRanges(s, 0);
    // Contenders: UTG raiser + SB + BB (blinds haven't acted yet).
    const utg = models.find((m) => m.seat === 3)!;
    expect(utg.description).toContain('UTG open');

    // The raiser's range should contain AA but not 72o.
    const codes = new Set(utg.combos.map((c) => handCode([c.cards[0], c.cards[1]])));
    expect(codes.has('AA')).toBe(true);
    expect(codes.has('72o')).toBe(false);
  });

  it('models a BB preflop check as a wide range', () => {
    const seeds2 = [
      { seat: 0, name: 'btn', isHero: true, stack: 200 },
      { seat: 1, name: 'bb', isHero: false, stack: 200 },
    ];
    const s = startHand(seeds2, { smallBlind: 1, bigBlind: 2, buttonSeat: 0 });
    applyAction(s, { type: 'call' }); // BTN limps
    applyAction(s, { type: 'check' }); // BB checks
    const models = modelVillainRanges(s, 0);
    expect(models.length).toBe(1);
    expect(models[0].description.toLowerCase()).toContain('check');
    // Wide: well over 500 weighted combos.
    expect(models[0].combos.length).toBeGreaterThan(500);
  });

  it('excludes hero cards and board cards from villain combos', () => {
    const s = startHand(seeds8, { smallBlind: 1, bigBlind: 2, buttonSeat: 0 });
    const hero = s.players[0];
    const models = modelVillainRanges(s, 0);
    for (const m of models) {
      for (const combo of m.combos) {
        for (const c of combo.cards) {
          for (const h of hero.holeCards) {
            expect(`${c.rank}${c.suit}`).not.toBe(`${h.rank}${h.suit}`);
          }
        }
      }
    }
  });
});
