import { useState } from 'react';
import { useGameStore } from '@renderer/state/gameStore';
import { useUIStore } from '@renderer/state/uiStore';
import { Decision, DecisionGrade, StrategyOption } from '@shared/types';
import { accuracyScore } from '@gto/recommend';
import { Card } from '../Card/Card';

const GRADE_LABEL: Record<DecisionGrade, string> = {
  best: 'Best play',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

const GRADE_COLOR: Record<DecisionGrade, string> = {
  best: 'bg-chip-green',
  good: 'bg-emerald-600',
  inaccuracy: 'bg-yellow-500',
  mistake: 'bg-orange-500',
  blunder: 'bg-chip-red',
};

const GRADE_TEXT: Record<DecisionGrade, string> = {
  best: 'text-chip-green',
  good: 'text-emerald-400',
  inaccuracy: 'text-yellow-400',
  mistake: 'text-orange-400',
  blunder: 'text-red-400',
};

function actionColor(action: string): string {
  if (action === 'bet' || action === 'raise' || action === 'allin') return 'bg-chip-red';
  if (action === 'call') return 'bg-chip-green';
  if (action === 'check') return 'bg-teal-600';
  return 'bg-slate-500';
}

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

  const d = decisions[Math.min(selected, decisions.length - 1)];
  const score = accuracyScore(decisions.map((dec) => dec.grade));
  const totalLoss = decisions.reduce((s, dec) => s + dec.evLossBB, 0);

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-semibold">Hand Review</h2>
          <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5">
            <span className="text-xs text-white/50">Accuracy</span>
            <span
              className={`text-lg font-bold ${
                score >= 85 ? 'text-chip-green' : score >= 60 ? 'text-yellow-400' : 'text-red-400'
              }`}
            >
              {score}%
            </span>
            {totalLoss > 0.05 && (
              <span className="text-xs text-white/50">· est. EV lost {totalLoss.toFixed(1)}bb</span>
            )}
          </div>
        </div>
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
            className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
              selected === i ? 'bg-chip-gold text-black' : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${GRADE_COLOR[dec.grade]}`} />
            #{i + 1} · {dec.street}
            <span className="opacity-70 text-xs">{actionLabel(dec)}</span>
          </button>
        ))}
      </div>

      <DecisionPanel decision={d} />
    </div>
  );
}

function DecisionPanel({ decision }: { decision: Decision }) {
  const { snapshot, actual, recommendation: rec, grade, evLossBB } = decision;
  const bb = snapshot.bigBlind || 1;
  const matches = grade === 'best' || grade === 'good';

  return (
    <div className="grid grid-cols-5 gap-4 flex-1 overflow-hidden">
      {/* Left: spot */}
      <div className="col-span-2 bg-black/40 rounded-xl p-4 border border-white/10 overflow-y-auto">
        <h3 className="font-semibold mb-3 text-white/80">The Spot</h3>

        <div className="text-sm space-y-2">
          <Row label="Street" value={snapshot.street} cap />
          <Row label="Position" value={snapshot.position ?? '—'} />
          <Row
            label="Pot"
            value={`${snapshot.pot} (${asBB(snapshot.pot, bb)})`}
            accent="text-chip-gold"
          />
          {snapshot.toCall > 0 && (
            <Row label="To call" value={`${snapshot.toCall} (${asBB(snapshot.toCall, bb)})`} />
          )}
          <Row label="Your stack" value={`${snapshot.heroStack} (${asBB(snapshot.heroStack, bb)})`} />
          <Row label="Opponents in hand" value={String(snapshot.numActiveOpponents)} />
          {rec.handCategory && <Row label="Hand class" value={rec.handCategory} />}
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

        {rec.villainRange && (
          <div className="mt-4 bg-black/40 border border-white/10 rounded-lg p-3">
            <div className="text-xs text-white/50 mb-1">Opponent range model</div>
            <div className="text-sm text-white/80">{rec.villainRange}</div>
          </div>
        )}
      </div>

      {/* Right: strategy + verdict */}
      <div className="col-span-3 bg-black/40 rounded-xl p-4 border border-white/10 overflow-y-auto">
        {/* Verdict banner */}
        <div
          className={`rounded-lg px-4 py-3 mb-4 border flex items-center justify-between ${
            matches ? 'border-chip-green/40 bg-chip-green/10' : 'border-white/10 bg-black/40'
          }`}
        >
          <div>
            <span className={`text-lg font-bold ${GRADE_TEXT[grade]}`}>
              {GRADE_LABEL[grade]} {matches ? '✓' : ''}
            </span>
            <span className="ml-3 text-sm text-white/70">
              You: <b>{actionDescription(actual.type, actual.amount)}</b> · GTO:{' '}
              <b>{rec.strategy[0]?.label}</b>
            </span>
          </div>
          {evLossBB > 0.05 && (
            <span className="text-sm text-white/50">est. −{evLossBB.toFixed(1)}bb</span>
          )}
        </div>

        {/* Strategy mix */}
        <div className="mb-4">
          <div className="text-xs text-white/50 mb-2">GTO strategy mix</div>
          <div className="flex h-4 rounded-full overflow-hidden border border-white/10 mb-2">
            {rec.strategy.map((o, i) => (
              <div
                key={i}
                className={actionColor(o.action)}
                style={{ width: `${Math.max(2, o.frequency * 100)}%` }}
                title={`${o.label} — ${Math.round(o.frequency * 100)}%`}
              />
            ))}
          </div>
          <div className="space-y-1">
            {rec.strategy.map((o, i) => (
              <StrategyRow key={i} option={o} />
            ))}
          </div>
        </div>

        {/* Numbers */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <Stat label="Equity vs range" value={pct(rec.equity)} accent="text-chip-green" />
          <Stat
            label="Equity needed"
            value={rec.potOdds > 0 ? pct(rec.potOdds) : '—'}
            accent="text-chip-blue"
          />
          <Stat label="Min defense (MDF)" value={rec.mdf !== undefined ? pct(rec.mdf) : '—'} />
          <Stat
            label="EV of calling"
            value={
              rec.evCallBB !== undefined
                ? `${rec.evCallBB >= 0 ? '+' : ''}${rec.evCallBB.toFixed(1)}bb`
                : '—'
            }
            accent={
              rec.evCallBB !== undefined && rec.evCallBB >= 0 ? 'text-chip-green' : 'text-red-400'
            }
          />
        </div>

        {/* Why */}
        <div className="bg-black/50 rounded-lg p-3 border border-white/10">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs text-white/50">Why</span>
            {rec.concepts.map((c) => (
              <span
                key={c}
                className="text-[10px] uppercase tracking-wide bg-chip-blue/20 text-chip-blue border border-chip-blue/40 rounded-full px-2 py-0.5"
              >
                {c}
              </span>
            ))}
          </div>
          <div className="text-sm leading-relaxed">{rec.reason}</div>
        </div>
      </div>
    </div>
  );
}

function StrategyRow({ option }: { option: StrategyOption }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`inline-block w-3 h-3 rounded-sm ${actionColor(option.action)}`} />
      <span className="flex-1">{option.label}</span>
      <span className="font-semibold tabular-nums">{Math.round(option.frequency * 100)}%</span>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
  cap,
}: {
  label: string;
  value: string;
  accent?: string;
  cap?: boolean;
}) {
  return (
    <div>
      <span className="text-white/50">{label}:</span>{' '}
      <span className={`font-semibold ${cap ? 'capitalize' : ''} ${accent ?? ''}`}>{value}</span>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-black/40 rounded-lg p-2.5 border border-white/10">
      <div className="text-[11px] text-white/50">{label}</div>
      <div className={`text-lg font-bold ${accent ?? 'text-white'}`}>{value}</div>
    </div>
  );
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function asBB(chips: number, bb: number): string {
  const v = chips / bb;
  return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}bb`;
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
