import { useEffect } from 'react';
import { useGameStore } from '@renderer/state/gameStore';
import { useUIStore } from '@renderer/state/uiStore';
import { PlayerSeat } from '../PlayerSeat/PlayerSeat';
import { Card } from '../Card/Card';
import { ActionBar } from '../ActionBar/ActionBar';

// 8 seat positions around an oval. Hero is at index 0 (bottom).
// Each entry: { left%, top% }
const SEAT_POSITIONS = [
  { left: 50, top: 84 }, // 0 - bottom (hero)
  { left: 18, top: 76 }, // 1
  { left: 4, top: 48 },  // 2
  { left: 18, top: 18 }, // 3
  { left: 50, top: 8 },  // 4 - top
  { left: 82, top: 18 }, // 5
  { left: 96, top: 48 }, // 6
  { left: 82, top: 76 }, // 7
];

export function Table() {
  const state = useGameStore((s) => s.state);
  const heroSeat = useGameStore((s) => s.heroSeat);
  const startNewHand = useGameStore((s) => s.startNewHand);
  const endSession = useGameStore((s) => s.endSession);
  const goto = useUIStore((s) => s.goto);

  // When hand completes, push to review screen.
  useEffect(() => {
    if (state?.street === 'complete') {
      const t = setTimeout(() => goto('review'), 1200);
      return () => clearTimeout(t);
    }
  }, [state?.street, goto]);

  if (!state) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white/70">No active hand. </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* Felt */}
      <div className="absolute inset-12 rounded-[50%] bg-gradient-to-br from-felt-800 to-felt-900 border-8 border-amber-900/40 shadow-2xl" />

      {/* Pot + board */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3">
        <div className="flex gap-2">
          {state.board.length > 0
            ? state.board.map((c, i) => <Card key={i} card={c} size="lg" />)
            : null}
        </div>
        <div className="bg-black/60 px-4 py-1 rounded-full text-sm">
          Pot: <span className="font-semibold text-chip-gold">{state.pot}</span>
          <span className="text-white/50 ml-2 text-xs uppercase">{state.street}</span>
        </div>
      </div>

      {/* Seats */}
      {state.players.map((p, idx) => {
        // Map seat index to position around the table so hero is always at bottom.
        const offset = (idx - heroSeat + 8) % 8;
        const pos = SEAT_POSITIONS[offset];
        const showCards = p.isHero || (state.street === 'complete' && state.winners.includes(p.seat));
        return (
          <div
            key={p.seat}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
          >
            <PlayerSeat
              player={p}
              isButton={p.seat === state.buttonSeat}
              isToAct={p.seat === state.toAct && state.street !== 'complete'}
              isWinner={state.winners.includes(p.seat)}
              showCards={showCards}
            />
          </div>
        );
      })}

      {/* Action bar */}
      <ActionBar />

      {/* Top-right buttons */}
      <div className="absolute top-4 right-4 flex gap-2">
        {state.street === 'complete' && (
          <button
            onClick={startNewHand}
            className="px-3 py-1.5 bg-chip-green/80 hover:bg-chip-green rounded text-sm font-semibold"
          >
            Next Hand
          </button>
        )}
        <button
          onClick={() => {
            endSession();
            goto('lobby');
          }}
          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded text-sm"
        >
          Leave
        </button>
      </div>

      <BlindBadge />
    </div>
  );
}

function BlindBadge() {
  const state = useGameStore((s) => s.state);
  const config = useGameStore((s) => s.config);
  const levelIndex = useGameStore((s) => s.currentLevelIndex);
  if (!state || !config) return null;
  return (
    <div className="absolute top-4 left-4 bg-black/60 px-3 py-1.5 rounded-lg text-sm border border-white/10">
      <div>
        Blinds:{' '}
        <span className="font-semibold text-chip-gold">
          {state.smallBlind}/{state.bigBlind}
        </span>
      </div>
      {config.mode === 'tournament' && (
        <div className="text-xs text-white/60">
          Level {levelIndex + 1}/{config.levels?.length ?? '?'}
        </div>
      )}
    </div>
  );
}
