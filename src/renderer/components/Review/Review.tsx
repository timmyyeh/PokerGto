import { useState } from 'react';
import { useGameStore } from '@renderer/state/gameStore';
import { useUIStore } from '@renderer/state/uiStore';
import { Decision } from '@shared/types';
import { Card } from '../Card/Card';

export function Review() {
  const state = useGameStore((s) => s.state);
  const startNewHand = useGameStore((s) => s.startNewHand);
  const endSession = useGameStore((s) => s.endSession);
  const goto = useUIStore((s) => s.goto);

  const decisions = state?.decisions ?? [];
  const [selected, setSelected] = useState(0);

  if (!state || decisions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <h2 className="text-2xl">No decisions to review</h2>
        <p className="text-white/60 text-sm">You didn't face a decision this hand.</p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              startNewHand();
              goto('game');
            }}
            className="px-4 py-2 bg-chip-green rounded font-semibold"
          >
            Next Hand
          </button>
          <button
            onClick={() => {
              endSession();
              goto('lobby');
            }}
            className="px-4 py-2 bg-white/10 rounded"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  const d = decisions[selected];

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Hand Review</h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              startNewHand();
              goto('game');
            }}
            className="px-3 py-1.5 bg-chip-green hover:bg-chip-green/80 rounded text-sm font-semibold"
          >
            Next Hand
          </button>
          <button
            onClick={() => {
              endSession();
              goto('lobby');
            }}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded text-sm"
          >
            Back to Lobby
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {decisions.map((dec, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${
              selected === i
                ? 'bg-chip-gold text-black'
                : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            #{i + 1} · {dec.street}
            <span className="ml-2 opacity-70 text-xs">{actionLabel(dec)}</span>
          </button>
        ))}
      </div>

      <DecisionPanel decision={d} />
    </div>
  );
}

function DecisionPanel({ decision }: { decision: Decision }) {
  const { snapshot, actual, recommendation } = decision;
  const equityPct = (recommendation.equity * 100).toFixed(1);
  const potOddsPct = (recommendation.potOdds * 100).toFixed(1);
  const matches = sameAction(actual, recommendation);

  return (
    <div className="grid grid-cols-2 gap-6 flex-1 overflow-hidden">
      {/* Left: snapshot */}
      <div className="bg-black/40 rounded-xl p-4 border border-white/10 overflow-y-auto">
        <h3 className="font-semibold mb-3 text-white/80">Spot</h3>

        <div className="text-sm space-y-2">
          <div>
            <span className="text-white/50">Street:</span>{' '}
            <span className="capitalize font-semibold">{snapshot.street}</span>
          </div>
          <div>
            <span className="text-white/50">Position:</span>{' '}
            <span className="font-semibold">{snapshot.position ?? '—'}</span>
          </div>
          <div>
            <span className="text-white/50">Pot:</span>{' '}
            <span className="font-semibold text-chip-gold">{snapshot.pot}</span>
          </div>
          <div>
            <span className="text-white/50">To call:</span>{' '}
            <span className="font-semibold">{snapshot.toCall}</span>
          </div>
          <div>
            <span className="text-white/50">Hero stack:</span>{' '}
            <span className="font-semibold">{snapshot.heroStack}</span>
          </div>
          <div>
            <span className="text-white/50">Opponents still in:</span>{' '}
            <span className="font-semibold">{snapshot.numActiveOpponents}</span>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-white/50 text-xs mb-1">Your hand</div>
          <div className="flex gap-1">
            {snapshot.heroCards.map((c, i) => (
              <Card key={i} card={c} size="md" />
            ))}
          </div>
        </div>

        {snapshot.board.length > 0 && (
          <div className="mt-4">
            <div className="text-white/50 text-xs mb-1">Board</div>
            <div className="flex gap-1">
              {snapshot.board.map((c, i) => (
                <Card key={i} card={c} size="md" />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: recommendation vs. action */}
      <div className="bg-black/40 rounded-xl p-4 border border-white/10 overflow-y-auto">
        <h3 className="font-semibold mb-3 text-white/80">Recommendation</h3>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <Stat label="Equity" value={`${equityPct}%`} accent="text-chip-green" />
          <Stat label="Pot odds (need)" value={`${potOddsPct}%`} accent="text-chip-blue" />
        </div>

        <div className="border border-white/10 rounded-lg p-3 mb-3">
          <div className="text-xs text-white/50 mb-1">GTO recommendation</div>
          <div className="text-xl font-bold text-chip-gold">
            {actionDescription(recommendation.action, recommendation.raiseSize)}
          </div>
        </div>

        <div className="border border-white/10 rounded-lg p-3 mb-3">
          <div className="text-xs text-white/50 mb-1">Your action</div>
          <div
            className={`text-xl font-bold ${
              matches ? 'text-chip-green' : 'text-chip-red'
            }`}
          >
            {actionDescription(actual.type, actual.amount)}{' '}
            {matches ? '✓' : '✗'}
          </div>
        </div>

        <div className="bg-black/50 rounded-lg p-3 border border-white/10">
          <div className="text-xs text-white/50 mb-1">Why</div>
          <div className="text-sm leading-relaxed">{recommendation.reason}</div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="bg-black/40 rounded-lg p-3 border border-white/10">
      <div className="text-xs text-white/50">{label}</div>
      <div className={`text-xl font-bold ${accent ?? 'text-white'}`}>{value}</div>
    </div>
  );
}

function actionDescription(type: string, amount?: number): string {
  switch (type) {
    case 'fold':
      return 'Fold';
    case 'check':
      return 'Check';
    case 'call':
      return 'Call';
    case 'bet':
      return amount != null ? `Bet ${amount}` : 'Bet';
    case 'raise':
      return amount != null ? `Raise to ${amount}` : 'Raise';
    case 'allin':
      return 'All-in';
    default:
      return type;
  }
}

function actionLabel(d: Decision): string {
  return actionDescription(d.actual.type, d.actual.amount);
}

function sameAction(
  actual: { type: string; amount?: number },
  rec: { action: string; raiseSize?: number }
): boolean {
  // Treat 'bet' and 'raise' as the same family for matching purposes.
  const normalize = (t: string) => (t === 'bet' || t === 'allin' ? 'raise' : t);
  return normalize(actual.type) === normalize(rec.action);
}
