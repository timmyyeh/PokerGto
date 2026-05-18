import { describe, it, expect } from 'vitest';
import { freshDeck, shuffle, shuffledDeck } from '@engine/deck';

describe('deck', () => {
  it('fresh deck has 52 unique cards', () => {
    const deck = freshDeck();
    expect(deck.length).toBe(52);
    const seen = new Set(deck.map((c) => `${c.rank}${c.suit}`));
    expect(seen.size).toBe(52);
  });

  it('shuffle preserves all cards', () => {
    const original = freshDeck();
    const shuffled = shuffle(original);
    expect(shuffled.length).toBe(52);
    const originalSet = new Set(original.map((c) => `${c.rank}${c.suit}`));
    const shuffledSet = new Set(shuffled.map((c) => `${c.rank}${c.suit}`));
    expect(shuffledSet).toEqual(originalSet);
  });

  it('shuffles produce different orderings (probabilistic)', () => {
    const a = shuffledDeck();
    const b = shuffledDeck();
    const sameOrder = a.every((c, i) => c.rank === b[i].rank && c.suit === b[i].suit);
    expect(sameOrder).toBe(false);
  });
});
