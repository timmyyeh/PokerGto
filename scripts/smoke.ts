/**
 * Smoke simulation: play full hands where the hero follows the coach's
 * primary recommendation and bots play their personalities. Verifies the
 * GTO engine never throws, recommendations stay legal, and latency is sane.
 *
 * Run: npx tsx scripts/smoke.ts
 */
import { startHand, applyAction, legalActions } from '../src/engine/gameState';
import { decideAction } from '../src/ai/bot';
import { recommend, snapshotFor, gradeDecision } from '../src/gto/recommend';
import { PERSONALITY_LIST } from '../src/ai/personalities';

const HANDS = 1000;

/** Cycle through deep, mid, shallow, and push/fold stack depths. */
const STACK_DEPTHS = [200, 100, 40, 18, 12]; // 100bb, 50bb, 20bb, 9bb, 6bb at 1/2
let recCalls = 0;
let recMs = 0;
const grades: Record<string, number> = {};
const streets: Record<string, number> = {};

for (let h = 0; h < HANDS; h++) {
  const stack = STACK_DEPTHS[h % STACK_DEPTHS.length];
  const seeds = Array.from({ length: 8 }, (_, i) => ({
    seat: i,
    name: i === 0 ? 'Hero' : `Bot${i}`,
    isHero: i === 0,
    stack,
    personality: i === 0 ? undefined : PERSONALITY_LIST[i % PERSONALITY_LIST.length],
  }));
  const state = startHand(seeds, {
    smallBlind: 1,
    bigBlind: 2,
    ante: h % 4 === 3 ? 1 : 0,
    buttonSeat: h % 8,
  });

  let safety = 300;
  while (state.street !== 'complete' && safety-- > 0) {
    if (state.toAct === 0) {
      const snap = snapshotFor(state, 0);
      const t0 = performance.now();
      const rec = recommend(state, 0);
      recMs += performance.now() - t0;
      recCalls++;

      const la = legalActions(state);
      const primary = rec.strategy[0];
      // Validate the primary action is legal.
      let action;
      switch (primary.action) {
        case 'fold':
          action = { type: 'fold' as const };
          break;
        case 'check':
          if (!la.canCheck) throw new Error(`illegal check recommended: hand ${h}`);
          action = { type: 'check' as const };
          break;
        case 'call':
          if (!la.canCall) throw new Error(`illegal call recommended: hand ${h}`);
          action = { type: 'call' as const };
          break;
        case 'allin':
          action = { type: 'allin' as const };
          break;
        default: {
          const amt = primary.amount ?? la.minRaiseTotal;
          if (amt < la.minRaiseTotal || amt > la.maxRaiseTotal) {
            throw new Error(
              `illegal size ${amt} (min ${la.minRaiseTotal} max ${la.maxRaiseTotal}) hand ${h}`
            );
          }
          action = { type: 'raise' as const, amount: amt };
        }
      }
      streets[state.street] = (streets[state.street] ?? 0) + 1;
      const { grade } = gradeDecision(rec, action, snap);
      grades[grade] = (grades[grade] ?? 0) + 1;
      if (grade !== 'best') {
        throw new Error(`following the coach graded '${grade}' on hand ${h} (${primary.label})`);
      }
      applyAction(state, action);
    } else {
      applyAction(state, decideAction(state));
    }
  }
  if (state.street !== 'complete') throw new Error(`hand ${h} did not finish`);
  const chips = state.players.reduce((s, p) => s + p.stack, 0);
  const expected = seeds.reduce((s, p) => s + p.stack, 0);
  if (chips !== expected) throw new Error(`chip leak on hand ${h}: ${chips} vs ${expected}`);
}

console.log(`OK: ${HANDS} hands, ${recCalls} recommendations`);
console.log(`avg recommend() latency: ${(recMs / recCalls).toFixed(1)}ms`);
console.log('grades when following the coach:', grades);
console.log('decisions by street:', streets);

// ---------------------------------------------------------------------------
// Postflop stress: hero calls everything preflop (off-chart on purpose),
// then follows the coach postflop. Verifies legality + stability only.
// ---------------------------------------------------------------------------
const postflopStreets: Record<string, number> = {};
for (let h = 0; h < 300; h++) {
  const seeds = Array.from({ length: 8 }, (_, i) => ({
    seat: i,
    name: i === 0 ? 'Hero' : `Bot${i}`,
    isHero: i === 0,
    stack: 200,
    personality: i === 0 ? undefined : PERSONALITY_LIST[i % PERSONALITY_LIST.length],
  }));
  const state = startHand(seeds, { smallBlind: 1, bigBlind: 2, buttonSeat: h % 8 });

  let safety = 300;
  while (state.street !== 'complete' && safety-- > 0) {
    if (state.toAct === 0) {
      const la = legalActions(state);
      if (state.street === 'preflop') {
        applyAction(state, la.canCheck ? { type: 'check' } : { type: 'call' });
        continue;
      }
      const rec = recommend(state, 0);
      postflopStreets[state.street] = (postflopStreets[state.street] ?? 0) + 1;
      const primary = rec.strategy[0];
      if (primary.action === 'check' && !la.canCheck) throw new Error('illegal check');
      if (primary.action === 'call' && !la.canCall) throw new Error('illegal call');
      if (
        (primary.action === 'bet' || primary.action === 'raise') &&
        ((primary.amount ?? 0) < la.minRaiseTotal || (primary.amount ?? 0) > la.maxRaiseTotal)
      ) {
        throw new Error(`illegal size ${primary.amount} [${la.minRaiseTotal},${la.maxRaiseTotal}]`);
      }
      applyAction(
        state,
        primary.action === 'allin'
          ? { type: 'allin' }
          : primary.action === 'bet' || primary.action === 'raise'
          ? { type: primary.action, amount: primary.amount }
          : { type: primary.action }
      );
    } else {
      applyAction(state, decideAction(state));
    }
  }
  if (state.street !== 'complete') throw new Error(`stress hand ${h} did not finish`);
}
console.log('postflop stress decisions by street:', postflopStreets);
