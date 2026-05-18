import { GameState, PlayerAction } from '@shared/types';
import { getPlayer, legalActions } from '@engine/gameState';
import { Personality, PERSONALITIES, PersonalityName } from './personalities';
import { strengthFor } from './handStrength';

/** Choose an action for the bot currently to act. */
export function decideAction(state: GameState, rng: () => number = Math.random): PlayerAction {
  const p = getPlayer(state, state.toAct);
  const personalityName: PersonalityName =
    (p.personality as PersonalityName) ?? 'TAG';
  const personality = PERSONALITIES[personalityName];
  const la = legalActions(state);
  const strength = strengthFor(p.holeCards, state.board, state.street);

  const potOdds = la.canCall
    ? la.callAmount / (state.pot + la.callAmount)
    : 0;

  // Preflop logic.
  if (state.street === 'preflop') {
    return decidePreflop(state, personality, strength, la, potOdds, rng);
  }
  // Postflop logic.
  return decidePostflop(state, personality, strength, la, potOdds, rng);
}

function decidePreflop(
  state: GameState,
  pers: Personality,
  strength: number,
  la: ReturnType<typeof legalActions>,
  potOdds: number,
  _rng: () => number
): PlayerAction {
  const facingRaise = state.currentBet > state.bigBlind;

  if (!facingRaise) {
    // No raise yet → either open-raise, limp (rare), or fold.
    if (strength >= pers.openThreshold && la.canBetOrRaise) {
      const raiseTo = Math.min(
        Math.round(state.bigBlind * pers.raiseMultiplier),
        la.maxRaiseTotal
      );
      if (raiseTo >= la.minRaiseTotal) {
        return { type: 'raise', amount: raiseTo };
      }
    }
    if (la.canCheck) return { type: 'check' };
    // Facing only blinds — limp with marginal, fold weak.
    if (strength >= pers.openThreshold * 0.85 && potOdds < 0.15) {
      return { type: 'call' };
    }
    return { type: 'fold' };
  }

  // Facing a raise.
  if (strength >= pers.callRaiseThreshold + 0.15 && la.canBetOrRaise) {
    // Strong: 3bet
    const raiseTo = Math.min(
      Math.round(state.currentBet * pers.raiseMultiplier),
      la.maxRaiseTotal
    );
    if (raiseTo >= la.minRaiseTotal) {
      return { type: 'raise', amount: raiseTo };
    }
  }
  if (strength >= pers.callRaiseThreshold && la.canCall) {
    return { type: 'call' };
  }
  if (la.canCheck) return { type: 'check' };
  return { type: 'fold' };
}

function decidePostflop(
  state: GameState,
  pers: Personality,
  strength: number,
  la: ReturnType<typeof legalActions>,
  potOdds: number,
  rng: () => number
): PlayerAction {
  const facingBet = state.currentBet > 0;

  if (!facingBet) {
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
    // Bluff sometimes from weak hands.
    if (rng() < pers.bluffFreq && la.canBetOrRaise) {
      const betAmt = Math.max(state.bigBlind, Math.round(state.pot * 0.5));
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
      return { type: 'raise', amount: raiseTo };
    }
  }
  // Call if strength > pot-odds-adjusted threshold.
  const effectiveThreshold = Math.max(pers.callBetThreshold, potOdds);
  if (strength >= effectiveThreshold && la.canCall) {
    return { type: 'call' };
  }
  if (la.canCheck) return { type: 'check' };
  return { type: 'fold' };
}
