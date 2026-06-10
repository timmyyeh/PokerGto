import { Card, Position, Rank, RANKS, SUITS } from '@shared/types';

/**
 * Preflop range data approximating 100bb 8-max NLHE solver output
 * (GTO Wizard-style simplified solutions), plus a compact range notation
 * parser so charts stay readable and auditable.
 *
 * Notation: comma-separated tokens, each optionally weighted with ":freq".
 *   "TT+"        pairs TT through AA
 *   "77-55"      pairs 77, 66, 55
 *   "ATs+"       ATs, AJs, AQs, AKs (low card up to one below the high card)
 *   "T9s-65s"    connector series sliding both ranks down, gap preserved
 *   "KQo:0.5"    KQo at 50% frequency
 */

export type HandCode = string; // 'AA', 'AKs', 'AKo', ...
export type Range = Record<HandCode, number>;
export type WeightedCombo = { cards: [Card, Card]; weight: number };

export const RANK_VALUE: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

const VALUE_RANK: Record<number, Rank> = Object.fromEntries(
  RANKS.map((r) => [RANK_VALUE[r], r])
) as Record<number, Rank>;

/** Canonical 169-grid code for two hole cards, e.g. "AKs", "T9o", "55". */
export function handCode(hole: Card[]): HandCode {
  if (hole.length !== 2) throw new Error('handCode needs exactly 2 cards');
  const [a, b] =
    RANK_VALUE[hole[0].rank] >= RANK_VALUE[hole[1].rank]
      ? [hole[0], hole[1]]
      : [hole[1], hole[0]];
  if (a.rank === b.rank) return `${a.rank}${b.rank}`;
  return `${a.rank}${b.rank}${a.suit === b.suit ? 's' : 'o'}`;
}

function rankValueOf(ch: string, token: string): number {
  const v = RANK_VALUE[ch as Rank];
  if (v === undefined) throw new Error(`bad rank '${ch}' in range token: ${token}`);
  return v;
}

function validateHand(hand: string, token: string): void {
  rankValueOf(hand[0], token);
  rankValueOf(hand[1], token);
  if (hand.length === 3 && hand[2] !== 's' && hand[2] !== 'o') {
    throw new Error(`bad suffix in range token: ${token}`);
  }
}

function expandToken(token: string): HandCode[] {
  if (token.includes('-')) {
    const [hi, lo] = token.split('-').map((t) => t.trim());
    if (hi.length === 2 && lo.length === 2) {
      // Pair series, e.g. "99-22"
      const from = RANK_VALUE[hi[0] as Rank];
      const to = RANK_VALUE[lo[0] as Rank];
      const out: HandCode[] = [];
      for (let v = from; v >= to; v--) out.push(`${VALUE_RANK[v]}${VALUE_RANK[v]}`);
      return out;
    }
    if (hi.length === 3 && lo.length === 3 && hi[2] === lo[2]) {
      const suffix = hi[2];
      const h1 = RANK_VALUE[hi[0] as Rank];
      const l1 = RANK_VALUE[hi[1] as Rank];
      const h2 = RANK_VALUE[lo[0] as Rank];
      const l2 = RANK_VALUE[lo[1] as Rank];
      const out: HandCode[] = [];
      if (h1 === h2) {
        // Same high card, e.g. "K9s-K6s"
        for (let v = l1; v >= l2; v--) out.push(`${VALUE_RANK[h1]}${VALUE_RANK[v]}${suffix}`);
        return out;
      }
      if (h1 - l1 === h2 - l2) {
        // Sliding series with fixed gap, e.g. "T9s-65s"
        for (let h = h1; h >= h2; h--) {
          out.push(`${VALUE_RANK[h]}${VALUE_RANK[h - (h1 - l1)]}${suffix}`);
        }
        return out;
      }
    }
    throw new Error(`bad range token: ${token}`);
  }

  if (token.endsWith('+')) {
    const base = token.slice(0, -1);
    if (base.length !== 2 && base.length !== 3) throw new Error(`bad range token: ${token}`);
    validateHand(base, token);
    if (base.length === 2) {
      // Pairs up to AA
      const from = RANK_VALUE[base[0] as Rank];
      const out: HandCode[] = [];
      for (let v = from; v <= 14; v++) out.push(`${VALUE_RANK[v]}${VALUE_RANK[v]}`);
      return out;
    }
    // Low card climbs to one below the high card, e.g. "A9s+"
    const suffix = base[2];
    const hi = RANK_VALUE[base[0] as Rank];
    const lo = RANK_VALUE[base[1] as Rank];
    const out: HandCode[] = [];
    for (let v = lo; v < hi; v++) out.push(`${VALUE_RANK[hi]}${VALUE_RANK[v]}${suffix}`);
    return out;
  }

  if (token.length === 2 || token.length === 3) {
    validateHand(token, token);
    return [token];
  }
  throw new Error(`bad range token: ${token}`);
}

