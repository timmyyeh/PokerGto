import { Card, GameState, Position } from '@shared/types';
import { getPlayer, LegalActions } from '@engine/gameState';
import {
  BB_ISO_RANGE,
  handCode,
  JAM_RANGE,
  OpenerBucket,
  openerBucket,
  OPEN_SIZE_BB,
  OVERLIMP_RANGE,
  rangePercent,
  ResponderContext,
  RFI,
  VS_3BET_CALL,
  VS_3BET_FOURBET,
  VS_4BET_CALL,
  VS_4BET_JAM,
  vsRfiResponse,
} from './ranges';

export type PreflopScenario = 'open' | 'vsRaise' | 'vs3bet' | 'vs4bet' | 'limpedPot';

export type PreflopContext = {
  position: Position;
  scenario: PreflopScenario;
  /** Position of the last raiser (for vsRaise). */
  aggressorPosition?: Position;
  limpers?: number;
  /** Effective stack in big blinds; enables jam-or-fold play when short. */
  effectiveBB?: number;
};

export type SizeKind = 'open' | '3bet' | '4bet' | 'iso' | 'jam' | 'none';

/** GTO-style mixed preflop strategy for one spot. */
export type PreflopMix = {
  raise: number;
  call: number;
  fold: number;
  sizeKind: SizeKind;
  /** When true, the raise arm means moving all-in. */
  jam: boolean;
  why: string;
};

function responderContext(pos: Position): ResponderContext {
  if (pos === 'BB') return 'BB';
  if (pos === 'SB') return 'SB';
  return 'IP';
}

function jamBucket(pos: Position): OpenerBucket | 'BB' {
  if (pos === 'BB') return 'BB';
  return openerBucket(pos);
}

const SHORT_STACK_BB = 10;

/** Derive the preflop context (scenario, aggressor, limpers, stacks) from the live state. */
export function buildPreflopContext(state: GameState, seat: number): PreflopContext {
  const p = getPlayer(state, seat);
  const preflop = state.actionLog.filter((e) => e.street === 'preflop');
  const raises = preflop.filter(
    (e) => e.action.type === 'raise' || e.action.type === 'allin' || e.action.type === 'bet'
  );
  const limpers = preflop.filter(
    (e) => e.action.type === 'call' && e.seat !== seat
  ).length;

  let scenario: PreflopScenario;
  if (raises.length === 0) scenario = limpers > 0 ? 'limpedPot' : 'open';
  else if (raises.length === 1) scenario = 'vsRaise';
  else if (raises.length === 2) scenario = 'vs3bet';
  else scenario = 'vs4bet';

  const aggressorPosition =
    raises.length > 0
      ? getPlayer(state, raises[raises.length - 1].seat).position
      : undefined;

  const heroTotal = p.stack + p.bet;
  let villainMax = 0;
  for (const pl of state.players) {
    if (pl.seat === seat) continue;
    if (pl.state === 'active' || pl.state === 'allin') {
      villainMax = Math.max(villainMax, pl.stack + pl.bet);
    }
  }
  const effectiveBB = Math.min(heroTotal, villainMax || heroTotal) / state.bigBlind;

  return {
    position: p.position ?? 'BTN',
    scenario,
    aggressorPosition,
    limpers,
    effectiveBB,
  };
}

