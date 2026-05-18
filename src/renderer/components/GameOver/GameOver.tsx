import { useGameStore } from '@renderer/state/gameStore';
import { useUIStore } from '@renderer/state/uiStore';

export function GameOver() {
  const finish = useGameStore((s) => s.tournamentFinish);
  const endSession = useGameStore((s) => s.endSession);
  const goto = useUIStore((s) => s.goto);

  const won = finish === 1;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <h1 className={`text-6xl font-bold ${won ? 'text-chip-gold' : 'text-chip-red'}`}>
        {won ? 'Champion!' : 'Eliminated'}
      </h1>
      <p className="text-xl text-white/80">
        {won
          ? 'You won the tournament.'
          : `You finished ${finish}${ordinal(finish ?? 0)} of 8.`}
      </p>
      <button
        onClick={() => {
          endSession();
          goto('lobby');
        }}
        className="px-8 py-3 bg-chip-green hover:bg-chip-green/80 rounded-lg font-semibold"
      >
        Back to Lobby
      </button>
    </div>
  );
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}
