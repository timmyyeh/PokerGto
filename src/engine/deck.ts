import { Card, RANKS, SUITS } from '@shared/types';

// Use the Web Crypto API: available as `globalThis.crypto` in both Node 18+ and browsers/Electron.
const subtleCrypto: { getRandomValues: (a: Uint32Array) => Uint32Array } =
  (globalThis as { crypto?: { getRandomValues: (a: Uint32Array) => Uint32Array } }).crypto!;

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

function cryptoRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) throw new Error('maxExclusive must be > 0');
  const range = maxExclusive;
  const maxAcceptable = Math.floor(0xffffffff / range) * range;
  const buf = new Uint32Array(1);
  for (;;) {
    subtleCrypto.getRandomValues(buf);
    if (buf[0] < maxAcceptable) return buf[0] % range;
  }
}

export function shuffle(deck: Card[]): Card[] {
  const arr = deck.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = cryptoRandomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function shuffledDeck(): Card[] {
  return shuffle(freshDeck());
}

export function cardToString(c: Card): string {
  return `${c.rank}${c.suit}`;
}

export function cardsToStrings(cards: Card[]): string[] {
  return cards.map(cardToString);
}

export function stringToCard(s: string): Card {
  if (s.length !== 2) throw new Error(`bad card string: ${s}`);
  return { rank: s[0] as Card['rank'], suit: s[1] as Card['suit'] };
}
