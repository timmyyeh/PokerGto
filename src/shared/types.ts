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
  | 'MP1'
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

export type Recommendation = {
  action: ActionType;
  raiseSize?: number;
  equity: number;
  potOdds: number;
  reason: string;
};

export type Decision = {
  street: Street;
  seat: number;
  snapshot: GameStateSnapshot;
  actual: PlayerAction;
  recommendation: Recommendation;
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
};
