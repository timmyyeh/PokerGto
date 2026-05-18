import { Card, Position, Rank } from '@shared/types';
import { preflopStrength } from '@ai/handStrength';

/**
 * Simplified GTO-flavored preflop chart. Returns the recommended action
 * for `(position, hand, scenario)`. Uses position-based strength thresholds
 * approximating common 8-max NLHE 100bb ranges.
 */

export type PreflopScenario =
  | 'open' // first to act; no raise yet
  | 'vsRaise' // one raise in front
  | 'vs3bet' // we raised, got 3bet, now responding
  | 'limpedPot'; // someone limped, we can iso-raise or check from BB

export type PreflopAction =
  | { type: 'raise'; sizingBB: number; reason: string }
  | { type: 'call'; reason: string }
  | { type: 'check'; reason: string }
  | { type: 'fold'; reason: string };

// Position tightness multiplier: higher = need stronger hand. 1.0 = baseline.
const POSITION_TIGHTNESS: Record<Position, number> = {
  UTG: 1.15,
  UTG1: 1.1,
  MP: 1.05,
  MP1: 1.05,
  HJ: 1.0,
  CO: 0.92,
  BTN: 0.82,
  SB: 1.0,
  BB: 1.0,
};

const RANK_VALUE: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

function handCode(hole: Card[]): string {
  const sorted = [...hole].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
  const same = sorted[0].rank === sorted[1].rank;
  const suited = sorted[0].suit === sorted[1].suit;
  if (same) return `${sorted[0].rank}${sorted[1].rank}`;
  return `${sorted[0].rank}${sorted[1].rank}${suited ? 's' : 'o'}`;
}

/** Premium hands that 3bet/4bet in nearly any spot. */
const PREMIUM_3BET_HANDS = new Set(['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo']);

export function getPreflopAction(
  hole: Card[],
  position: Position,
  scenario: PreflopScenario
): PreflopAction {
  const strength = preflopStrength(hole);
  const tightness = POSITION_TIGHTNESS[position];
  const code = handCode(hole);

  if (scenario === 'open') {
    // Open threshold scales with position.
    const threshold = 0.55 * tightness;
    if (strength >= threshold) {
      const sizing = position === 'BTN' || position === 'CO' ? 2.2 : 2.5;
      return {
        type: 'raise',
        sizingBB: sizing,
        reason: `${code} is in the open-raising range from ${position}. With effective stacks deep, opening builds the pot in position and denies the blinds equity.`,
      };
    }
    if (position === 'SB' && strength >= threshold * 0.85) {
      return {
        type: 'raise',
        sizingBB: 3.0,
        reason: `${code} from SB is best played as a raise to isolate the BB and avoid playing out-of-position multiway.`,
      };
    }
    return {
      type: 'fold',
      reason: `${code} from ${position} is below the GTO opening threshold; folding preserves chips for stronger spots.`,
    };
  }

  if (scenario === 'vsRaise') {
    // 3bet premiums; call mediums; fold weak.
    if (PREMIUM_3BET_HANDS.has(code)) {
      return {
        type: 'raise',
        sizingBB: 9,
        reason: `${code} is a premium 3bet hand: it has strong equity vs the raiser's continuing range and benefits from getting chips in preflop.`,
      };
    }
    const callThreshold = 0.6 * tightness;
    if (strength >= callThreshold) {
      return {
        type: 'call',
        reason: `${code} has enough equity to continue vs the raiser's range but isn't quite strong enough to 3bet for value. Calling keeps weaker hands in their range.`,
      };
    }
    return {
      type: 'fold',
      reason: `${code} from ${position} doesn't have the equity to call a raise profitably here.`,
    };
  }

  if (scenario === 'vs3bet') {
    if (code === 'AA' || code === 'KK') {
      return {
        type: 'raise',
        sizingBB: 22,
        reason: `${code} is a clear 4bet for value vs a 3bet — it dominates the 3bettor's value range.`,
      };
    }
    if (PREMIUM_3BET_HANDS.has(code)) {
      return {
        type: 'call',
        reason: `${code} is strong enough to continue vs a 3bet, but flatting keeps the 3bettor's bluffs in their range.`,
      };
    }
    if (strength >= 0.7) {
      return {
        type: 'call',
        reason: `${code} has playable equity vs the 3bet range; call and see a flop in position.`,
      };
    }
    return {
      type: 'fold',
      reason: `${code} can't continue vs a 3bet without becoming a dominated calling station.`,
    };
  }

  // limpedPot
  if (position === 'BB') {
    return {
      type: 'check',
      reason: `In BB facing a limp with ${code}, checking realizes equity for free.`,
    };
  }
  if (strength >= 0.55 * tightness) {
    return {
      type: 'raise',
      sizingBB: 4,
      reason: `${code} is strong enough to iso-raise the limpers from ${position}, denying their equity to see a cheap flop.`,
    };
  }
  return {
    type: 'fold',
    reason: `${code} isn't strong enough to attack the limp profitably.`,
  };
}
