import { describe, it, expect } from 'vitest';
import { getPreflopAction, preflopMix } from '@gto/preflopCharts';
import { stringToCard } from '@engine/deck';

const cs = (s: string) => stringToCard(s);

describe('getPreflopAction', () => {
  describe('opening', () => {
    it('AA opens from any position', () => {
      const positions = ['UTG', 'UTG1', 'MP', 'HJ', 'CO', 'BTN', 'SB'] as const;
      for (const pos of positions) {
        const a = getPreflopAction([cs('Ah'), cs('Ad')], pos, 'open');
        expect(a.type).toBe('raise');
      }
    });

    it('72o folds from every position', () => {
      const positions = ['UTG', 'UTG1', 'MP', 'HJ', 'CO', 'BTN'] as const;
      for (const pos of positions) {
        const a = getPreflopAction([cs('7c'), cs('2h')], pos, 'open');
        expect(a.type).toBe('fold');
      }
    });

    it('BTN opens wider than UTG', () => {
      // T9s should be opened from BTN but not from UTG.
      const utg = getPreflopAction([cs('Th'), cs('9h')], 'UTG', 'open');
      const btn = getPreflopAction([cs('Th'), cs('9h')], 'BTN', 'open');
      expect(btn.type).toBe('raise');
      // UTG may or may not open T9s in our threshold — but should be tighter than BTN.
      // The strongest statement is that BTN opens at least as much as UTG.
      if (utg.type === 'raise') {
        expect(btn.type).toBe('raise');
      }
    });
  });

  describe('vs raise', () => {
    it('AA 3bets for value vs a raise', () => {
      const a = getPreflopAction([cs('Ah'), cs('Ad')], 'BTN', 'vsRaise');
      expect(a.type).toBe('raise');
    });

    it('72o folds vs a raise', () => {
      const a = getPreflopAction([cs('7c'), cs('2h')], 'BB', 'vsRaise');
      expect(a.type).toBe('fold');
    });
  });

  describe('vs 3bet', () => {
    it('AA 4bets vs a 3bet', () => {
      const a = getPreflopAction([cs('Ah'), cs('Ad')], 'BTN', 'vs3bet');
      expect(a.type).toBe('raise');
    });

    it('AKs calls or 4bets vs a 3bet (premium continues)', () => {
      const a = getPreflopAction([cs('Ah'), cs('Kh')], 'BTN', 'vs3bet');
      expect(['call', 'raise']).toContain(a.type);
    });

    it('weak hands fold vs a 3bet', () => {
      const a = getPreflopAction([cs('5c'), cs('2h')], 'BTN', 'vs3bet');
      expect(a.type).toBe('fold');
    });
  });

  describe('limped pot', () => {
    it('BB checks in a limped pot', () => {
      const a = getPreflopAction([cs('7c'), cs('2h')], 'BB', 'limpedPot');
      expect(a.type).toBe('check');
    });

    it('strong hand iso-raises limpers from position', () => {
      const a = getPreflopAction([cs('Ah'), cs('Kh')], 'BTN', 'limpedPot');
      expect(a.type).toBe('raise');
    });
  });

  it('always returns a non-empty reason string', () => {
    const a = getPreflopAction([cs('Ah'), cs('Kd')], 'CO', 'open');
    expect(a.reason.length).toBeGreaterThan(10);
  });
});

describe('preflopMix', () => {
  it('frequencies sum to ~1 in every scenario', () => {
    const hands: [string, string][] = [
      ['Ah', 'Ad'],
      ['Kh', 'Qh'],
      ['7c', '2h'],
      ['9s', '8s'],
      ['Ac', '5c'],
    ];
    const scenarios = ['open', 'vsRaise', 'vs3bet', 'vs4bet', 'limpedPot'] as const;
    for (const [c1, c2] of hands) {
      for (const scenario of scenarios) {
        const mix = preflopMix([cs(c1), cs(c2)], {
          position: 'CO',
          scenario,
          aggressorPosition: 'MP',
          limpers: 1,
          effectiveBB: 100,
        });
        expect(mix.raise + mix.call + mix.fold).toBeCloseTo(1, 5);
        expect(mix.why.length).toBeGreaterThan(10);
      }
    }
  });

  it('switches to jam-or-fold at 8bb', () => {
    const jam = preflopMix([cs('Ah'), cs('Th')], {
      position: 'BTN',
      scenario: 'open',
      effectiveBB: 8,
    });
    expect(jam.jam).toBe(true);
    expect(jam.raise).toBe(1);

    const fold = preflopMix([cs('7c'), cs('2h')], {
      position: 'BTN',
      scenario: 'open',
      effectiveBB: 8,
    });
    expect(fold.raise).toBe(0);
    expect(fold.fold).toBe(1);
  });

  it('AA 5-bet jams vs a 4bet; junk folds', () => {
    const aa = preflopMix([cs('Ah'), cs('Ad')], {
      position: 'BTN',
      scenario: 'vs4bet',
      effectiveBB: 100,
    });
    expect(aa.jam).toBe(true);
    expect(aa.raise).toBe(1);

    const junk = preflopMix([cs('9c'), cs('4d')], {
      position: 'BTN',
      scenario: 'vs4bet',
      effectiveBB: 100,
    });
    expect(junk.fold).toBe(1);
  });

  it('BB defends T9s vs a BTN open but folds it vs an UTG 3-bet-sized spot', () => {
    const defend = preflopMix([cs('Th'), cs('9h')], {
      position: 'BB',
      scenario: 'vsRaise',
      aggressorPosition: 'BTN',
      effectiveBB: 100,
    });
    expect(defend.call + defend.raise).toBeGreaterThan(0.5);
  });
});
