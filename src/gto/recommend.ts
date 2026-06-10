import {
  ActionType,
  Card,
  DecisionGrade,
  GameState,
  GameStateSnapshot,
  PlayerAction,
  Position,
  Recommendation,
  StrategyOption,
} from '@shared/types';
import { getPlayer, legalActions } from '@engine/gameState';
import { detectDraws, postflopStrength } from '@ai/handStrength';
import { equityVsCombos } from './equity';
import { modelVillainRanges } from './rangeModel';
import { buildPreflopContext, preflopMix, preflopRaiseChips } from './preflopCharts';
import { handCode } from './ranges';

const PREFLOP_ITERATIONS = 400;
const POSTFLOP_ITERATIONS = 700;

/** Postflop acting order, earliest first — used to decide who is in position. */
const ACT_ORDER: Position[] = ['SB', 'BB', 'UTG', 'UTG1', 'MP', 'HJ', 'CO', 'BTN'];

/** Snapshot the game state from a given player's perspective for the review log. */
export function snapshotFor(state: GameState, seat: number): GameStateSnapshot {
  const p = getPlayer(state, seat);
  const la = legalActions(state);
  const numActiveOpponents = state.players.filter(
    (pl) => pl.seat !== seat && (pl.state === 'active' || pl.state === 'allin')
  ).length;
  return {
    pot: state.pot,
    toCall: la.callAmount,
    heroStack: p.stack,
    heroCards: p.holeCards,
    board: state.board.slice(),
    position: p.position,
    numActiveOpponents,
    street: state.street,
    bigBlind: state.bigBlind,
  };
}

/** Recommend a GTO-style strategy for the given seat in the current game state. */
export function recommend(state: GameState, seat: number): Recommendation {
  if (state.street === 'preflop') return recommendPreflop(state, seat);
  return recommendPostflop(state, seat);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function inBB(chips: number, bb: number): string {
  const v = chips / bb;
  return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}bb`;
}

function chipLabel(action: 'Bet' | 'Raise to' | 'All-in' | 'Call', amount: number, bb: number): string {
  if (action === 'All-in') return `All-in ${amount} (${inBB(amount, bb)})`;
  return `${action} ${amount} (${inBB(amount, bb)})`;
}

function normalizeOptions(options: StrategyOption[]): StrategyOption[] {
  const merged = new Map<string, StrategyOption>();
  for (const o of options) {
    if (o.frequency <= 0.01) continue;
    const key = `${o.action}:${o.amount ?? ''}`;
    const prior = merged.get(key);
    if (prior) prior.frequency += o.frequency;
    else merged.set(key, { ...o });
  }
  const list = Array.from(merged.values());
  const total = list.reduce((s, o) => s + o.frequency, 0);
  if (total <= 0) return [{ action: 'check', label: 'Check', frequency: 1 }];
  for (const o of list) o.frequency = o.frequency / total;
  return list.sort((a, b) => b.frequency - a.frequency);
}

function pctText(x: number): string {
  return `${Math.round(x * 100)}%`;
}

// ---------------------------------------------------------------------------
// Preflop
// ---------------------------------------------------------------------------

function recommendPreflop(state: GameState, seat: number): Recommendation {
  const p = getPlayer(state, seat);
  const la = legalActions(state);
  const bb = state.bigBlind;
  const code = handCode(p.holeCards);

  const ctx = buildPreflopContext(state, seat);
  const { position, scenario, aggressorPosition, limpers } = ctx;
  const mix = preflopMix(p.holeCards, ctx);

  const villains = modelVillainRanges(state, seat);
  const equity = equityVsCombos(
    p.holeCards,
    state.board,
    villains.map((v) => v.combos),
    PREFLOP_ITERATIONS
  );
  const potOdds = la.canCall ? la.callAmount / (state.pot + la.callAmount) : 0;

  const inPosition =
    aggressorPosition !== undefined &&
    ACT_ORDER.indexOf(position) > ACT_ORDER.indexOf(aggressorPosition);

  const options: StrategyOption[] = [];
  if (mix.raise > 0 && la.canBetOrRaise) {
    const amount = mix.jam
      ? la.maxRaiseTotal
      : preflopRaiseChips(state, la, mix.sizeKind, position, { limpers, inPosition });
    const isJam = amount >= la.maxRaiseTotal;
    options.push({
      action: isJam ? 'allin' : 'raise',
      amount,
      label: chipLabel(isJam ? 'All-in' : 'Raise to', amount, bb),
      frequency: mix.raise,
    });
  }
  if (mix.call > 0) {
    if (la.canCheck) {
      options.push({ action: 'check', label: 'Check', frequency: mix.call });
    } else if (la.canCall) {
      options.push({
        action: 'call',
        amount: la.callAmount,
        label: chipLabel('Call', la.callAmount, bb),
        frequency: mix.call,
      });
    }
  }
  if (mix.fold > 0) {
    if (la.canCheck) options.push({ action: 'check', label: 'Check', frequency: mix.fold });
    else options.push({ action: 'fold', label: 'Fold', frequency: mix.fold });
  }

  const strategy = normalizeOptions(options);
  const primary = strategy[0];

  const concepts: string[] = ['Preflop ranges'];
  if (mix.jam) concepts.push('Push/fold');
  else if (scenario === 'vsRaise' && mix.raise > 0) concepts.push('3-betting');
  else if (scenario === 'vs3bet') concepts.push('4-bet/call/fold');
  if (la.canCall && mix.call > 0) concepts.push('Pot odds');
  concepts.push('Position');

  const facing = la.canCall
    ? ` You need ${pctText(potOdds)} equity to call; ${code} has ~${pctText(equity)} vs the range(s) you're facing.`
    : '';
  const mixNote =
    strategy.length > 1
      ? ` At equilibrium this hand mixes: ${strategy
          .map((o) => `${o.label} ${pctText(o.frequency)}`)
          .join(', ')}.`
      : '';
  const reason = `${mix.why}${facing}${mixNote}`;

  return {
    action: primary.action,
    raiseSize: primary.amount,
    equity,
    potOdds,
    reason,
    strategy,
    concepts,
    mdf: la.canCall && state.pot > 0 ? Math.max(0, (state.pot - la.callAmount) / state.pot) : undefined,
    evCallBB: la.canCall
      ? (equity * (state.pot + la.callAmount) - la.callAmount) / bb
      : undefined,
    handCategory: preflopCategory(code),
    villainRange: villains.map((v) => v.description).join(' · ') || undefined,
  };
}