export function preflopMix(hole: Card[], ctx: PreflopContext): PreflopMix {
  const code = handCode(hole);
  const pos = ctx.position;
  const short = ctx.effectiveBB !== undefined && ctx.effectiveBB <= SHORT_STACK_BB;

  if (ctx.scenario === 'open') {
    if (short) {
      const f = JAM_RANGE[jamBucket(pos)][code] ?? 0;
      return {
        raise: f,
        call: 0,
        fold: 1 - f,
        sizeKind: 'jam',
        jam: true,
        why:
          f > 0
            ? `At ${Math.round(ctx.effectiveBB!)}bb, ${code} is a profitable all-in from ${pos}: jamming maximizes fold equity and avoids tough postflop spots with a short stack.`
            : `At ${Math.round(ctx.effectiveBB!)}bb, ${code} is below the ${pos} jamming range — open-folding preserves your remaining chips for a better spot.`,
      };
    }
    const range = RFI[pos];
    const f = range?.[code] ?? 0;
    const pct = range ? Math.round(rangePercent(range) * 100) : 0;
    return {
      raise: f,
      call: 0,
      fold: 1 - f,
      sizeKind: 'open',
      jam: false,
      why:
        f >= 1
          ? `${code} is a pure open in the ${pos} raise-first-in range (~${pct}% of hands).`
          : f > 0
          ? `${code} is a mixed open from ${pos} (raised ~${Math.round(f * 100)}% of the time at equilibrium) — it sits right at the edge of the ~${pct}% opening range.`
          : `${code} is outside the ${pos} opening range (~${pct}% of hands). Open-folding loses nothing; playing it lights chips on fire from this seat.`,
    };
  }

  if (ctx.scenario === 'vsRaise') {
    const bucket = openerBucket(ctx.aggressorPosition ?? 'CO');
    const resp = vsRfiResponse(bucket, responderContext(pos));
    let threebet = resp.threebet[code] ?? 0;
    let call = resp.call[code] ?? 0;
    if (threebet + call > 1) {
      const scale = 1 / (threebet + call);
      threebet *= scale;
      call *= scale;
    }
    if (short) {
      const gate = JAM_RANGE[jamBucket(pos)][code] ?? 0;
      const jamFreq = Math.min(1, Math.max(threebet, Math.min(threebet + call, gate)));
      return {
        raise: jamFreq,
        call: 0,
        fold: 1 - jamFreq,
        sizeKind: 'jam',
        jam: true,
        why:
          jamFreq > 0
            ? `Short-stacked at ~${Math.round(ctx.effectiveBB!)}bb, ${code} plays best as a re-jam over the open: you deny their equity and get your stack in with a playable hand.`
            : `Short-stacked, ${code} can't profitably re-jam or call vs this open — folding keeps your remaining big blinds.`,
      };
    }
    return {
      raise: threebet,
      call,
      fold: Math.max(0, 1 - threebet - call),
      sizeKind: '3bet',
      jam: false,
      why: describeVsRaise(code, threebet, call, ctx.aggressorPosition ?? 'CO', pos),
    };
  }

  if (ctx.scenario === 'vs3bet') {
    const fourbet = VS_3BET_FOURBET[code] ?? 0;
    const call = VS_3BET_CALL[code] ?? 0;
    const jam = ctx.effectiveBB !== undefined && ctx.effectiveBB <= 25;
    return {
      raise: fourbet,
      call,
      fold: Math.max(0, 1 - fourbet - call),
      sizeKind: jam ? 'jam' : '4bet',
      jam,
      why:
        fourbet >= 0.5
          ? `${code} is a value 4-bet: it dominates the 3-bettor's continuing range and wants the pot big now.`
          : call > 0
          ? `${code} is strong enough to continue vs the 3-bet but not to 4-bet — calling keeps their bluffs in and avoids bloating the pot out of position against their value.`
          : `${code} doesn't have the equity or playability to continue vs a 3-bet; calling here is how chips leak long-term.`,
    };
  }

  if (ctx.scenario === 'vs4bet') {
    const jamF = VS_4BET_JAM[code] ?? 0;
    const call = VS_4BET_CALL[code] ?? 0;
    return {
      raise: jamF,
      call,
      fold: Math.max(0, 1 - jamF - call),
      sizeKind: 'jam',
      jam: true,
      why:
        jamF >= 0.5
          ? `${code} is a clear 5-bet jam — vs a 4-betting range it's a favorite or flipping, and jamming denies their bluffs.`
          : call > 0
          ? `${code} continues vs the 4-bet as a call: strong enough to see a flop, not strong enough to stack off preflop.`
          : `4-betting ranges are heavily weighted to QQ+/AK — ${code} is dominated and must fold.`,
    };
  }

  // limpedPot
  if (pos === 'BB') {
    const iso = BB_ISO_RANGE[code] ?? 0;
    return {
      raise: iso,
      call: 1 - iso,
      fold: 0,
      sizeKind: 'iso',
      jam: false,
      why:
        iso > 0
          ? `${code} is strong enough to iso-raise the limpers from the BB — punish the limps and take the pot heads-up with the best hand.`
          : `With ${code} in the BB, check your option: you see a free flop and realize all your equity at no cost.`,
    };
  }
  const rfi = RFI[pos]?.[code] ?? 0;
  const overlimp = rfi >= 1 ? 0 : (OVERLIMP_RANGE[code] ?? 0) * (1 - rfi);
  return {
    raise: rfi,
    call: overlimp,
    fold: Math.max(0, 1 - rfi - overlimp),
    sizeKind: 'iso',
    jam: false,
    why:
      rfi > 0
        ? `${code} is strong enough to iso-raise the limp from ${pos}: limpers have weak, capped ranges, so raising wins the pot often and builds it when you're ahead.`
        : overlimp > 0
        ? `${code} plays well multiway but isn't strong enough to iso-raise — over-limping keeps the pot cheap with a hand that flops big.`
        : `${code} isn't worth a limp-behind even at a discount; folding is the disciplined play.`,
  };
}