export function parseRange(spec: string): Range {
  const range: Range = {};
  for (const raw of spec.split(',')) {
    const part = raw.trim();
    if (!part) continue;
    const [token, freqStr] = part.split(':');
    const freq = freqStr ? Number(freqStr) : 1;
    if (!(freq > 0 && freq <= 1)) throw new Error(`bad frequency in token: ${part}`);
    for (const code of expandToken(token.trim())) {
      range[code] = Math.min(1, (range[code] ?? 0) + freq);
    }
  }
  return range;
}

function combosOf(code: HandCode): [Card, Card][] {
  const out: [Card, Card][] = [];
  const r1 = code[0] as Rank;
  const r2 = code[1] as Rank;
  if (code.length === 2) {
    for (let i = 0; i < SUITS.length; i++) {
      for (let j = i + 1; j < SUITS.length; j++) {
        out.push([{ rank: r1, suit: SUITS[i] }, { rank: r2, suit: SUITS[j] }]);
      }
    }
    return out;
  }
  const suited = code[2] === 's';
  for (const s1 of SUITS) {
    for (const s2 of SUITS) {
      if (suited ? s1 === s2 : s1 !== s2) {
        out.push([{ rank: r1, suit: s1 }, { rank: r2, suit: s2 }]);
      }
    }
  }
  return out;
}

/** Expand a 169-grid range into concrete weighted combos, excluding dead cards. */
export function rangeToCombos(range: Range, dead: Card[] = []): WeightedCombo[] {
  const deadKeys = new Set(dead.map((c) => `${c.rank}${c.suit}`));
  const out: WeightedCombo[] = [];
  for (const [code, weight] of Object.entries(range)) {
    if (weight <= 0) continue;
    for (const cards of combosOf(code)) {
      if (deadKeys.has(`${cards[0].rank}${cards[0].suit}`)) continue;
      if (deadKeys.has(`${cards[1].rank}${cards[1].suit}`)) continue;
      out.push({ cards, weight });
    }
  }
  return out;
}

/** Fraction of all 1326 combos this range plays (weighted). */
export function rangePercent(range: Range): number {
  let combos = 0;
  for (const [code, weight] of Object.entries(range)) {
    const n = code.length === 2 ? 6 : code[2] === 's' ? 4 : 12;
    combos += n * weight;
  }
  return combos / 1326;
}

/** The full 169-hand range at weight 1 (a "random" player). */
export function fullRange(): Range {
  const out: Range = {};
  for (let i = 13; i >= 1; i--) {
    for (let j = i; j >= 1; j--) {
      const hi = VALUE_RANK[i + 1];
      const lo = VALUE_RANK[j + 1];
      if (i === j) out[`${hi}${lo}`] = 1;
      else {
        out[`${hi}${lo}s`] = 1;
        out[`${hi}${lo}o`] = 1;
      }
    }
  }
  return out;
}

