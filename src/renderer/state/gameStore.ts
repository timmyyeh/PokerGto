import { create } from 'zustand';
import { GameState, PlayerAction } from '@shared/types';
import { startHand, applyAction, legalActions } from '@engine/gameState';
import { decideAction } from '@ai/bot';
import { PERSONALITY_LIST, PersonalityName } from '@ai/personalities';
import { recommend, snapshotFor } from '@gto/recommend';

export type GameMode = 'cash' | 'tournament';

export type GameConfig = {
  mode: GameMode;
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  // Tournament-only
  startingStack?: number;
  levelDurationMinutes?: number;
  levels?: { sb: number; bb: number; ante: number }[];
};

type GameStore = {
  config: GameConfig | null;
  state: GameState | null;
  heroSeat: number;
  buttonSeat: number;
  currentLevelIndex: number;
  levelStartedAt: number | null;
  /** Stacks across hands (for cash: re-fills on rebuy; tournament: persists). */
  stacks: Record<number, number>;
  /** Tournament: place finished for hero (1 = won, N = first eliminated). null if not finished. */
  tournamentFinish: number | null;

  startSession: (config: GameConfig) => void;
  startNewHand: () => void;
  submitHeroAction: (action: PlayerAction) => void;
  runBots: () => void;
  endSession: () => void;
  tickTournamentLevel: () => void;
};

const BOT_NAMES = ['Avery', 'Blake', 'Casey', 'Devon', 'Eli', 'Frankie', 'Gray'];

export const useGameStore = create<GameStore>((set, get) => ({
  config: null,
  state: null,
  heroSeat: 0,
  buttonSeat: 0,
  currentLevelIndex: 0,
  levelStartedAt: null,
  stacks: {},
  tournamentFinish: null,

  startSession: (config) => {
    const heroSeat = 0;
    const buttonSeat = 0;
    const stack =
      config.mode === 'cash' ? config.buyIn : config.startingStack ?? 1500;
    const stacks: Record<number, number> = {};
    for (let i = 0; i < 8; i++) stacks[i] = stack;
    set({
      config,
      heroSeat,
      buttonSeat,
      stacks,
      currentLevelIndex: 0,
      levelStartedAt: config.mode === 'tournament' ? Date.now() : null,
      state: null,
      tournamentFinish: null,
    });
    get().startNewHand();
  },

  startNewHand: () => {
    const { config, heroSeat, buttonSeat, stacks } = get();
    if (!config) return;

    // Tournament: tick level + check game-over.
    if (config.mode === 'tournament') {
      get().tickTournamentLevel();
      const remaining = Object.values(stacks).filter((s) => s > 0).length;
      const heroOut = (stacks[heroSeat] ?? 0) <= 0;
      if (remaining <= 1 || heroOut) {
        // Compute finishing place: 1 if hero is the lone survivor, else (busted_count remaining + 1).
        const finish = heroOut
          ? remaining + 1 // hero finished one above current survivors
          : 1;
        set({ tournamentFinish: finish });
        return;
      }
    }

    // Determine blinds (tournament: use level; cash: fixed).
    let sb = config.smallBlind;
    let bb = config.bigBlind;
    const tournamentLevel = get().currentLevelIndex;
    if (config.mode === 'tournament' && config.levels && config.levels[tournamentLevel]) {
      sb = config.levels[tournamentLevel].sb;
      bb = config.levels[tournamentLevel].bb;
    }

    // In cash games, refill busted bots to buy-in.
    const nextStacks = { ...stacks };
    if (config.mode === 'cash') {
      for (let i = 0; i < 8; i++) {
        if (i !== heroSeat && nextStacks[i] <= 0) nextStacks[i] = config.buyIn;
      }
    }

    const seeds = Array.from({ length: 8 }, (_, i) => ({
      seat: i,
      name: i === heroSeat ? 'Hero' : BOT_NAMES[(i - 1 + 7) % 7],
      isHero: i === heroSeat,
      stack: nextStacks[i] ?? 0,
      personality: i === heroSeat ? undefined : PERSONALITY_LIST[i % PERSONALITY_LIST.length] as PersonalityName,
    }));

    // Advance button to next player with chips.
    let nextButton = buttonSeat;
    if (get().state) {
      for (let i = 1; i <= 8; i++) {
        const candidate = (buttonSeat + i) % 8;
        if ((nextStacks[candidate] ?? 0) > 0) {
          nextButton = candidate;
          break;
        }
      }
    } else if ((nextStacks[nextButton] ?? 0) <= 0) {
      // Initial button must land on someone with chips.
      for (let i = 1; i <= 8; i++) {
        const c = (nextButton + i) % 8;
        if ((nextStacks[c] ?? 0) > 0) {
          nextButton = c;
          break;
        }
      }
    }

    const state = startHand(seeds, {
      smallBlind: sb,
      bigBlind: bb,
      buttonSeat: nextButton,
    });
    set({ state, buttonSeat: nextButton });

    // If hero isn't to act, start running bots.
    get().runBots();
  },

  tickTournamentLevel: () => {
    const { config, currentLevelIndex, levelStartedAt } = get();
    if (!config || config.mode !== 'tournament' || !levelStartedAt) return;
    const durationMs = (config.levelDurationMinutes ?? 10) * 60 * 1000;
    const elapsed = Date.now() - levelStartedAt;
    if (elapsed >= durationMs && config.levels && currentLevelIndex < config.levels.length - 1) {
      const advance = Math.min(
        Math.floor(elapsed / durationMs),
        config.levels.length - 1 - currentLevelIndex
      );
      set({
        currentLevelIndex: currentLevelIndex + advance,
        levelStartedAt: Date.now(),
      });
    }
  },

  submitHeroAction: (action) => {
    const { state, heroSeat } = get();
    if (!state || state.toAct !== heroSeat || state.street === 'complete') return;
    // Capture decision (snapshot + recommendation) BEFORE applying.
    const snapshot = snapshotFor(state, heroSeat);
    const rec = recommend(state, heroSeat);
    state.decisions.push({
      street: state.street,
      seat: heroSeat,
      snapshot,
      actual: action,
      recommendation: rec,
    });
    applyAction(state, action);
    set({ state: { ...state } });
    get().runBots();
  },

  runBots: () => {
    const { state, heroSeat } = get();
    if (!state) return;

    let safety = 200;
    while (
      state.street !== 'complete' &&
      state.toAct !== heroSeat &&
      safety-- > 0
    ) {
      const action = decideAction(state);
      applyAction(state, action);
    }

    set({ state: { ...state } });

    // If hand is complete, persist final stacks + save hand to history.
    if (state.street === 'complete') {
      const stacks: Record<number, number> = {};
      for (const p of state.players) stacks[p.seat] = p.stack;
      set({ stacks });

      const api = (window as { pokerCoach?: { appendHistory: (e: unknown) => Promise<void> } })
        .pokerCoach;
      if (api) {
        api
          .appendHistory({
            timestamp: Date.now(),
            mode: get().config?.mode,
            board: state.board,
            winners: state.winners,
            actionLog: state.actionLog,
            decisions: state.decisions,
          })
          .catch(() => {});
      }
    }
  },

  endSession: () => {
    set({ config: null, state: null, tournamentFinish: null });
  },
}));

export function heroLegalActions(state: GameState | null, heroSeat: number) {
  if (!state || state.toAct !== heroSeat || state.street === 'complete') {
    return null;
  }
  return legalActions(state);
}