function describeVsRaise(
  code: string,
  threebet: number,
  call: number,
  aggressor: Position,
  pos: Position
): string {
  if (threebet >= 0.6) {
    return `${code} is a value 3-bet vs the ${aggressor} open: it dominates their continuing range, and 3-betting builds the pot while you're ahead.`;
  }
  if (threebet > 0 && call > 0) {
    return `${code} mixes 3-bet and call vs the ${aggressor} open — both have similar EV at equilibrium. 3-betting pressures their weak opens; calling keeps their bluffs in.`;
  }
  if (threebet > 0) {
    return `${code} works as a 3-bet bluff vs the ${aggressor} open: it blocks their strongest hands and plays fine when called, while folding out their weak opens.`;
  }
  if (call > 0) {
    return `${code} has the equity and playability to call the ${aggressor} open from ${pos}, but 3-betting would fold out worse and isolate you vs better.`;
  }
  return `${code} can't continue profitably vs a ${aggressor} open from ${pos} — it's dominated by their range and plays poorly postflop.`;
}

/** Suggested raise-to total in chips for a given preflop size kind. */
export function preflopRaiseChips(
  state: GameState,
  la: LegalActions,
  kind: SizeKind,
  position: Position,
  opts: { limpers?: number; inPosition?: boolean } = {}
): number {
  const bb = state.bigBlind;
  let total: number;
  switch (kind) {
    case 'open':
      total = Math.round((OPEN_SIZE_BB[position] ?? 2.5) * bb);
      break;
    case 'iso':
      total = Math.round(((OPEN_SIZE_BB[position] ?? 2.5) + (opts.limpers ?? 1)) * bb);
      break;
    case '3bet':
      total = Math.round(state.currentBet * (opts.inPosition ? 3 : 4));
      break;
    case '4bet':
      total = Math.round(state.currentBet * 2.3);
      break;
    case 'jam':
      return la.maxRaiseTotal;
    default:
      total = la.minRaiseTotal;
  }
  return Math.min(Math.max(total, la.minRaiseTotal), la.maxRaiseTotal);
}

// ---------------------------------------------------------------------------
// Legacy single-action view of the chart (highest-frequency arm).
// ---------------------------------------------------------------------------

export type PreflopAction =
  | { type: 'raise'; sizingBB: number; reason: string }
  | { type: 'call'; reason: string }
  | { type: 'check'; reason: string }
  | { type: 'fold'; reason: string };

export function getPreflopAction(
  hole: Card[],
  position: Position,
  scenario: PreflopScenario
): PreflopAction {
  const mix = preflopMix(hole, { position, scenario, aggressorPosition: 'CO' });
  const top = Math.max(mix.raise, mix.call, mix.fold);
  if (top === mix.raise && mix.raise > 0) {
    const sizingBB =
      mix.sizeKind === 'open'
        ? OPEN_SIZE_BB[position] ?? 2.5
        : mix.sizeKind === 'iso'
        ? (OPEN_SIZE_BB[position] ?? 2.5) + 1
        : mix.sizeKind === '3bet'
        ? 9
        : 22;
    return { type: 'raise', sizingBB, reason: mix.why };
  }
  if (top === mix.call && mix.call > 0) {
    if (scenario === 'limpedPot' && position === 'BB') {
      return { type: 'check', reason: mix.why };
    }
    return { type: 'call', reason: mix.why };
  }
  return { type: 'fold', reason: mix.why };
}
