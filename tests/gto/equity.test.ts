import { describe, it, expect } from 'vitest';
import { monteCarloEquity } from '@gto/equity';
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
