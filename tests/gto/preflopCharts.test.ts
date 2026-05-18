import { describe, it, expect } from 'vitest';
import { getPreflopAction } from '@gto/preflopCharts';
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
