# ⚡ Pikachu Duel

A two-player **Pikachu / Onet "connect animal"** race for the browser. Both players
get a byte-identical board, side by side, and the first to clear theirs wins.

No build step, no dependencies — plain ES modules.

## Play

```bash
npm start          # http://localhost:4173
```

## Rules

Pick two identical tiles. They clear if a path can join them that

- runs only horizontally and vertically,
- passes only through **empty space** — cleared tiles, or the gap around the outside
  of the board, and
- turns **at most twice**.

Because a path may leave the board, any two tiles on the outer ring can always reach
each other around the edge. Consecutive matches build a streak worth extra points.

If a board runs out of legal moves it is reshuffled automatically — nobody gets stuck.

## Controls

|          | Player 1 (left) | Player 2 (right) |
| -------- | --------------- | ---------------- |
| Move     | `W` `A` `S` `D` | `↑` `←` `↓` `→`  |
| Pick     | `Space` / `F`   | `Enter`          |
| Hint     | `Q`             | `,`              |
| Shuffle  | `E`             | `.`              |

Either board can also just be clicked or tapped, so a single mouse works fine.

## Winning

- **Someone clears their board** → they win immediately.
- **Clock runs out** → most pairs cleared wins, then highest score, else a draw.

## Shareable duels

Setup can be passed in the URL, so the same deal can be handed to someone else:

```
?p1=Ash&p2=Misty&board=champion&clock=300&seed=zzz9&auto=1
```

| Param     | Values                                     |
| --------- | ------------------------------------------ |
| `p1` `p2` | player names (18 chars max)                |
| `board`   | `rookie` 6×6 · `trainer` 8×8 · `champion` 8×10 |
| `clock`   | `180` · `300` · `480` · `0` (no clock)     |
| `seed`    | base-36 seed — same seed, same board       |
| `auto`    | `1` to skip the setup screen               |

## Layout

```
index.html              the page
src/game/               pure, testable game logic (no DOM)
  rng.js                seeded PRNG — both players get the same deal
  grid.js               padded grid primitives
  connect.js            the ≤2-turn path rule, hints, reshuffling
  board.js              board generation (guaranteed to open with a legal move)
  session.js            one player's run: selection, scoring, hints, shuffles
  icons.js              tile faces and their colours
src/ui/                 DOM layer
  app.js                duel orchestration, clock, keyboard, overlays
  boardView.js          renders a board, draws the path trace
  audio.js              WebAudio blips, no assets
src/styles/             tokens.css + game.css
tests/                  node:test suites for everything under src/game
scripts/serve.js        zero-dependency static server
scripts/build-artifact.mjs  generates the hostable copy of index.html
```

## Tests

```bash
npm test           # node:test, 56 cases
npm run test:watch
```

The suites cover the path rule (straight, one-turn, two-turn, routes around the
board edge, genuinely blocked pairs), deal determinism for a given seed, dead-board
detection and reshuffling, scoring and streaks, and a full 8×8 playthrough that
clears all 32 pairs.