function preflopCategory(code: string): string {
  if (['AA', 'KK', 'QQ', 'AKs', 'AKo'].includes(code)) return 'Premium';
  if (code.length === 2) return 'Pocket pair';
  if (code[0] === 'A' && code[2] === 's') return 'Suited ace';
  const broadway = (c: string) => 'AKQJT'.includes(c);
  if (broadway(code[0]) && broadway(code[1])) {
    return code[2] === 's' ? 'Suited broadway' : 'Offsuit broadway';
  }
  if (code[2] === 's') return 'Suited hand';
  return 'Offsuit hand';
}

// ---------------------------------------------------------------------------
// Postflop
// ---------------------------------------------------------------------------

type Texture = {
  paired: boolean;
  monotone: boolean;
  twoTone: boolean;
  connected: boolean;
  dry: boolean;
};

function boardTexture(board: Card[]): Texture {
  const rankVals = board.map((c) => '23456789TJQKA'.indexOf(c.rank) + 2).sort((a, b) => b - a);
  const suitCounts: Record<string, number> = { s: 0, h: 0, d: 0, c: 0 };
  for (const c of board) suitCounts[c.suit]++;
  const maxSuit = Math.max(...Object.values(suitCounts));
  const paired = new Set(board.map((c) => c.rank)).size < board.length;
  const monotone = maxSuit >= 3;
  const twoTone = maxSuit === 2;
  let closeGaps = 0;
  for (let i = 0; i + 1 < rankVals.length; i++) {
    if (rankVals[i] - rankVals[i + 1] <= 2) closeGaps++;
  }
  const connected = closeGaps >= 2 || (rankVals.length >= 2 && rankVals[0] - rankVals[rankVals.length - 1] <= 4);
  const dry = !monotone && !connected && !paired && rankVals[0] >= 12;
  return { paired, monotone, twoTone, connected, dry };
}

