import { describe, it, expect } from 'vitest';
import { preflopStrength, postflopStrength, strengthFor } from '@ai/handStrength';
import { stringToCard } from '@engine/deck';

const cs = (s: string) => stringToCard(s);

describe('preflopStrength', () => {
  it('AA is the strongest preflop hand', () => {
    const aa = preflopStrength([cs('Ah'), cs('Ad')]);
    const kk = preflopStrength([cs('Kh'), cs('Kd')]);
    const qq = preflopStrength([cs('Qh'), cs('Qd')]);
    expect(aa).toBeGreaterThan(kk);
    expect(kk).toBeGreaterThan(qq);
    expect(aa).toBeGreaterThan(0.9);
  });

  it('72o is very weak', () => {
    const s = preflopStrength([cs('7c'), cs('2h')]);
    expect(s).toBeLessThan(0.25);
  });

  it('suited cards score higher than offsuit', () => {
    const ako = preflopStrength([cs('Ah'), cs('Kd')]);
    const aks = preflopStrength([cs('Ah'), cs('Kh')]);
    expect(aks).toBeGreaterThan(ako);
  });

  it('connected cards score higher than gapped', () => {
    const t9s = preflopStrength([cs('Th'), cs('9h')]);
    const t7s = preflopStrength([cs('Th'), cs('7h')]);
    expect(t9s).toBeGreaterThan(t7s);
  });

  it('returns 0 for invalid input', () => {
    expect(preflopStrength([])).toBe(0);
    expect(preflopStrength([cs('Ah')])).toBe(0);
  });
});

describe('postflopStrength', () => {
  it('rates flush highest among non-straight-flush made hands', () => {
    const flush = postflopStrength(
      [cs('Ah'), cs('Kh')],
      [cs('2h'), cs('5h'), cs('9h')]
    );
    const pair = postflopStrength(
      [cs('Ah'), cs('Kd')],
      [cs('Ac'), cs('5d'), cs('9s')]
    );
    expect(flush).toBeGreaterThan(pair);
  });

  it('rates four-of-a-kind very high', () => {
    const quads = postflopStrength(
      [cs('Ah'), cs('Ad')],
      [cs('As'), cs('Ac'), cs('9s')]
    );
    expect(quads).toBeGreaterThan(0.9);
  });

  it('flush draw is rated as decent', () => {
    const fd = postflopStrength([cs('Ah'), cs('Kh')], [cs('2h'), cs('5h'), cs('9d')]);
    expect(fd).toBeGreaterThanOrEqual(0.4);
  });

  it('open-ended straight draw is rated as decent', () => {
    const oesd = postflopStrength(
      [cs('9h'), cs('Td')],
      [cs('7c'), cs('8s'), cs('2d')]
    );
    expect(oesd).toBeGreaterThanOrEqual(0.35);
  });

  it('air (high card only, no draws) rates low', () => {
    const air = postflopStrength(
      [cs('2h'), cs('3d')],
      [cs('Ks'), cs('9c'), cs('5s')]
    );
    expect(air).toBeLessThan(0.2);
  });
});

describe('strengthFor', () => {
  it('routes preflop hands to preflopStrength', () => {
    const s = strengthFor([cs('Ah'), cs('Ad')], [], 'preflop');
    expect(s).toBeGreaterThan(0.9);
  });

  it('routes postflop hands to postflopStrength', () => {
    const s = strengthFor(
      [cs('Ah'), cs('Ad')],
      [cs('As'), cs('5c'), cs('9d')],
      'flop'
    );
    expect(s).toBeGreaterThanOrEqual(0.65); // trips
  });
});
