import {
  GameState,
  Recommendation,
  GameStateSnapshot,
  Position,
} from '@shared/types';
import { getPlayer, legalActions } from '@engine/gameState';
import { monteCarloEquity } from './equity';
import { getPreflopAction, PreflopScenario } from './preflopCharts';
import { postflopStrength } from '@ai/handStrength';

/** Number of MC iterations for postflop equity in the recommender. */
const MC_ITERATIONS = 600;

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
  };
}

/** Recommend an action for the given seat in the current game state. */
export function recommend(state: GameState, seat: number): Recommendation {
  const opponents = state.players.filter(
    (pl) => pl.seat !== seat && (pl.state === 'active' || pl.state === 'allin')
  ).length;

  if (state.street === 'preflop') {
    return recommendPreflop(state, seat, opponents);
  }
  return recommendPostflop(state, seat, opponents);
}

function recommendPreflop(state: GameState, seat: number, opponents: number): Recommendation {
  const p = getPlayer(state, seat);
  const la = legalActions(state);

  const position: Position = p.position ?? 'BTN';

  // Determine scenario by counting raises and limps on this street.
  const preflopActions = state.actionLog.filter((e) => e.street === 'preflop');
  const numRaises = preflopActions.filter(
    (a) => a.action.type === 'raise' || a.action.type === 'allin'
  ).length;
  const limpers = preflopActions.filter(
    (a) => a.action.type === 'call' && a.seat !== p.seat
  ).length;

  let scenario: PreflopScenario;
  if (numRaises === 0) scenario = limpers > 0 ? 'limpedPot' : 'open';
  else if (numRaises === 1) scenario = 'vsRaise';
  else scenario = 'vs3bet';

  // Estimate equity vs opponents (random ranges for MVP).
  const equity = monteCarloEquity(p.holeCards, state.board, Math.max(1, opponents), 300);
  const potOdds = la.canCall ? la.callAmount / (state.pot + la.callAmount) : 0;

  const chartAction = getPreflopAction(p.holeCards, position, scenario);

  switch (chartAction.type) {
    case 'raise': {
      const raiseTotal = Math.min(
        Math.max(la.minRaiseTotal, Math.round(chartAction.sizingBB * state.bigBlind)),
        la.maxRaiseTotal
      );
      return {
        action: scenario === 'open' || scenario === 'limpedPot' ? 'raise' : 'raise',
        raiseSize: raiseTotal,
        equity,
        potOdds,
        reason: chartAction.reason,
      };
    }
    case 'call':
      return { action: 'call', equity, potOdds, reason: chartAction.reason };
    case 'check':
      return { action: 'check', equity, potOdds, reason: chartAction.reason };
    case 'fold':
      return { action: 'fold', equity, potOdds, reason: chartAction.reason };
  }
}

function recommendPostflop(state: GameState, seat: number, opponents: number): Recommendation {
  const p = getPlayer(state, seat);
  const la = legalActions(state);

  const equity = monteCarloEquity(
    p.holeCards,
    state.board,
    Math.max(1, opponents),
    MC_ITERATIONS
  );
  const potOdds = la.canCall ? la.callAmount / (state.pot + la.callAmount) : 0;
  const strength = postflopStrength(p.holeCards, state.board);

  // No bet to face — decide between check and value bet.
  if (la.canCheck) {
    // Value-bet when equity is strong; check otherwise.
    if (equity >= 0.6 && la.canBetOrRaise) {
      const sizing = Math.min(
        Math.max(la.minRaiseTotal, Math.round(state.pot * 0.66)),
        la.maxRaiseTotal
      );
      return {
        action: 'bet',
        raiseSize: sizing,
        equity,
        potOdds,
        reason: `Your hand has ${(equity * 100).toFixed(0)}% equity vs ${opponents} villain(s). With this much equity, betting ~⅔ pot extracts value from worse hands and denies free cards to draws.`,
      };
    }
    if (equity >= 0.45 && la.canBetOrRaise && strength >= 0.4) {
      const sizing = Math.min(
        Math.max(la.minRaiseTotal, Math.round(state.pot * 0.5)),
        la.maxRaiseTotal
      );
      return {
        action: 'bet',
        raiseSize: sizing,
        equity,
        potOdds,
        reason: `Marginal made hand (${(equity * 100).toFixed(0)}% equity); a small bet protects vs draws while keeping worse hands in.`,
      };
    }
    return {
      action: 'check',
      equity,
      potOdds,
      reason: `${(equity * 100).toFixed(0)}% equity isn't enough to bet for value here. Checking keeps the pot manageable and lets you realize equity passively.`,
    };
  }

  // Facing a bet.
  if (equity >= potOdds + 0.18 && la.canBetOrRaise) {
    // Strong: raise.
    const sizing = Math.min(
      Math.max(la.minRaiseTotal, Math.round(state.currentBet * 2.5 + state.pot * 0.3)),
      la.maxRaiseTotal
    );
    return {
      action: 'raise',
      raiseSize: sizing,
      equity,
      potOdds,
      reason: `Equity ${(equity * 100).toFixed(0)}% well exceeds the ${(potOdds * 100).toFixed(0)}% needed to call. Raising builds the pot vs a range that contains weaker made hands and draws.`,
    };
  }
  if (equity >= potOdds + 0.03) {
    return {
      action: 'call',
      equity,
      potOdds,
      reason: `Equity ${(equity * 100).toFixed(0)}% > pot odds ${(potOdds * 100).toFixed(0)}%. Calling realizes positive expectation; the hand isn't strong enough to raise for value.`,
    };
  }
  return {
    action: 'fold',
    equity,
    potOdds,
    reason: `Equity ${(equity * 100).toFixed(0)}% is below the ${(potOdds * 100).toFixed(0)}% required by pot odds; calling loses chips long-term.`,
  };
}
