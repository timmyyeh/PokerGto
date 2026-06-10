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

  const bb = state.bigBlind;
  const currentRaise = raiseAmount || defaultRaise;
  const clamped = Math.max(la.minRaiseTotal, Math.min(la.maxRaiseTotal, currentRaise));
  const potOdds = la.canCall ? la.callAmount / (state.pot + la.callAmount) : 0;

  // Pot-fraction presets: total = own bet + call + fraction * (pot after calling).
  const heroBet = state.players.find((p) => p.seat === heroSeat)?.bet ?? 0;
  const presetTotal = (fraction: number) => {
    const raw = heroBet + la.callAmount + fraction * (state.pot + la.callAmount);
    return Math.round(Math.max(la.minRaiseTotal, Math.min(la.maxRaiseTotal, raw)));
  };
  const presets: { label: string; value: number }[] = [
    { label: '33%', value: presetTotal(0.33) },
    { label: '50%', value: presetTotal(0.5) },
    { label: '75%', value: presetTotal(0.75) },
    { label: 'Pot', value: presetTotal(1) },
    { label: 'All-in', value: la.maxRaiseTotal },
  ];

  const asBB = (chips: number) => {
    const v = chips / bb;
    return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}bb`;
  };

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
          className="px-5 py-3 rounded-lg bg-chip-blue hover:bg-chip-blue/80 disabled:opacity-40 font-semibold flex flex-col items-center leading-tight"
        >
          <span>
            Call {la.callAmount} <span className="opacity-70 text-xs">({asBB(la.callAmount)})</span>
          </span>
          <span className="text-[10px] opacity-70 font-normal">
            need {(potOdds * 100).toFixed(0)}% equity
          </span>
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
            className="w-48"
          />
          <div className="flex gap-1 text-xs">
            <button
              onClick={() => setRaiseAmount(la.minRaiseTotal)}
              className="px-1.5 py-0.5 bg-white/10 hover:bg-white/20 rounded"
            >
              Min
            </button>
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => setRaiseAmount(p.value)}
                className="px-1.5 py-0.5 bg-white/10 hover:bg-white/20 rounded"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {la.canBetOrRaise && (
        <button
          onClick={() =>
            clamped >= la.maxRaiseTotal
              ? submit({ type: 'allin' })
              : submit({ type: 'raise', amount: clamped })
          }
          className="px-5 py-3 rounded-lg bg-chip-green hover:bg-chip-green/80 font-semibold flex flex-col items-center leading-tight"
        >
          <span>
            {clamped >= la.maxRaiseTotal
              ? 'All-in'
              : state.currentBet === 0
              ? 'Bet'
              : 'Raise to'}{' '}
            {clamped}
          </span>
          <span className="text-[10px] opacity-70 font-normal">{asBB(clamped)}</span>
        </button>
      )}
    </div>
  );
}
