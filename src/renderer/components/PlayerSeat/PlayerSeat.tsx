import { Player } from '@shared/types';
import { Card } from '../Card/Card';

type Props = {
  player: Player;
  isButton: boolean;
  isToAct: boolean;
  isWinner: boolean;
  showCards: boolean;
};

export function PlayerSeat({ player, isButton, isToAct, isWinner, showCards }: Props) {
  const stateLabel =
    player.state === 'folded'
      ? 'Folded'
      : player.state === 'allin'
      ? 'All-in'
      : '';

  const ringClass = isWinner
    ? 'ring-2 ring-chip-gold'
    : isToAct
    ? 'ring-2 ring-chip-green animate-pulse'
    : 'ring-1 ring-white/20';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-1 mb-1 h-16">
        {player.state === 'sitting-out' || player.state === 'folded' ? null : player.holeCards.length === 0 ? null : (
          <>
            <Card
              card={showCards ? player.holeCards[0] : undefined}
              faceDown={!showCards}
            />
            <Card
              card={showCards ? player.holeCards[1] : undefined}
              faceDown={!showCards}
            />
          </>
        )}
      </div>
      <div
        className={`rounded-lg bg-black/60 px-3 py-1.5 min-w-[120px] text-center ${ringClass}`}
      >
        <div className="flex items-center justify-center gap-1 text-sm font-semibold">
          {player.name}
          {player.position && (
            <span className="text-[10px] text-white/60">({player.position})</span>
          )}
          {isButton && (
            <span className="bg-white text-black rounded-full text-[10px] px-1.5 leading-none ml-1">
              D
            </span>
          )}
        </div>
        <div className="text-xs text-white/70">{player.stack}</div>
        {stateLabel && (
          <div className="text-[10px] text-chip-red font-semibold">{stateLabel}</div>
        )}
      </div>
      {player.bet > 0 && (
        <div className="text-xs bg-chip-gold/90 text-black rounded px-2 py-0.5 font-semibold">
          {player.bet}
        </div>
      )}
    </div>
  );
}
