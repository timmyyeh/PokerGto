# CLAUDE.md — Project guide for AI coding agents

> Read this first before making changes. It captures the project's architecture, conventions, and the non-obvious gotchas that will trip you up.

---

## What this project is

A cross-platform Electron desktop app that lets a user play No-Limit Texas Hold'em 8-max against AI bots, and then **teaches them GTO-style decision making** through an interactive end-of-hand review. The user clicks each of their past decisions and sees the recommended action, their equity, pot odds, and a written explanation.

See `README.md` for the user-facing description. This file is for **engineers and AI agents working on the code**.

---

## Stack snapshot

- **Electron** (main/preload/renderer split) via `electron-vite`
- **React 18** + **Vite** for the renderer
- **Zustand** for renderer state (no Redux)
- **Tailwind** for styling
- **TypeScript strict mode** everywhere — no `any`, `noUnusedLocals`, `noUnusedParameters`
- **`pokersolver`** for 5-card hand evaluation (typed via `src/shared/pokersolver.d.ts`)
- **`electron-store`** for settings + hand-history persistence
- **Vitest** for tests (pure-logic, no JSDOM needed)

Node 20+ / npm 10+.

---

## Architecture rule of thumb

```
src/
  shared/    types only (no logic)
  engine/    pure poker game logic (no React, no DOM, no Electron)
  gto/       coaching engine: equity, charts, recommend (no React)
  ai/        bot decision logic (no React)
  main/      Electron main process (Node APIs, IPC handlers, electron-store)
  preload/   IPC bridge — typed window.pokerCoach API
  renderer/  React UI + Zustand stores (imports engine/gto/ai)
```

**The renderer imports `engine/`, `gto/`, `ai/`, and `shared/` directly** — they all run in the renderer process, not via IPC. This is a single-player game; there's no server.

The **main process** only handles window lifecycle and persistence. Don't put game logic there.

---

## TypeScript path aliases

Configured in `tsconfig.json`, `electron.vite.config.ts`, and `vitest.config.ts` (keep all three in sync if you add another):

| Alias | Resolves to |
|---|---|
| `@shared/*` | `src/shared/*` |
| `@engine/*` | `src/engine/*` |
| `@gto/*` | `src/gto/*` |
| `@ai/*` | `src/ai/*` |
| `@renderer/*` | `src/renderer/*` |

Use them. Don't use relative `../../../` paths across subsystem boundaries.

---

## Conventions (from `~/.claude/CLAUDE.md` + project-specific)

- **Strict typing, no `any`** — if `pokersolver` or another lib needs a shim, add it in `src/shared/*.d.ts`.
- **No unsolicited comments** — code comments only when *why* is non-obvious (a hidden invariant, a workaround). Don't explain *what* well-named code already says.
- **Minimal changes** — touch only what the task requires. Don't refactor adjacent code that isn't broken.
- **No premature abstraction** — single-use code stays inline.
- **No backwards-compat shims** — if you remove something, delete it cleanly (no commented-out code, no `_removed` wrappers).
- **Tests required for new pure logic** — anything in `engine/`, `gto/`, or `ai/` should ship with Vitest coverage.
- **UI changes**: type-check (`npm run typecheck`) and build (`npm run build`) before declaring done. Visually launching the Electron window for verification is the user's responsibility unless they ask you to.

---

## Where to make common changes