type HandClass = 'monster' | 'value' | 'strongDraw' | 'draw' | 'marginal' | 'air';

const CLASS_LABEL: Record<HandClass, string> = {
  monster: 'Monster',
  value: 'Strong value',
  strongDraw: 'Strong draw',
  draw: 'Draw',
  marginal: 'Marginal made hand',
  air: 'Air',
};

function recommendPostflop(state: GameState, seat: number): Recommendation {
  const p = getPlayer(state, seat);
  const la = legalActions(state);
  const bb = state.bigBlind;
  const pot = state.pot;
  const street = state.street;

  const villains = modelVillainRanges(state, seat);
  const equity = equityVsCombos(
    p.holeCards,
    state.board,
    villains.map((v) => v.combos),
    POSTFLOP_ITERATIONS
  );
  const potOdds = la.canCall ? la.callAmount / (pot + la.callAmount) : 0;
  const mdf = la.canCall && pot > 0 ? Math.max(0, (pot - la.callAmount) / pot) : undefined;
  const evCallBB = la.canCall ? (equity * (pot + la.callAmount) - la.callAmount) / bb : undefined;

  const strength = postflopStrength(p.holeCards, state.board);
  const draws = detectDraws(p.holeCards, state.board);
  const texture = boardTexture(state.board);
  const multiway = villains.length >= 2;
  const lastAgg = [...state.actionLog]
    .reverse()
    .find((e) => e.action.type === 'bet' || e.action.type === 'raise' || e.action.type === 'allin');
  const heroIsAggressor = lastAgg?.seat === seat;

  const hasDraw = draws.flushDraw || draws.oesd || draws.gutshot;
  let cls: HandClass;
  if (strength >= 0.9 || equity >= 0.85) cls = 'monster';
  else if (equity >= 0.62) cls = 'value';
  else if (
    street !== 'river' &&
    ((draws.flushDraw && (draws.oesd || draws.gutshot || draws.overcards >= 1)) ||
      (draws.flushDraw && equity >= 0.35) ||
      (draws.oesd && equity >= 0.32))
  )
    cls = 'strongDraw';
  else if (street !== 'river' && hasDraw) cls = 'draw';
  else if (equity >= 0.45) cls = 'marginal';
  else cls = 'air';

  const betOption = (fraction: number, frequency: number): StrategyOption => {
    let amount = Math.round(pot * fraction);
    amount = Math.min(Math.max(amount, la.minRaiseTotal), la.maxRaiseTotal);
    const isJam = amount >= la.maxRaiseTotal * 0.92;
    if (isJam) amount = la.maxRaiseTotal;
    return {
      action: isJam ? 'allin' : 'bet',
      amount,
      label: isJam
        ? chipLabel('All-in', amount, bb)
        : `${chipLabel('Bet', amount, bb)} · ${Math.round(fraction * 100)}% pot`,
      frequency,
    };
  };
  const raiseOption = (frequency: number): StrategyOption => {
    let amount = Math.round(state.currentBet * 2.7);
    amount = Math.min(Math.max(amount, la.minRaiseTotal), la.maxRaiseTotal);
    const isJam = amount >= la.maxRaiseTotal * 0.8;
    if (isJam) amount = la.maxRaiseTotal;
    return {
      action: isJam ? 'allin' : 'raise',
      amount,
      label: chipLabel(isJam ? 'All-in' : 'Raise to', amount, bb),
      frequency,
    };
  };
  const checkOption = (frequency: number): StrategyOption => ({
    action: 'check',
    label: 'Check',
    frequency,
  });
  const callOption = (frequency: number): StrategyOption => ({
    action: 'call',
    amount: la.callAmount,
    label: chipLabel('Call', la.callAmount, bb),
    frequency,
  });
  const foldOption = (frequency: number): StrategyOption => ({
    action: 'fold',
    label: 'Fold',
    frequency,
  });

  const concepts: string[] = [];
  let options: StrategyOption[] = [];
  let why = '';

  if (la.canCheck) {
    // No bet to face.
    switch (cls) {
      case 'monster': {
        concepts.push('Value betting', 'Polarized sizing');
        const big = street === 'river' && !multiway ? 1.25 : 1.0;
        options = [betOption(big, multiway ? 0.85 : 0.7), checkOption(multiway ? 0.15 : 0.3)];
        why = `With ${pctText(equity)} equity you have one of the strongest hands either player can hold. Bet big — ${Math.round(big * 100)}% pot — to build the pot vs worse made hands and draws. The occasional check keeps your checking range protected.`;
        break;
      }
      case 'value': {
        if (texture.dry && heroIsAggressor && street === 'flop' && !multiway) {
          concepts.push('Range betting', 'Board texture');
          options = [betOption(0.33, 0.75), checkOption(0.25)];
          why = `On this dry board your preflop range holds the advantage, so a small 33% pot c-bet at high frequency taxes their whole range cheaply — they can't continue often enough to make you indifferent.`;
        } else {
          concepts.push('Value betting', 'Equity denial');
          options = [betOption(0.66, multiway ? 0.6 : 0.7), checkOption(multiway ? 0.4 : 0.3)];
          why = `${pctText(equity)} equity vs the range(s) you're facing is comfortably enough to value bet. ~⅔ pot charges draws and gets called by worse made hands; checking everything would let them realize equity for free.`;
        }
        break;
      }
      case 'strongDraw': {
        concepts.push('Semi-bluff', 'Fold equity');
        options = [betOption(0.66, multiway ? 0.4 : 0.55), checkOption(multiway ? 0.6 : 0.45)];
        why = `A strong draw is a classic semi-bluff: betting wins the pot outright when they fold, and you still have ~${pctText(equity)} equity when called. Mixing in checks keeps your draws disguised.`;
        break;
      }
      case 'draw': {
        concepts.push('Pot control', 'Equity realization');
        options = [checkOption(0.7), betOption(0.66, 0.3)];
        why = `A weak draw prefers to see the next card cheaply. Check most of the time and take the free card; an occasional semi-bluff stops opponents from auto-betting when you check.`;
        break;
      }
      case 'marginal': {
        concepts.push('Pot control', 'Showdown value');
        if (street === 'river' || multiway) {
          options = [checkOption(0.9), betOption(0.33, 0.1)];
          why = `A marginal made hand has showdown value but gets called mostly by better. Check it down — betting folds out worse and stacks off vs better ("way ahead / way behind").`;
        } else {
          options = [checkOption(0.7), betOption(0.33, 0.3)];
          why = `With ${pctText(equity)} equity you beat some hands but can't stand a raise. Mostly check for pot control; a small bet occasionally denies equity on draw-heavy runouts.`;
        }
        break;
      }
      case 'air': {
        const bluffFreq = multiway ? 0.1 : heroIsAggressor ? 0.4 : 0.3;
        concepts.push('Bluffing', 'Range balance');
        options = [checkOption(1 - bluffFreq), betOption(0.66, bluffFreq)];
        why = multiway
          ? `With ${pctText(equity)} equity and multiple opponents, bluffing burns money — someone always has a piece. Check and give up unless the right runout comes.`
          : `No made hand and ~${pctText(equity)} equity. A balanced strategy still bluffs here some of the time so your bets aren't only value — but the default with pure air is to check.`;
        break;
      }
    }
  } else {
    // Facing a bet.
    const required = potOdds;
    const edge = equity - required;
    switch (cls) {
      case 'monster': {
        concepts.push('Value raising', 'Pot odds');
        options = [raiseOption(0.65), callOption(0.35)];
        why = `${pctText(equity)} equity crushes the ${pctText(required)} you need — this is a value raise. Raising now builds the pot vs their bets and draws; flat-calling occasionally traps and protects your calling range.`;
        break;
      }
      case 'value': {
        concepts.push('Pot odds', 'Value raising');
        if (edge >= 0.2 && la.canBetOrRaise) {
          options = [callOption(0.6), raiseOption(0.4)];
          why = `You need ${pctText(required)} equity to call and you have ${pctText(equity)} — a clear continue. Mixing calls and raises gets value while keeping their bluffs in the pot.`;
        } else {
          options = [callOption(1)];
          why = `${pctText(equity)} equity vs the ${pctText(required)} required makes this a profitable call, but the hand isn't strong enough to raise for value — raising would fold out everything you beat.`;
        }
        break;
      }
      case 'strongDraw': {
        concepts.push('Semi-bluff', 'Pot odds', 'Implied odds');
        if (edge >= 0) {
          options = [callOption(0.7), raiseOption(0.3)];
          why = `Your draw has ${pctText(equity)} equity vs the ${pctText(required)} needed — calling is directly profitable, and a semi-bluff raise adds fold equity on top.`;
        } else if (edge >= -0.08) {
          options = [callOption(0.6), foldOption(0.25), raiseOption(0.15)];
          why = `The direct price is slightly short (${pctText(equity)} vs ${pctText(required)} needed), but implied odds — the extra chips you win when the draw hits — make up the difference. Calling is fine; an occasional raise leverages fold equity.`;
        } else {
          options = [foldOption(0.6), callOption(0.25), raiseOption(0.15)];
          why = `Even a strong draw can't pay this much: ${pctText(equity)} equity vs ${pctText(required)} needed is too far short, and implied odds rarely close a gap that wide.`;
        }
        break;
      }
      case 'draw': {
        concepts.push('Pot odds', 'Implied odds');
        if (edge >= 0) {
          options = [callOption(1)];
          why = `The price is right: ${pctText(equity)} equity vs ${pctText(required)} needed. Call and re-evaluate on the next card.`;
        } else if (edge >= -0.05) {
          options = [callOption(0.5), foldOption(0.5)];
          why = `You're getting almost exactly the price your draw needs (${pctText(equity)} vs ${pctText(required)}). This is a true coin-flip spot — implied odds tip it toward calling vs opponents who will pay you off.`;
        } else {
          options = [foldOption(0.85), callOption(0.15)];
          why = `A weak draw paying ${pctText(required)} with only ${pctText(equity)} equity is a long-term leak. Fold and wait for a better price.`;
        }
        break;
      }
      case 'marginal': {
        concepts.push('Pot odds', 'MDF', 'Bluff-catching');
        if (edge >= 0.05) {
          options = [callOption(0.8), foldOption(0.2)];
          why = `Your bluff-catcher has ${pctText(equity)} equity vs the ${pctText(required)} required — calling shows a profit. Folding everything this strong would let them bluff you relentlessly (MDF here is ${pctText(mdf ?? 0)}).`;
        } else if (edge >= -0.05) {
          options = [callOption(0.5), foldOption(0.5)];
          why = `This is a textbook indifference spot: ${pctText(equity)} equity vs ${pctText(required)} needed. GTO mixes calls and folds ~50/50 so you can't be exploited either way — vs aggressive opponents lean call, vs passive ones lean fold.`;
        } else {
          options = [foldOption(0.85), callOption(0.15)];
          why = `${pctText(equity)} equity falls short of the ${pctText(required)} the pot is laying you. Calling here bleeds chips — your hand mostly loses at showdown.`;
        }
        break;
      }
      case 'air': {
        concepts.push('Pot odds', 'Discipline');
        options = [foldOption(1)];
        why = `With ${pctText(equity)} equity and no draw vs the ${pctText(required)} required, this is a pure fold. Saving these bets is where most of your win-rate comes from.`;
        break;
      }
    }
  }

  const strategy = normalizeOptions(options);
  const primary = strategy[0];

  const streetName = street.charAt(0).toUpperCase() + street.slice(1);
  const spot = `${streetName}, pot ${inBB(pot, bb)}${
    la.canCall ? `, facing ${inBB(la.callAmount, bb)} to call` : ''
  } vs ${villains.map((v) => v.description).join(' · ')}.`;
  const mixNote =
    strategy.length > 1
      ? ` Mix: ${strategy.map((o) => `${o.label} ${pctText(o.frequency)}`).join(', ')}.`
      : '';

  return {
    action: primary.action,
    raiseSize: primary.amount,
    equity,
    potOdds,
    reason: `${spot} ${why}${mixNote}`,
    strategy,
    concepts,
    mdf,
    evCallBB,
    handCategory: CLASS_LABEL[cls],
    villainRange: villains.map((v) => v.description).join(' · ') || undefined,
  };
}

