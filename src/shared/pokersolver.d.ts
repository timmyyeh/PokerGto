declare module 'pokersolver' {
  export type SolvedHand = {
    rank: number;
    name: string;
    descr: string;
    cards: unknown[];
    cardPool?: unknown[];
  };
  export const Hand: {
    solve(cards: string[]): SolvedHand;
    winners(hands: SolvedHand[]): SolvedHand[];
  };
}