| If you want to... | Edit |
|---|---|
| Add a new poker rule (e.g., antes) | `src/engine/gameState.ts` (`startHand`, `applyAction`, `advanceStreet`) |
| Change how a hand winner is determined | `src/engine/handEvaluator.ts` (wraps `pokersolver`) |
| Add a new bot personality | `src/ai/personalities.ts` (add to the record + `PERSONALITY_LIST`) |
| Change how bots decide | `src/ai/bot.ts` (`decidePreflop` / `decidePostflop`) |
| Improve GTO recommendations | `src/gto/recommend.ts` — keep the `recommend(state, seat) → Recommendation` signature stable |
| Add preflop chart spots | `src/gto/preflopCharts.ts` (`getPreflopAction`) |
| Make equity range-aware | Add `src/gto/rangeModel.ts`, update `src/gto/equity.ts` and `recommend.ts` |
| Add a new UI screen | Add component under `src/renderer/components/<Name>/`, add screen string to `uiStore.ts#Screen`, route it in `App.tsx` |
| Add a new game mode | Extend `GameMode` and `GameConfig` in `src/renderer/state/gameStore.ts`; add a tab/form in `Lobby.tsx` |
| Persist new data across launches | Add an IPC handler in `src/main/index.ts` + `src/main/persistence.ts`, expose via `src/preload/index.ts`, type via `src/renderer/preload-types.d.ts` |
| Add a new package script | `package.json` |
| Change installer config | `electron-builder.yml` |

---

## Critical files and what they own

### `src/engine/gameState.ts` (the hand state machine)

The single source of truth for one hand of poker. Owns:

- `startHand(seeds, opts) → GameState` — posts blinds, deals cards, sets `toAct`
- `applyAction(state, action)` — mutates state forward; handles fold/check/call/bet/raise/all-in
- `advanceTurn` / `advanceStreet` / `settleHand` — internal helpers driving the state machine
- `legalActions(state)` — what the current to-act player can legally do
- Side-pot computation in `settleHand` — iterates through unique contribution levels and awards each layer to the best eligible hand

**Gotchas:**

- The `Player._actedSinceAgg` flag is the key betting-round-end signal. Reset to `false` for everyone on a *full raise* (raiseDelta ≥ minRaise), but **not** on a partial all-in for less than min raise (that's an "all-in call," doesn't reopen action).
- `state._deck` holds undealt cards; only `advanceStreet` should touch it.
- Empty seats: if a player has `stack: 0`, they're set to `sitting-out` and `startHand` skips them when assigning SB/BB. Don't break that filter.
- Action ordering postflop: first active player **after** the button. Preflop heads-up: BTN/SB acts first; preflop 3+: seat after BB acts first.

### `src/gto/recommend.ts` (the teaching surface)

The single public function is `recommend(state, seat) → Recommendation`. **Don't change its signature** without updating `gameStore.submitHeroAction` and `Review.tsx`. This is the swap-out point for a future real solver.

`snapshotFor(state, seat) → GameStateSnapshot` is also exported and used by the renderer to freeze the spot at decision time.

### `src/renderer/state/gameStore.ts` (the renderer's source of truth)

A single Zustand store that drives the entire game UI. Key flows:

- `startSession(config)` → initializes stacks, sets mode, calls `startNewHand()`
- `startNewHand()` → builds seeds, calls `engine.startHand`, kicks off bots
- `submitHeroAction(action)` → **captures the snapshot + recommendation before applying**, then applies and resumes bots
- `runBots()` → loops `decideAction` → `applyAction` until hero's turn or hand ends; on completion, snapshots final stacks and posts to hand-history via IPC

**Gotcha:** the engine mutates `GameState` in place. The store calls `set({ state: { ...state } })` to force React to re-render. If you forget the spread, the UI won't update.

### `src/renderer/components/Table/Table.tsx`

8 absolutely-positioned seats around an ellipse. Hero is always at index 0 (bottom). The mapping uses `(idx - heroSeat + 8) % 8` to rotate other seats around hero.

---

## How to run, test, build

```bash
npm install              # one-time
npm run dev              # launch Electron with HMR
npm test                 # all 61 Vitest tests
npm run test:watch       # watch mode
npm run typecheck        # tsc --noEmit
npm run build            # bundle main+preload+renderer to out/
npm run dist             # full installers via electron-builder
```

Run `npm run typecheck && npm test && npm run build` before declaring any meaningful change done.

---

## Common pitfalls I (or you) hit

### 1. `crypto` is not a renderer import

