# Poker Coach

A cross-platform desktop **No-Limit Texas Hold'em** game (8-max) that teaches **GTO-style decision making** through an interactive post-hand review. Play a hand against 7 AI bots, then click through every decision you made and see the recommended action, your hand's equity, pot odds, and a written explanation of *why*.

Built with **Electron + React + TypeScript + Vite + Tailwind**.

---

## Table of Contents

- [Features](#features)
- [Quickstart](#quickstart)
- [How to Play](#how-to-play)
- [Game Modes](#game-modes)
- [The Review Screen](#the-review-screen)
- [Architecture](#architecture)
- [How the GTO Engine Works](#how-the-gto-engine-works)
- [AI Bot Personalities](#ai-bot-personalities)
- [Project Structure](#project-structure)
- [Scripts](#scripts)
- [Tests](#tests)
- [Configuration & Settings](#configuration--settings)
- [Persistence](#persistence)
- [Packaging](#packaging)
- [Roadmap & Limitations](#roadmap--limitations)
- [License](#license)

---

## Features

- **8-max No-Limit Hold'em** vs 7 AI opponents with distinct personalities.
- **Two game modes**:
  - **Cash** — fixed blinds and buy-in. Busted bots auto-rebuy.
  - **Single-Table Tournament** — escalating blind levels on a timer, **antes**, short-stack push/fold play, last player standing wins.
- **Range-based GTO coaching**: every opponent is put on a real range (inferred from their position and actions), and your equity is computed **vs those ranges**, not vs random hands.
- **GTO Wizard-style strategy mixes**: each reviewed decision shows the full mixed strategy (e.g. *Raise to 11bb 70% / Call 30%*) with a frequency bar, not just one "correct" answer.
- **Decision grading**: every action is graded *Best / Good / Inaccuracy / Mistake / Blunder* with an estimated EV loss in big blinds, plus a per-hand accuracy score — and an **instant feedback toast** at the table right after you act.
- **The numbers that matter**, every spot: equity vs range, required equity (pot odds), minimum defense frequency (MDF), and the EV of calling in bb.
- **Plain-language coaching**: each recommendation explains the *why* in concepts (pot odds, semi-bluffing, range advantage, MDF, implied odds) — patterns, not memorization.
- **Solver-approximation preflop charts**: positional RFI ranges (~10% UTG to ~46% BTN), 3-bet/call/fold responses by position matchup, 4-bet/5-bet trees, BB defense, and Nash-style jam/fold ranges at ≤10bb.
- **Cryptographically random** card dealing using the Web Crypto API (Fisher-Yates shuffle with rejection sampling — no `Math.random` for cards).
- **Real betting mechanics**: side pots, min-raise rule, all-in for-less semantics, antes, dead small blinds when seats are empty.
- **Pluggable GTO engine** — range model + Monte Carlo + solver-derived heuristics today; designed so a real CFR solver can drop in later without touching the UI.
- **Settings persistence** (electron-store) — your mode, blinds, and buy-in are remembered between launches.
- **Hand history** of the last 500 hands persisted locally.
- **Packageable** for macOS (dmg/zip), Windows (NSIS), and Linux (AppImage/deb) via electron-builder.

---

## Quickstart

### Requirements

- **Node.js 20+** and **npm 10+**
- A desktop environment (the renderer ships as an Electron window)

### Install & run

```bash
git clone <repo-url> poker-coach
cd poker-coach
npm install
npm run dev
```

The Electron window opens at the Lobby. Choose **Cash** or **Tournament**, set blinds, click **Start Game**.

---

## How to Play

1. **Lobby** — pick a mode and configure blinds/buy-in (cash) or starting stack/level duration (tournament). Click *Start Game*.
2. **Table** — you sit at the bottom seat (the "Hero" seat). 7 bots fill the other seats. The dealer button rotates clockwise each hand. The current to-act player has a pulsing green ring around their seat tag.
3. **Action bar** (bottom center) — appears whenever it's your turn:
   - **Fold** — give up the hand.
   - **Check / Call** — match the current bet for free (check) or for the displayed amount (call). The call button shows the **equity you need** for the call to be profitable.
   - **Bet / Raise** — drag the slider or click **Min / 33% / 50% / 75% / Pot / All-in** for quick sizings, then click the green button. Amounts are shown in chips and big blinds.
   - After each action a **feedback toast** appears at the top of the table grading your play (Best/Good/Inaccuracy/Mistake/Blunder); the full breakdown waits in the review.
4. **Bots auto-act** when it's not your turn. The pot, board, and bet chips update live.
5. **Hand ends** — winners are revealed (their cards become face-up) and after ~1.2 seconds the **Review screen** appears.
6. **Review** — click any of your decisions in the timeline at top to see the recommendation, equity, pot odds, and explanation for that specific spot. When done, click **Next Hand** to deal again or **Back to Lobby** to change settings.

### UI legend

- **Dealer button**: white circle with a **D** next to the seat name. Rotates clockwise each hand.
- **Position label**: small text next to the name (`UTG`, `MP`, `BTN`, etc.) — your absolute position relative to the button.
- **Pulsing green ring**: it's that player's turn to act.
- **Gold ring**: this player won (or split) the pot.
- **Chip icon below seat**: the player's current bet on this street.
- **Pot (center)**: total chips wagered so far this hand.
- **Top-left badge**: current blind level (and in tournament mode, the level number).

---

## Game Modes

### Cash

Fixed blinds and buy-in for the entire session. Configure in the Lobby:

| Field | Meaning |
|---|---|
| **Small Blind** | Chips posted by the SB before each hand |
| **Big Blind** | Chips posted by the BB before each hand |
| **Buy-in** | Starting stack for hero and all bots (in chips) |

Bots that bust between hands are auto-rebought to the buy-in amount. Hero rebuys are not implemented — bust means returning to lobby.

### Single-Table Tournament

8 players, last-one-standing wins. Configure:

| Field | Meaning |
|---|---|
| **Starting Stack** | Chips every player begins with |
| **Level (min)** | Real-time minutes per blind level |

The default blind schedule has 8 escalating levels:

| Level | SB | BB | Ante |
|---|---|---|---|
| 1 | 10 | 20 | 0 |
| 2 | 15 | 30 | 0 |
| 3 | 25 | 50 | 0 |
| 4 | 50 | 100 | 10 |
| 5 | 75 | 150 | 15 |
| 6 | 100 | 200 | 25 |
| 7 | 150 | 300 | 30 |
| 8 | 200 | 400 | 50 |

Antes are collected from every player from level 4 on and go straight to the pot. As stacks get shallow the coach (and the bots) switch to Nash-style **jam-or-fold** play at ≤10 big blinds. When players bust, the table re-assigns the *late* positions first (a 6-handed table has MP/HJ/CO, not three UTGs), so the preflop charts stay accurate all the way to heads-up.

When a player's stack hits 0 they're eliminated. The tournament ends when hero is eliminated *or* hero is the lone survivor. A **Game Over** screen shows your finishing place.

---

## The Review Screen

The review screen is the heart of the teaching feature. It only appears at the end of each hand and only shows decisions *you* made (bot decisions aren't shown).

**Header** — your **accuracy score** for the hand (0–100, weighted by decision grades) and total estimated EV lost in big blinds. Each decision chip in the timeline carries a colored grade dot.

**Left panel — The Spot**
- Street, position, pot / to-call / stack (in chips **and** big blinds), opponents still in, hand class
- Your hole cards and the board at that moment
- **Opponent range model** — what range each villain is on and why (e.g. *"CO open (~28% of hands)"*, *"BB check (wide)"*)

**Right panel — Strategy**
- **Verdict banner** — your grade (*Best play ✓* … *Blunder ✗*), your action vs the GTO primary action, and estimated EV lost
- **GTO strategy mix** — a stacked frequency bar plus per-option rows: every action in the equilibrium mix with its sizing and frequency (e.g. *Bet 12 (66% pot) — 55%, Check — 45%*)
- **The numbers** — equity vs range, equity needed (pot odds), minimum defense frequency (MDF), EV of calling in bb
- **Why** — concept tags (*Pot odds*, *Semi-bluff*, *MDF*, *Range betting*, …) and a plain-language explanation of the reasoning

Click any decision in the timeline at the top to jump to that spot.

---

## Architecture

Standard Electron 3-process split with all game logic in a pure `engine/` module that lives in the renderer (this is a local single-player game — no IPC-heavy main-process work is needed).

```
┌──────────────────────────────────────────────────────────────────┐
│ Main process (src/main)                                          │
│  - BrowserWindow lifecycle                                       │
│  - electron-store persistence (settings + hand history)          │
│  - IPC handlers: settings:load/save, history:load/append         │
└────────────┬─────────────────────────────────────────────────────┘
             │  (contextBridge IPC)
             ▼
┌──────────────────────────────────────────────────────────────────┐
│ Preload (src/preload)                                            │
│  - Exposes typed window.pokerCoach API to renderer               │
└────────────┬─────────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────────┐
│ Renderer (src/renderer)        React + Zustand + Tailwind        │
│                                                                  │
│  ┌──────────┐    ┌────────────┐    ┌──────────┐    ┌──────────┐  │
│  │  Lobby   │ →  │   Table    │ →  │  Review  │ →  │ GameOver │  │
│  └──────────┘    └────────────┘    └──────────┘    └──────────┘  │
│         ▲             │ │ ▲              ▲             ▲         │
│         │             │ │ │              │             │         │
│  ┌──────┴─────────────▼─▼─┴──────────────┴─────────────┘──────┐  │
│  │  Zustand stores: gameStore, uiStore                         │  │
│  └────────────┬───────────────────────────────────────────────┘  │
└───────────────┼──────────────────────────────────────────────────┘
                │
   ┌────────────┼────────────┬────────────┐
   ▼            ▼            ▼            ▼
┌────────┐ ┌──────────┐ ┌─────────┐ ┌───────────┐
│ engine │ │   gto    │ │   ai    │ │  shared   │
│        │ │          │ │         │ │  types    │
│ pure   │ │ equity,  │ │ bot     │ │           │
│ TS,    │ │ charts,  │ │ decide, │ │           │
│ no UI  │ │ recommend│ │ persona │ │           │
└────────┘ └──────────┘ └─────────┘ └───────────┘
```

**Data flow for a single hand:**

1. `Lobby.start()` builds a `GameConfig` and calls `gameStore.startSession()`.
2. `gameStore.startNewHand()` calls `engine.startHand()` which posts blinds, deals cards, sets `toAct`.
3. `gameStore.runBots()` loops while it's not hero's turn: `ai.decideAction()` → `engine.applyAction()` (mutates state).
4. UI re-renders on each Zustand update. Hero's `ActionBar` shows when `state.toAct === heroSeat`.
5. On hero action: `gto.recommend()` is computed and stored in `state.decisions[]` *before* the action is applied (so the recommendation reflects the spot the hero actually faced).
6. When `state.street === 'complete'`, hand history is sent to the main process and the UI navigates to `Review`.

---

## How the GTO Engine Works

The engine approximates solver play with four cooperating pieces. It is not a CFR solver, but every recommendation is grounded in the same quantities a solver balances: range vs range equity, pot odds, MDF, and fold equity.

### 1. Preflop range data (`src/gto/ranges.ts`)

Hand ranges are written in standard poker notation (`"TT+, ATs+, KQo:0.5"`) and parsed into weighted 169-grid ranges:

- **RFI charts** per position, ~10% (UTG) widening to ~46% (BTN), with mixed-frequency edge hands.
- **vs-RFI responses** (3-bet / call / fold) keyed by opener bucket (EP/MP/LP/SB) × responder context (in position / SB / BB). The BB defends far wider vs a BTN open than vs an UTG open.
- **vs-3bet / vs-4bet trees**: value 4-bets, A5s-type bluffs, 5-bet jams.
- **Jam-or-fold ranges** for ≤10bb stacks (Nash-style, by position).
- Modeling ranges for passive lines: open-limps, over-limps, BB preflop checks.

### 2. Villain range model (`src/gto/rangeModel.ts`)

Each opponent still in the hand is assigned a weighted range from their actions: open-raisers get their positional RFI range, 3-bettors get a 3-bet range, callers get a flat range, limpers get a loose-passive range, and a BB check gets "everything except the iso-raising hands". Postflop aggression narrows the range toward hands that connect with the board (with a residue of bluffs kept in).

### 3. Range-aware equity (`src/gto/equity.ts`)

Monte Carlo equity where each villain's hole cards are **sampled from their modeled range** (weighted, card-conflict aware) rather than dealt at random. ~700 iterations postflop, ~400 preflop, evaluated with `pokersolver`. Ties count as half-wins.

### 4. Strategy engine (`src/gto/recommend.ts`)

Produces a **mixed strategy** (a set of actions with sizings and frequencies), not a single answer:

- **Preflop**: chart-driven mixes with position-based open sizes (2.2–3.0bb), 3-bet sizing 3x IP / 4x OOP, 4-bets at 2.3x, automatic jam-or-fold at ≤10bb effective.
- **Postflop**: classifies the hand (*Monster / Strong value / Strong draw / Draw / Marginal / Air*) from equity vs range plus draw detection, reads the board texture (dry/wet/paired/monotone), and builds the mix from GTO principles — small high-frequency range bets on dry boards with the range advantage, polarized big bets with monsters, semi-bluff mixes with draws, MDF-based bluff-catching, and indifference mixing in true coin-flip spots.
- **Grading** (`gradeDecision`): your actual action is located in the mix — top-frequency arm → *Best*, secondary arm → *Good*, rare arm → *Inaccuracy*; actions outside the mix get an estimated EV loss in bb (e.g. folding a hand with EV(call) = +2.7bb is a *Blunder*). `accuracyScore` aggregates a hand into a 0–100 score.

Every recommendation also reports equity, required equity, MDF, EV of calling, the villain range summary, and concept tags used by the Review UI.

### Designed for replacement

The public surface of the GTO engine is just one function:

```ts
function recommend(state: GameState, seat: number): Recommendation
```

A future real solver implementation can replace `src/gto/recommend.ts` (and add files behind it) without touching `gameStore.ts` or any UI component.

---

## AI Bot Personalities

Bots play **from the same GTO preflop charts as the coach**, with personality skews applied as `frequency^(1/aggression)` — so pure strategies stay pure (every bot still always opens AA) while borderline hands shift with style. Postflop they use personality thresholds plus draw-aware semi-bluffs, pot-odds-based calls, and short-stack jams. The 5 personalities live in `src/ai/personalities.ts`:

| Personality | Preflop tightness | Postflop aggression | Bluff freq | Notes |
|---|---|---|---|---|
| **TAG** (tight-aggressive) | Tight (open ≥ 0.55) | Bet strong hands, fold marginal | 15% | The "default" winning profile |
| **LAG** (loose-aggressive) | Loose (open ≥ 0.45) | Aggressive with wide range, more bluffs | 30% | Hard to put on a hand |
| **Rock** (tight-passive) | Very tight (open ≥ 0.65) | Only bets premium hands | 3% | Easy to read; folds a lot |
| **Station** (loose-passive) | Loose (open ≥ 0.5) | Calls down with weak pairs | 5% | Hard to bluff; pays off value bets |
| **GTO** (balanced) | Mid (open ≥ 0.5) | Balanced thresholds | 20% | Approximates the GTO recommender |

One of each personality fills the table; assignment is by seat index (`seat % 5`).

---

## Project Structure

```
poker-coach/
├── electron.vite.config.ts          # build config (main/preload/renderer)
├── electron-builder.yml             # packaging config (mac/win/linux)
├── package.json
├── tsconfig.json                    # strict TS with path aliases
├── vitest.config.ts
├── postcss.config.cjs
├── tailwind.config.cjs
├── README.md                        # this file
├── CLAUDE.md                        # agent/contributor guide
│
├── src/
│   ├── main/
│   │   ├── index.ts                 # Electron entry, BrowserWindow, IPC
│   │   └── persistence.ts           # electron-store for settings + history
│   ├── preload/
│   │   └── index.ts                 # exposes window.pokerCoach API
│   ├── shared/
│   │   ├── types.ts                 # all cross-cutting TS types
│   │   └── pokersolver.d.ts         # type shims for the pokersolver lib
│   ├── engine/                      # PURE game logic, no React, no DOM
│   │   ├── deck.ts                  # Fisher-Yates + Web Crypto RNG
│   │   ├── handEvaluator.ts         # wraps pokersolver
│   │   ├── positions.ts             # assign BTN/SB/BB/UTG... + action order
│   │   └── gameState.ts             # state machine, betting rounds, side pots
│   ├── gto/                         # teaching engine (pluggable)
│   │   ├── ranges.ts                # range notation parser + preflop range data
│   │   ├── rangeModel.ts            # infers villain ranges from the action log
│   │   ├── equity.ts                # Monte Carlo equity (range-aware + random)
│   │   ├── preflopCharts.ts         # mixed preflop strategies from range data
│   │   └── recommend.ts             # strategy mixes, grading, explanations
│   ├── ai/                          # bot opponents
│   │   ├── handStrength.ts          # Chen-formula + made-hand strength
│   │   ├── personalities.ts         # 5 personality threshold sets
│   │   └── bot.ts                   # decideAction(state) → PlayerAction
│   └── renderer/                    # React UI
│       ├── main.tsx
│       ├── App.tsx                  # screen router
│       ├── preload-types.d.ts       # window.pokerCoach types
│       ├── state/
│       │   ├── gameStore.ts         # Zustand: hand lifecycle + decision log
│       │   └── uiStore.ts           # current screen
│       ├── styles/index.css
│       └── components/
│           ├── Lobby/Lobby.tsx
│           ├── Table/Table.tsx
│           ├── PlayerSeat/PlayerSeat.tsx
│           ├── ActionBar/ActionBar.tsx
│           ├── Card/Card.tsx
│           ├── Review/Review.tsx
│           └── GameOver/GameOver.tsx
│
└── tests/
    ├── engine/
    │   ├── deck.test.ts
    │   ├── handEvaluator.test.ts
    │   ├── positions.test.ts
    │   └── gameState.test.ts
    ├── ai/
    │   ├── handStrength.test.ts
    │   ├── bot.test.ts
    │   └── fullHand.test.ts         # end-to-end 8-player headless smoke test
    └── gto/
        ├── equity.test.ts
        ├── preflopCharts.test.ts
        └── recommend.test.ts
```

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Launch Electron with hot reload |
| `npm run build` | Production bundle (writes to `out/`) |
| `npm run preview` / `npm start` | Run the production bundle |
| `npm test` | Run all Vitest tests once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run typecheck` | `tsc --noEmit` (no JS output, just type-check) |
| `npm run pack` | Package an unpacked app dir into `dist/` (for testing without installing) |
| `npm run dist` | Build full installer (mac dmg/zip, win nsis, linux AppImage/deb) |

---

## Tests

**100 tests across 12 files**, all pure logic — no Electron/DOM required. Run with `npm test`.

| File | Coverage |
|---|---|
| `tests/engine/deck.test.ts` | Fresh-deck uniqueness, shuffle preserves cards, shuffles differ |
| `tests/engine/handEvaluator.test.ts` | Flush detection, straight comparison, split pots |
| `tests/engine/positions.test.ts` | 8-max / 6-max / 3-handed / heads-up assignment, late positions kept short-handed |
| `tests/engine/gameState.test.ts` | Blind + ante posting, betting flow, raise reopening, side pots, limped pots |
| `tests/ai/handStrength.test.ts` | Preflop Chen formula sanity, made-hand classification, draw recognition |
| `tests/ai/bot.test.ts` | TAG folds 72o UTG, raises AA UTG, short-stack jams, all personalities legal |
| `tests/ai/fullHand.test.ts` | 50 trials of full 8-player hands; chip conservation invariant |
| `tests/gto/ranges.test.ts` | Range notation parser, range percentages, RFI monotonicity, BB defense width |
| `tests/gto/rangeModel.test.ts` | Open-raisers on RFI ranges, BB checks are wide, dead-card exclusion |
| `tests/gto/equity.test.ts` | Random-hand baselines + range-aware: KQo much worse vs UTG range than vs random |
| `tests/gto/preflopCharts.test.ts` | Mix frequencies sum to 1, jam-or-fold at 8bb, 5-bet trees, legacy chart sanity |
| `tests/gto/recommend.test.ts` | Strategy mix normalization, short-stack jams, decision grading tiers, accuracy score |

There is also a headless smoke simulation (`npx tsx scripts/smoke.ts`) that plays hundreds of full hands with the hero following the coach, asserting every recommendation is legal, self-consistent (*following the coach always grades "Best"*), and fast (~30ms per recommendation).

### Adding a new test

Tests use **Vitest** with the same path aliases as the app (`@shared`, `@engine`, `@gto`, `@ai`, `@renderer`). Drop a `*.test.ts` file under `tests/<area>/` and it'll be picked up automatically.

---

## Configuration & Settings

User-facing settings (mode, blinds, buy-in, tournament structure) are configured in the Lobby and **persisted** between launches via `electron-store`. Reset is as simple as starting a new session — the next time you open the Lobby it loads your last config.

Configuration not yet exposed in the UI (you can edit constants in source):

| Where | Constant | Default |
|---|---|---|
| `src/gto/recommend.ts` | `POSTFLOP_ITERATIONS` / `PREFLOP_ITERATIONS` | 700 / 400 equity iterations |
| `src/gto/preflopCharts.ts` | `SHORT_STACK_BB` | 10 (jam-or-fold threshold) |
| `src/gto/ranges.ts` | all range charts | RFI / vs-RFI / 3-bet / 4-bet / jam ranges |
| `src/main/persistence.ts` | `DEFAULT_SETTINGS.tournament.levels` | 8-level schedule |
| `src/main/persistence.ts` | history cap | 500 hands |
| `src/renderer/state/gameStore.ts` | `BOT_NAMES` | Avery, Blake, Casey, Devon, Eli, Frankie, Gray |

---

## Persistence

Settings and hand history are persisted to the OS-standard app data location via `electron-store`:

- **macOS**: `~/Library/Application Support/poker-coach/`
- **Windows**: `%APPDATA%\poker-coach\`
- **Linux**: `~/.config/poker-coach/`

Two JSON files:

- `settings.json` — last-used mode and game config
- `hand-history.json` — `{ hands: HandSummary[] }`, capped at 500 most recent hands

A "view past hands" UI is not yet implemented — the data is captured for future browsing/replay features.

---

## Packaging

Run `npm run dist` to build installers for all three desktop platforms (configured in `electron-builder.yml`):

- **macOS**: `dist/Poker Coach-<version>.dmg` + `.zip`
- **Windows**: `dist/Poker Coach Setup <version>.exe` (NSIS)
- **Linux**: `dist/Poker Coach-<version>.AppImage` + `.deb`

Code-signing is disabled (`identity: null` for mac) — for distribution you'll need to add Apple Developer / Windows code-signing credentials to the builder config.

---

## Roadmap & Limitations

**Known simplifications:**

- **No CFR/solver.** Postflop mixes are built from GTO principles (range equity, MDF, pot odds, texture) rather than solved game trees, so frequencies are approximations. The architecture is designed so a real solver can swap in behind `recommend()`.
- **Postflop range narrowing is coarse** — aggression re-weights a villain's range toward board-connecting hands, but bet sizes and multi-street lines aren't modeled.
- **EV-loss numbers are estimates** for actions outside the mix (exact only for call/fold-vs-price spots).
- **No ICM** — tournament recommendations are chip-EV (plus push/fold), not ICM-adjusted.
- **No hand history browser** — the JSON is saved but there's no UI to replay old hands.
- **No 13×13 range grid visualization** — ranges are described in words in the review.
- **No multi-table tournaments**, no rebuys/add-ons (single-table only).
- **Hero cannot rebuy** mid-cash-session — busting returns you to the lobby.

**Likely next steps:**

1. A 13×13 preflop range grid in the Review screen (the data in `gto/ranges.ts` is already grid-shaped).
2. A session dashboard: accuracy trend, biggest EV losses, leak categories by concept tag.
3. ICM-aware tournament adjustments near the bubble.
4. A "hand history" screen to replay past hands.
5. Hero rebuy in cash mode.

---

## License

MIT (see `package.json`).
