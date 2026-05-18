import { describe, it, expect } from 'vitest';
import { startHand, applyAction } from '@engine/gameState';
import { decideAction } from '@ai/bot';
import { PERSONALITY_LIST } from '@ai/personalities';

describe('full 8-player hand with bots', () => {
  it('runs to completion (no exceptions, declares a winner)', () => {
    for (let trial = 0; trial < 50; trial++) {
      const seeds = Array.from({ length: 8 }, (_, i) => ({
        seat: i,
        name: `P${i}`,
        isHero: false,
        stack: 200,
        personality: PERSONALITY_LIST[i % PERSONALITY_LIST.length],
      }));
      const s = startHand(seeds, {
        smallBlind: 1,
        bigBlind: 2,
        buttonSeat: trial % 8,
      });

      let safety = 500;
      while (s.street !== 'complete' && safety-- > 0) {
        const action = decideAction(s);
        applyAction(s, action);
      }

      expect(s.street).toBe('complete');
      expect(s.winners.length).toBeGreaterThanOrEqual(1);

      // Chip conservation
      const totalChips = s.players.reduce((sum, p) => sum + p.stack, 0);
      expect(totalChips).toBe(8 * 200);
    }
  });
});