/** a minus b (frequencies clamped at 0). */
export function subtractRange(a: Range, b: Range): Range {
  const out: Range = { ...a };
  for (const [code, w] of Object.entries(b)) {
    if (out[code] !== undefined) {
      const left = out[code] - w;
      if (left <= 0) delete out[code];
      else out[code] = left;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Raise-first-in ranges, 8-max ~100bb. Percentages run ~10% (UTG) to ~46% (BTN).
// ---------------------------------------------------------------------------

export const RFI: Partial<Record<Position, Range>> = {
  UTG: parseRange(
    '77+, 66:0.5, ATs+, A5s:0.5, KTs+, QTs+, JTs, T9s:0.5, AQo+, KQo:0.5, AJo:0.25'
  ),
  UTG1: parseRange(
    '66+, 55:0.5, A9s+, A5s, A4s:0.5, KTs+, QTs+, JTs, T9s, 98s:0.5, AJo+, KQo'
  ),
  MP: parseRange(
    '55+, 44:0.5, 33:0.5, A7s+, A5s-A2s, K9s+, Q9s+, J9s+, T9s, 98s, 87s:0.5, ATo+, KJo+, QJo:0.5'
  ),
  HJ: parseRange(
    '22+, A2s+, K9s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s:0.5, ATo+, KTo+, QTo+:0.5, JTo:0.5'
  ),
  CO: parseRange(
    '22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 76s, 65s, 54s:0.5, A8o+, A5o:0.5, KTo+, QTo+, JTo, T9o:0.5'
  ),
  BTN: parseRange(
    '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 96s+, 85s+, 75s+, 64s+, 53s+, 43s:0.5, ' +
      'A2o+, K8o+, K7o:0.5, Q9o+, J9o+, T8o+, 98o, 87o:0.5'
  ),
  SB: parseRange(
    '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, ' +
      'A2o+, K9o+, Q9o+, J9o+, T9o, 98o:0.5'
  ),
};

/** Suggested open size in big blinds per position. */
export const OPEN_SIZE_BB: Partial<Record<Position, number>> = {
  UTG: 2.5, UTG1: 2.5, MP: 2.5, HJ: 2.4, CO: 2.3, BTN: 2.2, SB: 3.0,
};

// ---------------------------------------------------------------------------
// Facing an open raise. Opener positions are bucketed (EP/MP/LP/SB) and the
// responder context is IP (any non-blind seat behind), SB, or BB.
// ---------------------------------------------------------------------------

export type OpenerBucket = 'EP' | 'MP' | 'LP' | 'SB';
export type ResponderContext = 'IP' | 'SB' | 'BB';

export function openerBucket(pos: Position): OpenerBucket {
  if (pos === 'UTG' || pos === 'UTG1') return 'EP';
  if (pos === 'MP' || pos === 'HJ') return 'MP';
  if (pos === 'SB') return 'SB';
  return 'LP';
}

type Response = { threebet: Range; call: Range };

const VS_RFI: Record<OpenerBucket, Record<ResponderContext, Response>> = {
  EP: {
    IP: {
      threebet: parseRange('QQ+, JJ:0.4, AKs, AKo:0.6, A5s:0.35, A4s:0.2'),
      call: parseRange(
        'JJ:0.6, TT-77, 66:0.5, AQs+, AJs, ATs:0.5, KQs, KJs:0.5, QJs:0.5, JTs:0.5, T9s:0.5, 98s:0.25, AQo:0.5'
      ),
    },
    SB: {
      threebet: parseRange('QQ+, JJ:0.7, AKs, AKo, AQs:0.5, A5s:0.5'),
      call: parseRange('JJ:0.3, TT-88, AQs:0.5, AJs:0.5, KQs:0.5'),
    },
    BB: {
      threebet: parseRange('QQ+, JJ:0.4, AKs, AKo:0.7, A5s:0.5, A4s:0.25, KQs:0.2'),
      call: parseRange(
        'JJ:0.6, TT-22, AQs-A2s, KTs+, K9s:0.5, QTs+, J9s+, T8s+, 97s+, 87s, 76s, 65s, 54s, ' +
          'AQo:0.5, AJo:0.5, KQo:0.5, QJo:0.25, JTo:0.25'
      ),
    },
  },
  MP: {
    IP: {
      threebet: parseRange('JJ+, TT:0.4, AQs+, AKo, AQo:0.3, A5s-A4s:0.5, KQs:0.3, 76s:0.2'),
      call: parseRange(
        'TT:0.6, 99-55, 44:0.5, AJs, ATs, KQs:0.7, KJs, QJs, JTs, T9s:0.5, 98s:0.5, AQo:0.7, AJo:0.4, KQo:0.5'
      ),
    },
    SB: {
      threebet: parseRange('JJ+, TT:0.6, AQs+, AKo, AQo:0.5, A5s-A4s, KQs:0.5, JTs:0.25'),
      call: parseRange('TT:0.4, 99-77, AJs, ATs:0.5, KQs:0.5, KJs:0.3'),
    },
    BB: {
      threebet: parseRange('JJ+, AKs, AKo, AQs:0.5, A5s-A2s:0.5, K9s:0.3, T9s:0.25, 76s:0.25'),
      call: parseRange(
        'TT-22, AJs-A2s, AQs:0.5, KTs+, K9s, Q9s+, J9s+, T8s+, 97s+, 86s+, 76s, 65s, 54s, ' +
          'AQo:0.5, AJo, ATo:0.5, KQo, KJo:0.5, QJo:0.5, JTo:0.5'
      ),
    },
  },
  LP: {
    IP: {
      threebet: parseRange(
        'TT+, 99:0.4, AQs+, AJs:0.4, AKo, AQo:0.5, A5s-A4s, KQs:0.5, KJs:0.25, 76s:0.25, 65s:0.25'
      ),
      call: parseRange(
        '99:0.6, 88-22, AJs:0.6, ATs, A9s:0.5, KJs:0.75, KTs:0.5, QJs, QTs:0.5, JTs, T9s, 98s, AJo:0.5, KQo:0.5'
      ),
    },
    SB: {
      threebet: parseRange(
        'TT+, 99:0.5, AQs+, AJs:0.5, ATs:0.3, AQo+, A5s-A2s, KQs, KJs:0.5, QJs:0.4, JTs:0.4, T9s:0.3'
      ),
      call: parseRange('99:0.5, 88-66:0.4, AJs:0.5, KQs:0.3'),
    },
    BB: {
      threebet: parseRange(
        'TT+, AQs+, AQo+, A5s-A2s, K9s:0.5, Q9s:0.3, J9s:0.3, T9s:0.3, 98s:0.3, 87s:0.3'
      ),
      call: parseRange(
        '99-22, AJs-A2s, KTs+, K9s-K4s, Q8s+, Q7s:0.5, J8s+, T7s+, 97s+, 86s+, 75s+, 64s+, 54s, 43s:0.5, ' +
          'AJo-A8o, A7o-A2o:0.5, KTo+, K9o:0.5, QTo+, Q9o:0.5, J9o+, T8o+, 98o, 87o:0.5'
      ),
    },
  },
  SB: {
    IP: { threebet: parseRange('99+, AQs+, AQo+, A5s'), call: parseRange('88-22, AJs-ATs, KQs') },
    SB: { threebet: parseRange('99+, AQs+, AQo+, A5s'), call: parseRange('88-22, AJs-ATs, KQs') },
    BB: {
      threebet: parseRange(
        '99+, 88:0.5, ATs+, A5s-A2s, KTs+, QTs+, JTs, T9s, 98s:0.5, AJo+, KQo, 87s:0.5'
      ),
      call: parseRange(
        '88-22, A9s-A2s, K2s+, Q4s+, J7s+, T7s+, 96s+, 86s+, 75s+, 64s+, 54s, ' +
          'ATo-A2o, KTo-K8o:0.75, K7o-K5o:0.5, Q8o+, J8o+, T8o+, 97o+, 87o, 76o:0.5'
      ),
    },
  },
};

export function vsRfiResponse(opener: OpenerBucket, ctx: ResponderContext): Response {
  return VS_RFI[opener][ctx];
}

// ---------------------------------------------------------------------------
// Facing a 3bet (we opened) and facing a 4bet (we 3bet).
// ---------------------------------------------------------------------------

export const VS_3BET_FOURBET: Range = parseRange('KK+, QQ:0.5, AKs, AKo:0.5, A5s:0.4');
export const VS_3BET_CALL: Range = parseRange(
  'QQ:0.5, JJ-99, 88:0.5, AQs+, AJs:0.5, ATs:0.4, KQs, QJs:0.5, JTs:0.5, T9s:0.4, AKo:0.5, AQo:0.4'
);

export const VS_4BET_JAM: Range = parseRange('KK+, AKs:0.6, QQ:0.3');
export const VS_4BET_CALL: Range = parseRange('QQ:0.5, JJ:0.4, AKs:0.4, AKo:0.5, AQs:0.25');

// ---------------------------------------------------------------------------
// Limped pots and passive ranges (used to model villains, not to coach).
// ---------------------------------------------------------------------------

/** A loose-passive open-limp range, for modeling limpers. */
export const LIMP_RANGE: Range = parseRange(
  '66-22:0.8, 88-77:0.4, A9s-A2s:0.6, K9s-K5s:0.4, Q9s-Q7s:0.4, J9s-J7s:0.4, T9s-T7s:0.5, ' +
    '98s-96s:0.5, 87s-86s:0.5, 76s, 65s, 54s, ATo-A2o:0.4, KTo-K8o:0.3, QTo-Q9o:0.3, JTo:0.4, T9o:0.4, 98o:0.3'
);

/** Hands worth over-limping behind limpers when not strong enough to iso-raise. */
export const OVERLIMP_RANGE: Range = parseRange(
  '66-22, A9s-A2s, K9s-K6s:0.5, Q9s+:0.5, J9s+:0.5, T8s+, 97s+, 87s, 76s, 65s, 54s, 43s:0.5'
);

/** BB iso-raise range over limpers (otherwise check your option). */
export const BB_ISO_RANGE: Range = parseRange('99+, ATs+, A5s:0.5, KQs, AJo+, KQo:0.5');

// ---------------------------------------------------------------------------
// Short-stack (≤10bb) jam-or-fold ranges, Nash-ish.
// ---------------------------------------------------------------------------

export const JAM_RANGE: Record<OpenerBucket | 'BB', Range> = {
  EP: parseRange('55+, A8s+, A5s:0.5, ATo+, KQs, KJs:0.5'),
  MP: parseRange('44+, 33:0.5, A2s+, A8o+, A7o:0.5, KTs+, K9s:0.5, KJo+, QJs, JTs:0.5'),
  LP: parseRange(
    '22+, A2s+, A2o+, K7s+, K5s:0.5, K9o+, Q9s+, QTo+, J9s+, JTo:0.5, T8s+, 98s, 87s:0.5'
  ),
  SB: parseRange(
    '22+, A2s+, A2o+, K2s+, K5o+, Q4s+, Q8o+, J7s+, J9o+, T7s+, T8o+, 97s+, 98o, 86s+, 76s, 65s, 54s'
  ),
  BB: parseRange('33+, A2s+, A7o+, A5o:0.5, KTs+, KJo+, QJs'),
};
