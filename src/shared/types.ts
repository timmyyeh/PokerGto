export type Suit = 's' | 'h' | 'd' | 'c';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export type Card = {
  rank: Rank;
  suit: Suit;
};

export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUITS: Suit[] = ['s', 'h', 'd', 'c'];

export type Position =
  | 'BTN'
  | 'SB'
  | 'BB'
  | 'UTG'
  | 'UTG1'
  | 'MP'
  | 'HJ'
  | 'CO';

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export type PlayerAction = {
  type: ActionType;
  amount?: number;
};

export type PlayerState = 'active' | 'folded' | 'allin' | 'sitting-out';

export type Player = {
  seat: number;
  name: string;
  isHero: boolean;
  stack: number;
  holeCards: Card[];
  bet: number;
  totalContribution: number;
  state: PlayerState;
  position?: Position;
  personality?: string;
  /** Internal: whether this player has acted since the most recent aggression on this street. */
  _actedSinceAgg?: boolean;
};

export type GameState = {
  players: Player[];
  buttonSeat: number;
  street: Street;
  board: Card[];
  pot: number;
  currentBet: number;
  minRaise: number;
  toAct: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  actionLog: ActionLogEntry[];
  decisions: Decision[];
  winners: number[];
  /** Internal: remaining undealt cards for this hand. */
  _deck?: Card[];
};

export type ActionLogEntry = {
  seat: number;
  street: Street;
  action: PlayerAction;
  potAfter: number;
};

/** One arm of a GTO-style mixed strategy, e.g. "Bet 66% pot — 70%". */
export type StrategyOption = {
  action: ActionType;
  /** Total chips committed this street, for bet/raise/allin options. */
  amount?: number;
  /** Human label, e.g. "Raise to 5.5bb" or "Bet 12 (66% pot)". */
  label: string;
  /** Frequency 0..1; options in a strategy sum to ~1. */
  frequency: number;
};

export type DecisionGrade = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export type Recommendation = {
  /** Primary (highest-frequency) action — kept for backwards compatibility. */
  action: ActionType;
  raiseSize?: number;
  /** Hero equity vs the modeled villain ranges (not random hands). */
  equity: number;
  /** Required equity to call (call / (pot + call)); 0 when no bet faced. */
  potOdds: number;
  reason: string;
  /** Full GTO-style strategy mix, sorted by frequency descending. */
  strategy: StrategyOption[];
  /** Concept tags driving the recommendation, e.g. ["Pot odds", "Semi-bluff"]. */
  concepts: string[];
  /** Minimum defense frequency vs the bet faced (only when facing a bet). */
  mdf?: number;
  /** EV of calling, in big blinds (only when facing a bet). */
  evCallBB?: number;
  /** Plain-language hand class, e.g. "Strong draw". */
  handCategory?: string;
  /** Summary of modeled villain ranges, e.g. "CO opener (~28% of hands)". */
  villainRange?: string;
};

export type Decision = {
  street: Street;
  seat: number;
  snapshot: GameStateSnapshot;
  actual: PlayerAction;
  recommendation: Recommendation;
  grade: DecisionGrade;
  /** Estimated EV lost vs the recommended play, in big blinds. */
  evLossBB: number;
};

export type GameStateSnapshot = {
  pot: number;
  toCall: number;
  heroStack: number;
  heroCards: Card[];
  board: Card[];
  position?: Position;
  numActiveOpponents: number;
  street: Street;
  bigBlind: number;
};
