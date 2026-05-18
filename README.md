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
  - **Single-Table Tournament** — escalating blind levels on a timer, last player standing wins.
- **Cryptographically random** card dealing using the Web Crypto API (Fisher-Yates shuffle with rejection sampling — no `Math.random` for cards).
- **Real betting mechanics**: side pots, min-raise rule, all-in for-less semantics, dead small blinds when seats are empty.
- **Post-hand review** with per-decision breakdown: recommended action, equity, pot odds, and a 2-3 sentence explanation.
- **Pluggable GTO engine** — currently a heuristic + Monte Carlo equity hybrid; designed so a real CFR solver can drop in later without touching the UI.
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
   - **Check / Call** — match the current bet for free (check) or for the displayed amount (call).
   - **Bet / Raise** — drag the slider or click **Min / ½ pot / Pot / All-in** for quick sizings, then click the green button.
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

> **Note:** Ante posting is defined in the schedule but not yet collected by the betting engine — antes will be added in a future iteration.

When a player's stack hits 0 they're eliminated. The tournament ends when hero is eliminated *or* hero is the lone survivor. A **Game Over** screen shows your finishing place.

---

## The Review Screen

The review screen is the heart of the teaching feature. It only appears at the end of each hand and only shows decisions *you* made (bot decisions aren't shown).

**Left panel — Spot**
- Street, position, pot size, amount to call, your stack, number of opponents still in
- Your hole cards
- The board at that moment

**Right panel — Recommendation**
- **Equity** (%) — your win probability vs the estimated villain ranges
- **Pot odds (need)** (%) — equity you need for a profitable call
- **GTO recommendation** — fold / check / call / bet / raise (with sizing)
- **Your action** — what you actually did, with a ✓ if it matched the recommendation or ✗ if it didn't
- **Why** — 2-3 sentence explanation citing equity, pot odds, hand class, and range considerations

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

The GTO engine is a **pragmatic MVP**, not a true CFR solver. It combines three signals to produce a recommendation:

### 1. Preflop charts (`src/gto/preflopCharts.ts`)

A simplified position-based chart. For each `(position, hand, scenario)` it returns one of `raise / call / check / fold` with a written reason.

- **Scenarios**: `open`, `vsRaise`, `vs3bet`, `limpedPot`.
- **Position tightness multipliers** scale the open threshold: UTG needs stronger hands than BTN.
- **Hand strength**: computed via a Chen-like formula (`src/ai/handStrength.ts#preflopStrength`).
- **Premium hands** (`AA, KK, QQ, JJ, AKs, AKo`) always 3bet vs an opening raise.

### 2. Equity calculator (`src/gto/equity.ts`)

A Monte Carlo equity calculator. Given hero's hole cards, the current board, and the number of opponents, it:

1. Removes used cards from a fresh deck.
2. For N iterations (default 600 postflop, 300 preflop), shuffles remaining cards, deals random hole cards to each opponent, fills the board to 5 cards.
3. Evaluates all hands using `pokersolver`.
4. Returns hero's win probability (ties count as half-wins).

**Important MVP limitation**: opponents are dealt *random* hands, not range-filtered hands. So "equity" here means "equity vs a random opponent" — true GTO equity would condition on the opponent's preflop range narrowed by their postflop actions. The interface is range-aware (the `numOpponents` parameter is a stand-in) so a future range-aware version can drop in.

### 3. Recommender (`src/gto/recommend.ts`)

Combines the above:

- **Preflop**: looks up the chart action; sizes raises to 2.2–3.0 BB depending on position.
- **Postflop, no bet to face**:
  - `equity ≥ 60%` → value bet 2/3 pot
  - `equity ≥ 45%` and made hand → small bet 1/2 pot
  - else → check
- **Postflop, facing a bet**:
  - `equity ≥ potOdds + 18%` → raise
  - `equity ≥ potOdds + 3%` → call
  - else → fold

The explanation (`reason` field) is generated inline by stringing together the actual equity/pot-odds numbers and a sentence about the spot.

### Designed for replacement

The public surface of the GTO engine is just one function:

```ts
function recommend(state: GameState, seat: number): Recommendation
```

A future real solver implementation can replace `src/gto/recommend.ts` (and add files behind it) without touching `gameStore.ts` or any UI component.

---

## AI Bot Personalities

Bots use `src/ai/bot.ts#decideAction` which works similarly to `recommend` but with personality-tuned thresholds. The 5 personalities live in `src/ai/personalities.ts`:

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
│   │   ├── equity.ts                # Monte Carlo equity
│   │   ├── preflopCharts.ts         # static charts by position/scenario
│   │   └── recommend.ts             # produces Recommendation + reason
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

**61 tests across 10 files**, all pure logic — no Electron/DOM required. Run with `npm test`.

| File | Coverage |
|---|---|
| `tests/engine/deck.test.ts` | Fresh-deck uniqueness, shuffle preserves cards, shuffles differ |
| `tests/engine/handEvaluator.test.ts` | Flush detection, straight comparison, split pots |
| `tests/engine/positions.test.ts` | 8-max / heads-up position assignment, button rotation, sparse seats |
| `tests/engine/gameState.test.ts` | Blind posting, betting flow, raise reopening, side pots, limped pots |
| `tests/ai/handStrength.test.ts` | Preflop Chen formula sanity, made-hand classification, draw recognition |
| `tests/ai/bot.test.ts` | TAG folds 72o UTG, raises AA UTG, all personalities return legal actions |
| `tests/ai/fullHand.test.ts` | 50 trials of full 8-player hands; chip conservation invariant |
| `tests/gto/equity.test.ts` | AA ~85%, 72o ~35%, made flush ~99%, equity drops with more opponents |
| `tests/gto/preflopCharts.test.ts` | AA opens everywhere, 72o folds everywhere, BTN wider than UTG, 4bets, limped-pot defaults |
| `tests/gto/recommend.test.ts` | Recommendation shape, AA→raise, 72o→fold, flush→value bet, weak vs big bet→fold |

### Adding a new test

Tests use **Vitest** with the same path aliases as the app (`@shared`, `@engine`, `@gto`, `@ai`, `@renderer`). Drop a `*.test.ts` file under `tests/<area>/` and it'll be picked up automatically.

---

## Configuration & Settings

User-facing settings (mode, blinds, buy-in, tournament structure) are configured in the Lobby and **persisted** between launches via `electron-store`. Reset is as simple as starting a new session — the next time you open the Lobby it loads your last config.

Configuration not yet exposed in the UI (you can edit constants in source):

| Where | Constant | Default |
|---|---|---|
| `src/gto/recommend.ts` | `MC_ITERATIONS` | 600 (postflop equity iterations) |
| `src/gto/equity.ts` | preflop iterations arg | 300 (passed from recommender) |
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

**Known MVP simplifications:**

- **Equity is vs random hands**, not vs estimated ranges. Real GTO equity should condition on each opponent's preflop range narrowed by their postflop actions.
- **No CFR/solver**. All "GTO" guidance is heuristic + Monte Carlo. The architecture is designed so a real solver can swap in behind `recommend()`.
- **No antes** — the tournament blind schedule defines them but the betting engine doesn't collect them yet.
- **No hand history browser** — the JSON is saved but there's no UI to replay old hands.
- **No range visualization** — review shows action + equity + reason, but not the 13×13 hand grid that real GTO trainers display.
- **No multi-table tournaments**, no rebuys/add-ons (single-table only).
- **Hero cannot rebuy** mid-cash-session — busting returns you to the lobby.

**Likely next steps:**

1. Replace random-opponent equity with range-filtered equity using `src/gto/rangeModel.ts` (stub already noted in plan).
2. Add a 13×13 preflop range visualization to the Review screen.
3. Implement antes in the betting engine.
4. Add a "hand history" screen to replay past hands.
5. Hero rebuy in cash mode.

---

## License

MIT (see `package.json`).
