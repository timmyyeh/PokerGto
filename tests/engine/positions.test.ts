import { describe, it, expect } from 'vitest';
import { assignPositions, orderFromButton } from '@engine/positions';

describe('assignPositions', () => {
  it('8-max: assigns BTN/SB/BB/UTG/UTG1/MP/HJ/CO clockwise from button', () => {
    const positions = assignPositions([0, 1, 2, 3, 4, 5, 6, 7], 0);
    expect(positions.get(0)).toBe('BTN');
    expect(positions.get(1)).toBe('SB');
    expect(positions.get(2)).toBe('BB');
    expect(positions.get(3)).toBe('UTG');
    expect(positions.get(4)).toBe('UTG1');
    expect(positions.get(5)).toBe('MP');
    expect(positions.get(6)).toBe('HJ');
    expect(positions.get(7)).toBe('CO');
  });

  it('heads-up: BTN and BB only', () => {
    const positions = assignPositions([0, 3], 0);
    expect(positions.get(0)).toBe('BTN');
    expect(positions.get(3)).toBe('BB');
  });

  it('positions rotate when button moves', () => {
    const positions = assignPositions([0, 1, 2, 3, 4, 5, 6, 7], 3);
    expect(positions.get(3)).toBe('BTN');
    expect(positions.get(4)).toBe('SB');
    expect(positions.get(5)).toBe('BB');
    expect(positions.get(2)).toBe('CO');
  });

  it('6-max keeps late positions: BTN/SB/BB/MP/HJ/CO', () => {
    const positions = assignPositions([0, 1, 2, 3, 4, 5], 0);
    expect(positions.get(0)).toBe('BTN');
    expect(positions.get(1)).toBe('SB');
    expect(positions.get(2)).toBe('BB');
    expect(positions.get(3)).toBe('MP');
    expect(positions.get(4)).toBe('HJ');
    expect(positions.get(5)).toBe('CO');
  });

  it('3-handed is just BTN/SB/BB', () => {
    const positions = assignPositions([0, 1, 2], 1);
    expect(positions.get(1)).toBe('BTN');
    expect(positions.get(2)).toBe('SB');
    expect(positions.get(0)).toBe('BB');
  });

  it('throws if button seat is not in seats', () => {
    expect(() => assignPositions([0, 1, 2], 5)).toThrow();
  });

  it('throws if fewer than 2 players', () => {
    expect(() => assignPositions([0], 0)).toThrow();
  });
});

describe('orderFromButton', () => {
  it('returns seats clockwise starting from button', () => {
    expect(orderFromButton([0, 1, 2, 3], 2)).toEqual([2, 3, 0, 1]);
  });

  it('wraps correctly when button is last seat', () => {
    expect(orderFromButton([0, 1, 2, 3, 4, 5, 6, 7], 7)).toEqual([
      7, 0, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it('works with sparse seat numbers', () => {
    expect(orderFromButton([2, 5, 7], 5)).toEqual([5, 7, 2]);
  });
});
