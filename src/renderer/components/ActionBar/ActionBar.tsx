import { useState, useMemo } from 'react';
import { useGameStore, heroLegalActions } from '@renderer/state/gameStore';

export function ActionBar() {
  const state = useGameStore((s) => s.state);
  const heroSeat = useGameStore((s) => s.heroSeat);
  const submit = useGameStore((s) => s.submitHeroAction);
  const la = heroLegalActions(state, heroSeat);

  const [raiseAmount, setRaiseAmount] = useState<number>(0);

  const defaultRaise = useMemo(() => {
    if (!la) return 0;
    return la.minRaiseTotal;
  }, [la]);

  if (!state || !la) return null;

  const currentRaise = raiseAmount || defaultRaise;
  const clamped = Math.max(la.minRaiseTotal, Math.min(la.maxRaiseTotal, currentRaise));

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-end gap-3 bg-black/70 px-4 py-3 rounded-xl border border-white/10 backdrop-blur">
      <button
        onClick={() => submit({ type: 'fold' })}
        disabled={!la.canFold}
        className="px-5 py-3 rounded-lg bg-chip-red hover:bg-chip-red/80 disabled:opacity-40 font-semibold"
      >
        Fold
      </button>
      {la.canCheck ? (
        <button
          onClick={() => submit({ type: 'check' })}
          className="px-5 py-3 rounded-lg bg-chip-blue hover:bg-chip-blue/80 font-semibold"
        >
          Check
        </button>
      ) : (
        <button
          onClick={() => submit({ type: 'call' })}
          disabled={!la.canCall}
          className="px-5 py-3 rounded-lg bg-chip-blue hover:bg-chip-blue/80 disabled:opacity-40 font-semibold"
        >
          Call {la.callAmount}
        </button>
      )}
      {la.canBetOrRaise && la.maxRaiseTotal > la.minRaiseTotal && (
        <div className="flex flex-col gap-1">
          <input
            type="range"
            min={la.minRaiseTotal}
            max={la.maxRaiseTotal}
            step={1}
            value={clamped}
            onChange={(e) => setRaiseAmount(Number(e.target.value))}
            className="w-44"
          />
          <div className="flex gap-1 text-xs">
            <button
              onClick={() => setRaiseAmount(la.minRaiseTotal)}
              className="px-1.5 py-0.5 bg-white/10 rounded"
            >
              Min
            </button>
            <button
              onClick={() => setRaiseAmount(Math.round(state.pot * 0.5))}
              className="px-1.5 py-0.5 bg-white/10 rounded"
            >
              ½ pot
            </button>
            <button
              onClick={() => setRaiseAmount(state.pot)}
              className="px-1.5 py-0.5 bg-white/10 rounded"
            >
              Pot
            </button>
            <button
              onClick={() => setRaiseAmount(la.maxRaiseTotal)}
              className="px-1.5 py-0.5 bg-white/10 rounded"
            >
              All-in
            </button>
          </div>
        </div>
      )}
      {la.canBetOrRaise && (
        <button
          onClick={() => submit({ type: 'raise', amount: clamped })}
          className="px-5 py-3 rounded-lg bg-chip-green hover:bg-chip-green/80 font-semibold"
        >
          {state.currentBet === 0 ? 'Bet' : 'Raise to'} {clamped}
        </button>
      )}
    </div>
  );
}
