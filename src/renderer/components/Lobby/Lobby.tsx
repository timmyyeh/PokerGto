import { useEffect, useState } from 'react';
import { useUIStore } from '@renderer/state/uiStore';
import { useGameStore, GameMode } from '@renderer/state/gameStore';

type StoredSettings = {
  mode: GameMode;
  cash: { smallBlind: number; bigBlind: number; buyIn: number };
  tournament: {
    startingStack: number;
    levelDurationMinutes: number;
    levels: { sb: number; bb: number; ante: number }[];
  };
};

export function Lobby() {
  const goto = useUIStore((s) => s.goto);
  const startSession = useGameStore((s) => s.startSession);

  const [mode, setMode] = useState<GameMode>('cash');
  const [smallBlind, setSmallBlind] = useState(1);
  const [bigBlind, setBigBlind] = useState(2);
  const [buyIn, setBuyIn] = useState(200);
  const [startingStack, setStartingStack] = useState(1500);
  const [levelDurationMinutes, setLevelDurationMinutes] = useState(10);
  const [levels, setLevels] = useState<{ sb: number; bb: number; ante: number }[]>([
    { sb: 10, bb: 20, ante: 0 },
    { sb: 15, bb: 30, ante: 0 },
    { sb: 25, bb: 50, ante: 0 },
    { sb: 50, bb: 100, ante: 10 },
    { sb: 75, bb: 150, ante: 15 },
    { sb: 100, bb: 200, ante: 25 },
    { sb: 150, bb: 300, ante: 30 },
    { sb: 200, bb: 400, ante: 50 },
  ]);

  // Load persisted settings on mount.
  useEffect(() => {
    const api = window.pokerCoach;
    if (!api) return;
    api
      .loadSettings()
      .then((s) => {
        const settings = s as StoredSettings | undefined;
        if (!settings) return;
        setMode(settings.mode);
        setSmallBlind(settings.cash.smallBlind);
        setBigBlind(settings.cash.bigBlind);
        setBuyIn(settings.cash.buyIn);
        setStartingStack(settings.tournament.startingStack);
        setLevelDurationMinutes(settings.tournament.levelDurationMinutes);
        setLevels(settings.tournament.levels);
      })
      .catch(() => {
        // ignore — defaults will be used
      });
  }, []);

  const start = () => {
    const settings: StoredSettings = {
      mode,
      cash: { smallBlind, bigBlind, buyIn },
      tournament: { startingStack, levelDurationMinutes, levels },
    };
    window.pokerCoach?.saveSettings(settings).catch(() => {});
    startSession({
      mode,
      smallBlind,
      bigBlind,
      buyIn,
      startingStack,
      levelDurationMinutes,
      levels,
    });
    goto('game');
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      <h1 className="text-5xl font-bold text-chip-gold">Poker Coach</h1>
      <p className="text-white/70 max-w-md text-center">
        8-max NLHE vs AI opponents with GTO-flavored post-hand review.
      </p>

      <div className="flex gap-2">
        <ModeButton selected={mode === 'cash'} onClick={() => setMode('cash')} label="Cash" />
        <ModeButton
          selected={mode === 'tournament'}
          onClick={() => setMode('tournament')}
          label="Tournament"
        />
      </div>

      <div className="bg-black/40 p-6 rounded-xl border border-white/10 grid grid-cols-2 gap-x-6 gap-y-3 w-[420px]">
        {mode === 'cash' ? (
          <>
            <NumField label="Small Blind" value={smallBlind} onChange={setSmallBlind} />
            <NumField label="Big Blind" value={bigBlind} onChange={setBigBlind} />
            <NumField label="Buy-in" value={buyIn} onChange={setBuyIn} />
          </>
        ) : (
          <>
            <NumField label="Starting Stack" value={startingStack} onChange={setStartingStack} />
            <NumField
              label="Level (min)"
              value={levelDurationMinutes}
              onChange={setLevelDurationMinutes}
            />
            <div className="col-span-2 text-xs text-white/50">
              8 escalating blind levels. Default schedule: 10/20 → 200/400.
            </div>
          </>
        )}
      </div>

      <button
        onClick={start}
        className="px-10 py-3 bg-chip-green hover:bg-chip-green/80 rounded-lg font-semibold text-lg"
      >
        Start Game
      </button>
    </div>
  );
}

function ModeButton({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-2 rounded-lg font-semibold ${
        selected ? 'bg-chip-gold text-black' : 'bg-white/10 hover:bg-white/20'
      }`}
    >
      {label}
    </button>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-white/70">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="bg-black/60 border border-white/20 rounded px-2 py-1"
      />
    </label>
  );
}
