import {
  Card,
  GameState,
  Player,
  PlayerAction,
  Position,
  Street,
} from '@shared/types';
import { shuffledDeck } from './deck';
import { pickWinners } from './handEvaluator';
import { assignPositions, orderFromButton } from './positions';

export type PlayerSeed = {
  seat: number;
  name: string;
  isHero: boolean;
  stack: number;
  personality?: string;
};

export type StartHandOptions = {
  smallBlind: number;
  bigBlind: number;
  buttonSeat: number;
  ante?: number; // per-player ante, posted before blinds (tournaments)
  deck?: Card[]; // for tests
};

/** Initialize a fresh hand: post blinds, deal hole cards, set toAct. */
export function startHand(seeds: PlayerSeed[], opts: StartHandOptions): GameState {
  const seats = seeds.map((s) => s.seat);
  const positions = assignPositions(seats, opts.buttonSeat);

  const players: Player[] = seeds.map((s) => ({
    seat: s.seat,
    name: s.name,
    isHero: s.isHero,
    stack: s.stack,
    holeCards: [],
    bet: 0,
    totalContribution: 0,
    state: s.stack > 0 ? 'active' : 'sitting-out',
    position: positions.get(s.seat),
    personality: s.personality,
  }));

  const state: GameState = {
    players,
    buttonSeat: opts.buttonSeat,
    street: 'preflop',
    board: [],
    pot: 0,
    currentBet: 0,
    minRaise: opts.bigBlind,
    toAct: -1,
    smallBlind: opts.smallBlind,
    bigBlind: opts.bigBlind,
    ante: opts.ante ?? 0,
    actionLog: [],
    decisions: [],
    winners: [],
  };

  const deck = (opts.deck ?? shuffledDeck()).slice();

  // Deal 2 cards to each active player (one at a time, starting left of button).
  const activeSeats = orderFromButton(seats, opts.buttonSeat).filter(
    (seat) => playerBySeat(state, seat).state === 'active'
  );
  for (let round = 0; round < 2; round++) {
    for (const seat of activeSeats) {
      playerBySeat(state, seat).holeCards.push(deck.shift()!);
    }
  }
  // Stash the remainder for board.
  state._deck = deck;

  // Post antes first (they go to the pot but don't count toward the street bet).
  if (state.ante > 0) {
    for (const seat of orderFromButton(seats, opts.buttonSeat)) {
      const p = playerBySeat(state, seat);
      if (p.state !== 'active') continue;
      const amt = Math.min(state.ante, p.stack);
      p.stack -= amt;
      p.totalContribution += amt;
      state.pot += amt;
      if (p.stack === 0) p.state = 'allin';
    }
  }

  // Post blinds. Use only active (chips-having) seats so busted seats are skipped.
  const orderAll = orderFromButton(seats, opts.buttonSeat);
  const orderActive = orderAll.filter(
    (seat) => playerBySeat(state, seat).state === 'active'
  );
  let sbSeat: number;
  let bbSeat: number;
  if (orderActive.length === 2) {
    // Heads-up: BTN posts SB, other posts BB. BTN must be one of the active seats.
    sbSeat = orderActive[0];
    bbSeat = orderActive[1];
  } else {
    sbSeat = orderActive[1];
    bbSeat = orderActive[2];
  }
  contribute(state, sbSeat, Math.min(opts.smallBlind, playerBySeat(state, sbSeat).stack));
  contribute(state, bbSeat, Math.min(opts.bigBlind, playerBySeat(state, bbSeat).stack));
  state.currentBet = opts.bigBlind;

  // First to act preflop: seat after BB (or BTN heads-up).
  if (orderActive.length === 2) {
    state.toAct = sbSeat;
  } else {
    const bbIdx = orderActive.indexOf(bbSeat);
    state.toAct = orderActive[(bbIdx + 1) % orderActive.length];
  }

  return state;
}

function playerBySeat(state: GameState, seat: number): Player {
  const p = state.players.find((pl) => pl.seat === seat);
  if (!p) throw new Error(`no player at seat ${seat}`);
  return p;
}