// ---------------------------------------------------------------------------
// Decision grading
// ---------------------------------------------------------------------------

type ActionFamily = 'aggro' | 'call' | 'check' | 'fold';

function familyOf(t: ActionType): ActionFamily {
  if (t === 'bet' || t === 'raise' || t === 'allin') return 'aggro';
  if (t === 'call') return 'call';
  if (t === 'check') return 'check';
  return 'fold';
}

/**
 * Grade what the player actually did against the recommended strategy mix.
 * EV loss is an estimate in big blinds, derived from equity vs price where
 * computable and from frequency tiers otherwise.
 */
export function gradeDecision(
  rec: Recommendation,
  actual: PlayerAction,
  snapshot: GameStateSnapshot
): { grade: DecisionGrade; evLossBB: number } {
  const bb = snapshot.bigBlind || 1;
  const pot = snapshot.pot;
  const call = snapshot.toCall;
  const fam = familyOf(actual.type);

  const matched = rec.strategy.find((o) => familyOf(o.action) === fam);
  const fmax = rec.strategy.reduce((m, o) => Math.max(m, o.frequency), 0);

  if (matched) {
    let tier: 0 | 1 | 2; // 0=best, 1=good, 2=inaccuracy
    if (matched.frequency >= fmax - 0.1) tier = 0;
    else if (matched.frequency >= 0.25) tier = 1;
    else tier = 2;

    // Sizing check for aggressive actions: way off the recommended size costs a tier.
    if (fam === 'aggro' && matched.amount && actual.amount) {
      const ratio = actual.amount / matched.amount;
      if ((ratio < 0.55 || ratio > 1.9) && tier < 2) tier = (tier + 1) as 0 | 1 | 2;
    }

    const grades: DecisionGrade[] = ['best', 'good', 'inaccuracy'];
    const losses = [0, 0.15, 0.45];
    return { grade: grades[tier], evLossBB: losses[tier] };
  }

  // The action wasn't in the mix at all — estimate how much it cost.
  let lossBB: number;
  if (fam === 'fold') {
    const evCall = call > 0 ? rec.equity * (pot + call) - call : rec.equity * pot * 0.5;
    lossBB = Math.max(0.5, evCall / bb);
  } else if (fam === 'call') {
    const evCall = rec.equity * (pot + call) - call;
    lossBB = Math.max(0.4, -evCall / bb);
  } else if (fam === 'aggro') {
    const risked = actual.amount ?? Math.max(call, Math.round(pot * 0.66));
    const deficit = Math.max(0.08, rec.potOdds - rec.equity + 0.08);
    lossBB = Math.max(0.6, (deficit * (pot + 2 * risked)) / bb / 2);
  } else {
    // Checked when the mix was pure betting — missed value/bluff.
    lossBB = Math.max(0.4, ((rec.equity - 0.5) * pot) / bb / 2);
  }
  lossBB = Math.min(lossBB, 25);

  const grade: DecisionGrade = lossBB >= 2 ? 'blunder' : lossBB >= 0.75 ? 'mistake' : 'inaccuracy';
  return { grade, evLossBB: Math.round(lossBB * 100) / 100 };
}

/** Weighted accuracy score 0..100 for a set of graded decisions. */
export function accuracyScore(grades: DecisionGrade[]): number {
  if (grades.length === 0) return 100;
  const weight: Record<DecisionGrade, number> = {
    best: 1,
    good: 0.85,
    inaccuracy: 0.6,
    mistake: 0.3,
    blunder: 0,
  };
  const total = grades.reduce((s, g) => s + weight[g], 0);
  return Math.round((total / grades.length) * 100);
}
