import { Card as CardType } from '@shared/types';

const SUIT_GLYPH: Record<string, string> = {
  s: '♠',
  h: '♥',
  d: '♦',
  c: '♣',
};

const SUIT_COLOR: Record<string, string> = {
  s: 'text-white',
  h: 'text-red-400',
  d: 'text-blue-300',
  c: 'text-green-300',
};

type Props = {
  card?: CardType;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

export function Card({ card, faceDown = false, size = 'md' }: Props) {
  const dims =
    size === 'sm'
      ? 'w-8 h-12 text-base'
      : size === 'lg'
      ? 'w-16 h-24 text-3xl'
      : 'w-12 h-16 text-xl';

  if (faceDown || !card) {
    return (
      <div
        className={`${dims} rounded-md bg-gradient-to-br from-blue-900 to-blue-700 border border-blue-300/40 shadow-md`}
      />
    );
  }

  return (
    <div
      className={`${dims} rounded-md bg-neutral-900 border border-white/30 shadow-md flex flex-col items-center justify-center font-semibold ${SUIT_COLOR[card.suit]}`}
    >
      <span>{card.rank}</span>
      <span className="text-lg leading-none">{SUIT_GLYPH[card.suit]}</span>
    </div>
  );
}