function contribute(state: GameState, seat: number, amount: number) {
  const p = playerBySeat(state, seat);
  const actual = Math.min(amount, p.stack);
  p.stack -= actual;
  p.bet += actual;
  p.totalContribution += actual;
  state.pot += actual;
  if (p.stack === 0) p.state = 'allin';
}

function activePlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.state === 'active');
}

function contendingPlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.state === 'active' || p.state === 'allin');
}

/** All possible legal actions for the current to-act player. */
export type LegalActions = {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBetOrRaise: boolean;
  minRaiseTotal: number; // total bet level after raise
  maxRaiseTotal: number; // all-in cap
};

export function legalActions(state: GameState): LegalActions {
  const p = playerBySeat(state, state.toAct);
  const toCall = Math.max(0, state.currentBet - p.bet);
  const canCheck = toCall === 0;
  const canCall = toCall > 0 && p.stack > 0;
  const callAmount = Math.min(toCall, p.stack);
  const canBetOrRaise = p.stack > 0;
  const minRaiseTotal = state.currentBet + state.minRaise;
  const maxRaiseTotal = p.bet + p.stack;
  return {
    canFold: true,
    canCheck,
    canCall,
    callAmount,
    canBetOrRaise,
    minRaiseTotal: Math.min(minRaiseTotal, maxRaiseTotal),
    maxRaiseTotal,
  };
}

/** Apply an action by the current to-act player. Mutates state. */
export function applyAction(state: GameState, action: PlayerAction): void {
  const p = playerBySeat(state, state.toAct);
  if (p.state !== 'active') {
    throw new Error(`player at seat ${p.seat} is not active`);
  }

  switch (action.type) {
    case 'fold': {
      p.state = 'folded';
      break;
    }
    case 'check': {
      if (state.currentBet !== p.bet) throw new Error('cannot check, must call/fold/raise');
      break;
    }
    case 'call': {
      const owed = Math.max(0, state.currentBet - p.bet);
      if (owed === 0) throw new Error('nothing to call; use check');
      contribute(state, p.seat, owed);
      break;
    }
    case 'bet':
    case 'raise':
    case 'allin': {
      const totalBet =
        action.type === 'allin'
          ? p.bet + p.stack
          : action.amount ?? 0; // amount is *total* committed bet for this street
      if (totalBet <= p.bet) throw new Error('raise must increase bet');

      const isOpen = state.currentBet === 0;
      const owedNow = totalBet - p.bet;
      if (owedNow > p.stack) throw new Error('insufficient chips to raise to this size');

      const isAllIn = owedNow === p.stack;
      const minOpenSize = state.bigBlind;
      const minRaiseTotal = state.currentBet + state.minRaise;

      if (!isAllIn) {
        if (isOpen && totalBet < minOpenSize)
          throw new Error(`min bet is ${minOpenSize}`);
        if (!isOpen && totalBet < minRaiseTotal)
          throw new Error(`min raise total is ${minRaiseTotal}`);
      }

      const raiseDelta = totalBet - state.currentBet;
      contribute(state, p.seat, owedNow);

      // Only a *full* raise (>= min raise) reopens action to players who already acted.
      // All-in for less than a full raise or all-in matching current bet does not reopen.
      if (raiseDelta >= state.minRaise) {
        state.minRaise = raiseDelta;
        for (const other of state.players) {
          if (other.seat !== p.seat && other.state === 'active') {
            other._actedSinceAgg = false;
          }
        }
      }
      state.currentBet = Math.max(state.currentBet, totalBet);
      break;
    }
  }

  p._actedSinceAgg = true;
  state.actionLog.push({
    seat: p.seat,
    street: state.street,
    action,
    potAfter: state.pot,
  });

  advanceTurn(state);
}

