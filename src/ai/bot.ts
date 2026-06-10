import { GameState, Player, PlayerAction } from '@shared/types';
import { getPlayer, legalActions } from '@engine/gameState';
import {
  buildPreflopContext,
  preflopMix,
  preflopRaiseChips,
} from '@gto/preflopCharts';
import { Personality, PERSONALITIES, PersonalityName } from './personalities';
import { detectDraws, strengthFor } from './handStrength';

/** Choose an action for the bot currently to act. */
export function decideAction(state: GameState, rng: () => number = Math.random): PlayerAction {
  const p = getPlayer(state, state.toAct);
  const personalityName: PersonalityName =
    (p.personality as PersonalityName) ?? 'TAG';
  const personality = PERSONALITIES[personalityName];
  const la = legalActions(state);

  if (state.street === 'preflop') {
    return decidePreflop(state, p, personality, la, rng);
  }
  return decidePostflop(state, p, personality, la, rng);
}

/**
 * Preflop: sample from the GTO chart mix, skewed by personality.
 * freq^(1/aggression) keeps pure strategies pure while shifting mixed hands.
 */
function decidePreflop(
  state: GameState,
  p: Player,
  pers: Personality,
  la: ReturnType<typeof legalActions>,
  rng: () => number
): PlayerAction {
  const ctx = buildPreflopContext(state, state.toAct);
  const mix = preflopMix(p.holeCards, ctx);

  const skew = (freq: number, factor: number): number =>
    freq <= 0 ? 0 : freq >= 1 ? 1 : Math.pow(freq, 1 / factor);

  let raise = skew(mix.raise, pers.aggression);
  let call = skew(mix.call, pers.looseness);
  // Passive players turn some of their raises into calls instead of folds.
  if (pers.aggression < 1) {
    call = Math.min(1, call + (mix.raise - raise) * (pers.looseness > 1 ? 0.9 : 0.3));
  }
  if (raise + call > 1) {
    const scale = 1 / (raise + call);
    raise *= scale;
    call *= scale;
  }

  const roll = rng();
  if (roll < raise && la.canBetOrRaise) {
    if (mix.jam) return { type: 'allin' };
    let amount = preflopRaiseChips(state, la, mix.sizeKind, ctx.position, {
      limpers: ctx.limpers,
      inPosition: true,
    });
    amount = Math.round((amount * pers.raiseMultiplier) / 3);
    amount = Math.min(Math.max(amount, la.minRaiseTotal), la.maxRaiseTotal);
    if (amount >= la.maxRaiseTotal) return { type: 'allin' };
    return { type: 'raise', amount };
  }
  if (roll < raise + call) {
    if (la.canCheck) return { type: 'check' };
    if (la.canCall) return { type: 'call' };
  }
  if (la.canCheck) return { type: 'check' };
  return { type: 'fold' };
}

function decidePostflop(
  state: GameState,
  p: Player,
  pers: Personality,
  la: ReturnType<typeof legalActions>,
  rng: () => number
): PlayerAction {
  const strength = strengthFor(p.holeCards, state.board, state.street);
  const draws = detectDraws(p.holeCards, state.board);
  const strongDraw = draws.flushDraw || draws.oesd;
  const potOdds = la.canCall ? la.callAmount / (state.pot + la.callAmount) : 0;
  const facingBet = state.currentBet > 0;

  if (!facingBet) {
    // Short-stacked with a real hand: jam rather than leave crumbs behind.
    if (la.canBetOrRaise && p.stack <= state.pot && strength >= 0.55) {
      return { type: 'allin' };
    }
    if (strength >= pers.valueBetThreshold && la.canBetOrRaise) {
      const betAmt = Math.max(
        state.bigBlind,
        Math.round(state.pot * pers.betSize)
      );
      const total = Math.min(betAmt, la.maxRaiseTotal);
      if (total >= la.minRaiseTotal) {
        return { type: 'bet', amount: total };
      }
    }
    // Semi-bluff draws and occasionally bluff air.
    const bluffChance = strongDraw ? Math.min(0.6, pers.bluffFreq * 2) : pers.bluffFreq;
    if (rng() < bluffChance && la.canBetOrRaise) {
      const betAmt = Math.max(state.bigBlind, Math.round(state.pot * 0.6));
      const total = Math.min(betAmt, la.maxRaiseTotal);
      if (total >= la.minRaiseTotal) return { type: 'bet', amount: total };
    }
    return { type: 'check' };
  }

  // Facing a bet.
  if (strength >= pers.valueBetThreshold + 0.1 && la.canBetOrRaise) {
    const raiseTo = Math.min(
      Math.round(state.currentBet * pers.raiseMultiplier),
      la.maxRaiseTotal
    );
    if (raiseTo >= la.minRaiseTotal) {
      if (raiseTo >= la.maxRaiseTotal) return { type: 'allin' };
      return { type: 'raise', amount: raiseTo };
    }
  }
  // Draws: semi-bluff raise occasionally, otherwise call with a fair price.
  if (strongDraw && state.street !== 'river') {
    if (rng() < pers.bluffFreq * 0.6 && la.canBetOrRaise) {
      const raiseTo = Math.min(Math.round(state.currentBet * 2.7), la.maxRaiseTotal);
      if (raiseTo >= la.minRaiseTotal && raiseTo < la.maxRaiseTotal) {
        return { type: 'raise', amount: raiseTo };
      }
    }
    if (la.canCall && potOdds <= 0.34) return { type: 'call' };
  }
  if (
    draws.gutshot &&
    draws.overcards >= 1 &&
    state.street !== 'river' &&
    la.canCall &&
    potOdds <= 0.22
  ) {
    return { type: 'call' };
  }
  const effectiveThreshold = Math.max(pers.callBetThreshold, potOdds);
  if (strength >= effectiveThreshold && la.canCall) {
    return { type: 'call' };
  }
  if (la.canCheck) return { type: 'check' };
  return { type: 'fold' };
}
