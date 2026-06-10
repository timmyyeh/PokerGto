import { describe, it, expect } from 'vitest';
import { monteCarloEquity, equityVsCombos } from '@gto/equity';
import { rangeToCombos, RFI, fullRange } from '@gto/ranges';
import { stringToCard } from '@engine/deck';

const cs = (s: string) => stringToCard(s);

describe('monteCarloEquity', () => {
  it('AA vs 1 random opponent preflop ~85%', () => {
    const eq = monteCarloEquity([cs('Ah'), cs('Ad')], [], 1, 1500);
    expect(eq).toBeGreaterThan(0.8);
    expect(eq).toBeLessThan(0.92);
  });

  it('72o vs 1 random opponent preflop is bad (~35%)', () => {
    const eq = monteCarloEquity([cs('7c'), cs('2h')], [], 1, 1500);
    expect(eq).toBeGreaterThan(0.28);
    expect(eq).toBeLessThan(0.42);
  });

  it('made flush on the river beats nearly everything', () => {
    // Hero holds two hearts; board is 4 hearts + 1 club. Hero has a flush.
    const eq = monteCarloEquity(
      [cs('Ah'), cs('Th')],
      [cs('2h'), cs('5h'), cs('9h'), cs('Kc'), cs('3d')],
      1,
      800
    );
    expect(eq).toBeGreaterThan(0.95);
  });

  it('equity drops with more opponents', () => {
    const eq1 = monteCarloEquity([cs('Ah'), cs('Ad')], [], 1, 1000);
    const eq7 = monteCarloEquity([cs('Ah'), cs('Ad')], [], 7, 1000);
    expect(eq1).toBeGreaterThan(eq7);
  });
});

describe('equityVsCombos (range-aware)', () => {
  it('AA still dominates a tight UTG range', () => {
    const hero = [cs('Ah'), cs('Ad')];
    const combos = rangeToCombos(RFI.UTG!, hero);
    const eq = equityVsCombos(hero, [], [combos], 1200);
    expect(eq).toBeGreaterThan(0.72);
    expect(eq).toBeLessThan(0.92);
  });

  it('KQo fares much worse vs a tight UTG range than vs a random hand', () => {
    const hero = [cs('Kh'), cs('Qd')];
    const vsRandom = equityVsCombos(hero, [], [rangeToCombos(fullRange(), hero)], 1200);
    const vsUtg = equityVsCombos(hero, [], [rangeToCombos(RFI.UTG!, hero)], 1200);
    expect(vsUtg).toBeLessThan(vsRandom - 0.05);
  });

  it('vs full-range combos matches the random-hand model', () => {
    const hero = [cs('Ah'), cs('Ad')];
    const viaRanges = equityVsCombos(hero, [], [rangeToCombos(fullRange(), hero)], 1500);
    expect(viaRanges).toBeGreaterThan(0.8);
    expect(viaRanges).toBeLessThan(0.92);
  });

  it('returns 1 with no villains', () => {
    expect(equityVsCombos([cs('2h'), cs('3d')], [], [], 10)).toBe(1);
  });
});