`src/engine/deck.ts` uses `globalThis.crypto.getRandomValues`. Don't `import { webcrypto } from 'crypto'` — it'll break the Vite renderer build. Web Crypto is available in both Node 20+ and the renderer.

### 2. `postcss.config` and `tailwind.config` must be `.cjs`

Because `package.json` has no `"type": "module"`. If you rename them to `.js` with `export default`, the build will fail with a CJS/ESM mismatch.

### 3. `pokersolver` has no type definitions

Use `import { Hand, SolvedHand } from 'pokersolver'`. The shim in `src/shared/pokersolver.d.ts` provides the types. Don't `require()` it.

### 4. Engine mutates state; renderer needs a new reference

The engine mutates `GameState` in place for performance and simplicity. Whenever the store updates after an engine call, it must spread: `set({ state: { ...state } })`. Without the spread, Zustand sees the same reference and React skips the render.

### 5. The `_actedSinceAgg` reset rule

In `applyAction` for bet/raise/all-in, we **only** reset other players' `_actedSinceAgg` when `raiseDelta >= state.minRaise` (a full raise). All-in for less than a full raise (or all-in matching the current bet) does **not** reopen action. Don't move that reset outside the `if`.

### 6. Engine deals cards starting AT the button, not left of it

In real poker, dealing begins one seat left of the button. The engine deals in `orderFromButton` order which starts at the button. This is functionally equivalent for a random deck but matters for **test fixtures** that rig the deck. The `buildRiggedDeck` helper in `tests/ai/bot.test.ts` and `tests/gto/recommend.test.ts` matches the engine's order — preserve that convention if you add similar helpers.

### 7. Equity is vs random opponents in the MVP

`monteCarloEquity` deals opponents random hands, not range-filtered hands. Tests assert ranges that reflect this (e.g., flopped flush on a 3-card board is ~60-65% vs random, not 90%+). If you make equity range-aware, **update the equity test expectations** to match.

### 8. Adding a new screen to `uiStore.Screen`

Three places to update: `uiStore.ts#Screen` type, the screen-string check in `App.tsx`, and any auto-navigation `useEffect` (e.g., GameOver auto-navigates from anywhere when `tournamentFinish` is set).

---

## When extending the GTO engine

The `recommend` function is the deliberate plug-in point. If you replace its internals (e.g., with a real CFR solver or precomputed solution database):

1. Keep the `recommend(state, seat) → Recommendation` signature.
2. Keep the `Recommendation` shape (`action`, optional `raiseSize`, `equity`, `potOdds`, `reason`).
3. Update `tests/gto/recommend.test.ts` if your model produces different (more accurate) recommendations than the heuristic.
4. The UI (`Review.tsx`) only reads `recommendation.{action, raiseSize, equity, potOdds, reason}` — anything you add beyond that needs UI work too.

---

## Adding a new test

Tests live in `tests/<area>/*.test.ts`. Vitest picks them up automatically. Use the path aliases (`@engine`, `@gto`, etc.) and `vi.describe` / `vi.it` / `expect`. Don't use JSDOM — all logic is pure TS.

For tests that need deterministic dealing, copy the `buildRiggedDeck` helper from `tests/ai/bot.test.ts` or `tests/gto/recommend.test.ts`.

---

## Don't do these

- Don't write a CLAUDE.md or README rewrite without being asked. (This file exists; update it.)
- Don't add a feature flag, config knob, or abstraction "for future flexibility."
- Don't add `try/catch` around engine calls "just in case" — they're meant to throw on invalid input so the test surface stays sharp.
- Don't put game state in `localStorage` — use the typed `window.pokerCoach` API.
- Don't import from `electron` in the renderer (no `nodeIntegration` — won't work). Use the preload bridge.
- Don't change the `Recommendation` or `Decision` shapes without searching for all consumers.
- Don't bypass the betting round end check by setting `street` directly — let `advanceStreet` do it.

---

## Quick sanity check before declaring done

```bash
npm run typecheck && npm test && npm run build
```

All three must pass cleanly (no errors, no test failures, no build warnings about missing files).
