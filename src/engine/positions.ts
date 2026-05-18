import { Position } from '@shared/types';

const POSITION_NAMES_8MAX: Position[] = ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'MP', 'HJ', 'CO'];

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

  const names = n === 2 ? (['BTN', 'BB'] as Position[]) : POSITION_NAMES_8MAX.slice(0, n);

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