function advanceTurn(state: GameState): void {
  // If only one contender remains (everyone else folded), end the hand immediately.
  if (contendingPlayers(state).length === 1) {
    settleHand(state);
    return;
  }

  // Find next active player after current toAct.
  const seats = state.players.map((p) => p.seat);
  const order = orderFromButton(seats, state.buttonSeat);
  const curIdx = order.indexOf(state.toAct);

  for (let i = 1; i <= order.length; i++) {
    const candidate = order[(curIdx + i) % order.length];
    const cp = playerBySeat(state, candidate);
    if (cp.state !== 'active') continue;
    state.toAct = candidate;
    break;
  }

  if (isBettingRoundComplete(state)) {
    advanceStreet(state);
  }
}

function isBettingRoundComplete(state: GameState): boolean {
  const actives = activePlayers(state);
  if (actives.length <= 1) return true;
  // Every active player must have matched currentBet AND acted since last aggression.
  return actives.every(
    (p) => p.bet === state.currentBet && p._actedSinceAgg === true
  );
}

function advanceStreet(state: GameState): void {
  // Move bets into pot accounting is already done; just reset per-street bet trackers.
  for (const p of state.players) {
    p.bet = 0;
    p._actedSinceAgg = false;
  }
  state.currentBet = 0;
  state.minRaise = state.bigBlind;

  const next: Street =
    state.street === 'preflop'
      ? 'flop'
      : state.street === 'flop'
      ? 'turn'
      : state.street === 'turn'
      ? 'river'
      : 'showdown';

  const deck = state._deck!;
  if (next === 'flop') {
    state.board.push(deck.shift()!, deck.shift()!, deck.shift()!);
  } else if (next === 'turn' || next === 'river') {
    state.board.push(deck.shift()!);
  }

  state.street = next;

  // If only one active and others all-in, fast-forward to showdown.
  if (activePlayers(state).length <= 1 && next !== 'showdown') {
    advanceStreet(state);
    return;
  }

  if (next === 'showdown') {
    settleHand(state);
    return;
  }

  // First to act postflop: first active player after BTN.
  const seats = state.players.map((p) => p.seat);
  const order = orderFromButton(seats, state.buttonSeat);
  for (let i = 1; i <= order.length; i++) {
    const seat = order[i % order.length];
    if (playerBySeat(state, seat).state === 'active') {
      state.toAct = seat;
      return;
    }
  }
}

/** Resolve pots (main + sides) and award chips. */
function settleHand(state: GameState): void {
  const contenders = contendingPlayers(state);
  const allPlayers = state.players;

  if (contenders.length === 1) {
    contenders[0].stack += state.pot;
    state.winners = [contenders[0].seat];
    state.pot = 0;
    state.street = 'complete';
    return;
  }

  // Build side pots from sorted contributions.
  const uniqueLevels = Array.from(
    new Set(contenders.map((p) => p.totalContribution))
  ).sort((a, b) => a - b);

  let prevCap = 0;
  const winners = new Set<number>();

  for (const cap of uniqueLevels) {
    let pool = 0;
    for (const p of allPlayers) {
      pool += Math.min(cap, p.totalContribution) - Math.min(prevCap, p.totalContribution);
    }
    if (pool <= 0) {
      prevCap = cap;
      continue;
    }
    const eligible = contenders.filter((p) => p.totalContribution >= cap);
    const winnerSeats = pickWinners(
      eligible.map((p) => ({ seat: p.seat, holeCards: p.holeCards })),
      state.board
    ).map((w) => w.seat);

    const share = Math.floor(pool / winnerSeats.length);
    const remainder = pool - share * winnerSeats.length;
    winnerSeats.forEach((seat, i) => {
      playerBySeat(state, seat).stack += share + (i === 0 ? remainder : 0);
      winners.add(seat);
    });

    prevCap = cap;
  }

  state.winners = Array.from(winners);
  state.pot = 0;
  state.street = 'complete';
}

/** Player at seat, throwing if not found. Re-exported for callers. */
export function getPlayer(state: GameState, seat: number): Player {
  return playerBySeat(state, seat);
}

/** Map seat -> position name (for UI badges). */
export function positionsFor(state: GameState): Map<number, Position | undefined> {
  return new Map(state.players.map((p) => [p.seat, p.position]));
}
