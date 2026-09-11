# ⚡ Pikachu Duel

The classic **Pikachu / Onet "connect animal"** game, played by two people at once.
Both players get a byte-identical board, side by side, and the first to clear theirs
wins.

No build step, no dependencies — plain ES modules.

## Play

Hosted on GitHub Pages: **https://hahuyhungdev.github.io/pikachu-duel/**

Locally:

```bash
npm start          # http://localhost:4173
```

There is no build step — GitHub Pages serves the repository root as-is. Every asset
path in `index.html` is relative, so the site works from a sub-path. `.nojekyll`
keeps Jekyll from touching the files.

## Rules

Pick two matching animals. They clear if a path can join them that

- runs only horizontally and vertically,
- passes only through **empty space** — cleared tiles, or the gap around the outside
  of the board, and
- turns **at most twice**.

Because a path may leave the board, any two tiles on the outer ring can always reach
each other around the edge. Consecutive matches build a streak worth extra points.

Every tile wears the same ivory face, as in the original — only the picture tells two
tiles apart, so there are no colour shortcuts.

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
| `board`   | `easy` 8×10 · `normal` 10×12 · `hard` 12×14 |
| `clock`   | `180` · `300` · `480` · `0` (no clock)     |
| `seed`    | base-36 seed — same seed, same board       |
| `auto`    | `1` to skip the setup screen               |

## Difficulty

| Board    | Grid    | Animals | Hints | Shuffles |
| -------- | ------- | ------- | ----- | -------- |
| Easy     | 8 × 10  | 16      | 3     | 3        |
| Normal   | 10 × 12 | 20      | 2     | 2        |
| Hard     | 12 × 14 | 24      | 1     | 1        |

## Layout

```
index.html              the page
src/game/               pure, testable game logic (no DOM)
  rng.js                seeded PRNG — both players get the same deal
  grid.js               padded grid primitives
  connect.js            the ≤2-turn path rule, hints, reshuffling
  board.js              board generation (guaranteed to open with a legal move)
  session.js            one player's run: selection, scoring, hints, shuffles
  icons.js              the 24-animal tile cast
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
