import { describe, it, expect } from 'vitest';
import {
  handCode,
  parseRange,
  rangePercent,
  rangeToCombos,
  fullRange,
  subtractRange,
  RFI,
  JAM_RANGE,
  vsRfiResponse,
} from '@gto/ranges';
import { stringToCard } from '@engine/deck';

const cs = (s: string) => stringToCard(s);

describe('handCode', () => {
  it('orders ranks high-first and tags suitedness', () => {
    expect(handCode([cs('Ah'), cs('Kh')])).toBe('AKs');
    expect(handCode([cs('Kd'), cs('Ah')])).toBe('AKo');
    expect(handCode([cs('7c'), cs('2h')])).toBe('72o');
    expect(handCode([cs('5s'), cs('5d')])).toBe('55');
  });
});

describe('parseRange', () => {
  it('expands pair plus notation', () => {
    const r = parseRange('TT+');
    expect(Object.keys(r).sort()).toEqual(['AA', 'JJ', 'KK', 'QQ', 'TT']);
    expect(r.AA).toBe(1);
  });

  it('expands pair series', () => {
    expect(Object.keys(parseRange('77-55')).sort()).toEqual(['55', '66', '77']);
  });

  it('expands suited plus notation up to one below the high card', () => {
    const r = parseRange('ATs+');
    expect(Object.keys(r).sort()).toEqual(['AJs', 'AKs', 'AQs', 'ATs']);
  });

  it('expands connector series with preserved gap', () => {
    const r = parseRange('T9s-65s');
    expect(Object.keys(r).sort()).toEqual(['65s', '76s', '87s', '98s', 'T9s']);
  });

  it('expands same-high-card series', () => {
    expect(Object.keys(parseRange('K9s-K6s')).sort()).toEqual(['K6s', 'K7s', 'K8s', 'K9s']);
  });

  it('applies frequencies', () => {
    const r = parseRange('AKo:0.5, QQ');
    expect(r.AKo).toBe(0.5);
    expect(r.QQ).toBe(1);
  });

  it('throws on junk', () => {
    expect(() => parseRange('XYZ+')).toThrow();
  });
});

describe('rangePercent / combos', () => {
  it('full range is 100%', () => {
    expect(rangePercent(fullRange())).toBeCloseTo(1, 5);
  });

  it('AA is 6 of 1326 combos', () => {
    expect(rangePercent(parseRange('AA'))).toBeCloseTo(6 / 1326, 6);
  });

  it('rangeToCombos excludes dead cards', () => {
    const combos = rangeToCombos(parseRange('AA'), [cs('Ah')]);
    expect(combos.length).toBe(3); // only AsAd, AsAc, AdAc remain
  });

  it('subtractRange removes weight', () => {
    const r = subtractRange(parseRange('AA, KK'), parseRange('KK'));
    expect(r.AA).toBe(1);
    expect(r.KK).toBeUndefined();
  });
});

describe('chart sanity', () => {
  it('RFI ranges widen with position', () => {
    const utg = rangePercent(RFI.UTG!);
    const hj = rangePercent(RFI.HJ!);
    const btn = rangePercent(RFI.BTN!);
    expect(utg).toBeGreaterThan(0.07);
    expect(utg).toBeLessThan(0.15);
    expect(hj).toBeGreaterThan(utg);
    expect(btn).toBeGreaterThan(hj);
    expect(btn).toBeGreaterThan(0.38);
    expect(btn).toBeLessThan(0.52);
  });

  it('AA is in every RFI and jam range', () => {
    for (const range of Object.values(RFI)) expect(range.AA).toBe(1);
    for (const range of Object.values(JAM_RANGE)) expect(range.AA).toBe(1);
  });

  it('72o is nowhere', () => {
    for (const range of Object.values(RFI)) expect(range['72o']).toBeUndefined();
    const resp = vsRfiResponse('LP', 'BB');
    expect(resp.threebet['72o']).toBeUndefined();
    expect(resp.call['72o']).toBeUndefined();
  });

  it('BB defends much wider vs a late open than vs an early open', () => {
    const vsEP = rangePercent(vsRfiResponse('EP', 'BB').call);
    const vsLP = rangePercent(vsRfiResponse('LP', 'BB').call);
    expect(vsLP).toBeGreaterThan(vsEP * 1.5);
    expect(vsLP).toBeGreaterThan(0.3);
  });
});
