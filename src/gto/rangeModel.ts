import { ActionLogEntry, Card, GameState, Position } from '@shared/types';
import { getPlayer } from '@engine/gameState';
import { postflopStrength } from '@ai/handStrength';
import {
  BB_ISO_RANGE,
  fullRange,
  JAM_RANGE,
  LIMP_RANGE,
  openerBucket,
  Range,
  rangePercent,
  rangeToCombos,
  ResponderContext,
  RFI,
  subtractRange,
  VS_3BET_CALL,
  VS_3BET_FOURBET,
  vsRfiResponse,
  WeightedCombo,
} from './ranges';

export type VillainModel = {
  seat: number;
  combos: WeightedCombo[];
  /** Human summary, e.g. "CO open (~28% of hands)". */
  description: string;
};

function responderContext(pos: Position | undefined): ResponderContext {
  if (pos === 'BB') return 'BB';
  if (pos === 'SB') return 'SB';
  return 'IP';
}

function isAggressive(e: ActionLogEntry): boolean {
  return e.action.type === 'raise' || e.action.type === 'allin' || e.action.type === 'bet';
}

/** Infer the villain's preflop range from their last voluntary preflop action. */
function preflopRange(state: GameState, seat: number): { range: Range; label: string } {
  const pos = getPlayer(state, seat).position;
  const preflop = state.actionLog.filter((e) => e.street === 'preflop');
  const lastIdx = preflop.map((e) => e.seat).lastIndexOf(seat);

  if (lastIdx === -1) {
    // No voluntary action (e.g. blind all-in from antes) — unknown hand.
    return { range: fullRange(), label: `${pos ?? '?'} (random hand)` };
  }

  const last = preflop[lastIdx];
  const before = preflop.slice(0, lastIdx);
  const raisesBefore = before.filter(isAggressive);
  const lastRaiserPos =
    raisesBefore.length > 0
      ? getPlayer(state, raisesBefore[raisesBefore.length - 1].seat).position
      : undefined;
  const bucket = openerBucket(lastRaiserPos ?? 'BTN');
  const ctx = responderContext(pos);

  if (isAggressive(last)) {
    if (raisesBefore.length === 0) {
      const shortJam =
        last.action.type === 'allin' && pos !== undefined && pos !== 'BB'
          ? JAM_RANGE[openerBucket(pos)]
          : undefined;
      if (shortJam) return { range: shortJam, label: `${pos} jam` };
      if (pos === 'BB') return { range: BB_ISO_RANGE, label: 'BB iso-raise' };
      const rfi = (pos && RFI[pos]) || RFI.BTN!;
      return { range: rfi, label: `${pos ?? 'BTN'} open` };
    }
    if (raisesBefore.length === 1) {
      return { range: vsRfiResponse(bucket, ctx).threebet, label: `${pos} 3-bet` };
    }
    return { range: VS_3BET_FOURBET, label: `${pos} 4-bet+` };
  }

  if (last.action.type === 'call') {
    if (raisesBefore.length === 0) return { range: LIMP_RANGE, label: `${pos} limp` };
    if (raisesBefore.length === 1) {
      return { range: vsRfiResponse(bucket, ctx).call, label: `${pos} call vs open` };
    }
    return { range: VS_3BET_CALL, label: `${pos} call vs 3-bet` };
  }

  // Preflop check — only the BB can do that; they'd have iso-raised their best hands.
  return { range: subtractRange(fullRange(), BB_ISO_RANGE), label: 'BB check (wide)' };
}

/**
 * Narrow a range based on postflop aggression: a player who bet or raised
 * postflop is weighted toward hands that connect with the current board,
 * with a small residue of bluffs.
 */
function applyPostflopFilter(
  combos: WeightedCombo[],
  board: Card[],
  wasAggressor: boolean,
  called: boolean
): WeightedCombo[] {
  if (board.length < 3 || (!wasAggressor && !called)) return combos;
  return combos.map((c) => {
    const s = postflopStrength([c.cards[0], c.cards[1]], board);
    let mult: number;
    if (wasAggressor) mult = s >= 0.5 ? 1 : s >= 0.3 ? 0.55 : 0.18;
    else mult = s >= 0.25 ? 1 : 0.5;
    return { cards: c.cards, weight: c.weight * mult };
  });
}

/** Model the range of every opponent still contesting the pot. */
export function modelVillainRanges(state: GameState, heroSeat: number): VillainModel[] {
  const hero = getPlayer(state, heroSeat);
  const dead = [...hero.holeCards, ...state.board];

  const villains = state.players.filter(
    (p) => p.seat !== heroSeat && (p.state === 'active' || p.state === 'allin')
  );

  return villains.map((v) => {
    const { range, label } = preflopRange(state, v.seat);
    let combos = rangeToCombos(range, dead);

    const postflop = state.actionLog.filter(
      (e) => e.seat === v.seat && e.street !== 'preflop'
    );
    const wasAggressor = postflop.some(isAggressive);
    const called = postflop.some((e) => e.action.type === 'call');
    combos = applyPostflopFilter(combos, state.board, wasAggressor, called);

    if (combos.length === 0 || combos.every((c) => c.weight <= 0)) {
      combos = rangeToCombos(fullRange(), dead);
    }

    const pct = Math.round(rangePercent(range) * 100);
    const suffix = wasAggressor && state.board.length >= 3 ? ', betting' : '';
    return {
      seat: v.seat,
      combos,
      description: `${label} (~${pct}% of hands${suffix})`,
    };
  });
}
