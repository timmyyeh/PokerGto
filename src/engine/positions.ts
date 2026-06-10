import { Position } from '@shared/types';

/** Non-blind, non-button positions from earliest to latest. */
const EARLY_TO_LATE: Position[] = ['UTG', 'UTG1', 'MP', 'HJ', 'CO'];

/**
 * Assign poker positions for an 8-max table given the active player seats
 * (clockwise) and the button seat. Returns a map seat -> position.
 */
export function assignPositions(seats: number[], buttonSeat: number): Map<number, Position> {
  const n = seats.length;
  if (n < 2) throw new Error('need >=2 players to assign positions');

  const sorted = [...seats].sort((a, b) => a - b);
  const btnIndex = sorted.indexOf(buttonSeat);
  if (btnIndex < 0) throw new Error(`button seat ${buttonSeat} not in seats`);

  const ordered: number[] = [];
  for (let i = 0; i < n; i++) ordered.push(sorted[(btnIndex + i) % n]);

  // Short-handed tables keep the *late* positions (a 6-max table has MP/HJ/CO,
  // not UTG/UTG1/MP) so each label keeps the same number of players behind it
  // and preflop charts stay accurate as players bust.
  const names: Position[] =
    n === 2
      ? ['BTN', 'BB']
      : ['BTN', 'SB', 'BB', ...EARLY_TO_LATE.slice(EARLY_TO_LATE.length - (n - 3))];

  const result = new Map<number, Position>();
  ordered.forEach((seat, i) => result.set(seat, names[i]));
  return result;
}

/** Indices into sorted-seat array clockwise from button, for action ordering. */
export function orderFromButton(seats: number[], buttonSeat: number): number[] {
  const sorted = [...seats].sort((a, b) => a - b);
  const btn = sorted.indexOf(buttonSeat);
  if (btn < 0) throw new Error(`button seat ${buttonSeat} not in seats`);
  return Array.from({ length: sorted.length }, (_, i) => sorted[(btn + i) % sorted.length]);
}
