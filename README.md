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

## Two ways to play

**Same computer** — two people, one keyboard, two boards side by side.

**Online** — one player per device. The host creates a room, shares the link, and
both players are dealt the same board from a seed the relay picks. You see your
opponent's score, pairs and progress bar live; you do not see their tiles.

Online play needs the relay in `server/` (a Cloudflare Worker). See
[Deploying the relay](#deploying-the-relay).

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

Online, the relay is the authority: it picks the seed and decides the winner, so a
tampered client cannot declare itself the winner.

## Deploying the relay

The relay is a Cloudflare Worker with one Durable Object per room. It holds the
room state and the two sockets, and nothing else — all the rules live in
`server/src/room.js`, which is plain, testable JavaScript.

```bash
npx wrangler login                 # interactive, once
npm run server:deploy              # prints https://pikachu-duel-room.<you>.workers.dev
npm run set-relay https://pikachu-duel-room.<you>.workers.dev
npm run build:artifact
git commit -am "chore: point at the relay" && git push
```

Durable Objects here are SQLite-backed (`new_sqlite_classes`), which is what the
Workers **free** plan provides. An idle room costs nothing: the sockets hibernate.

The Worker only accepts WebSockets whose `Origin` is `*.github.io` or localhost —
set `ALLOWED_ORIGINS` in `server/wrangler.jsonc` to add your own domain.

### Testing it locally

```bash
npm run server:dev                            # relay on 127.0.0.1:8787
npm run smoke:relay                           # 13 protocol checks over real sockets
npm start                                     # game on localhost:4173
npm run bot ROOM01 -- --name "Robo Misty"     # a second player that actually plays
```

Then open `http://localhost:4173/?room=ROOM01&server=http://127.0.0.1:8787`.

The relay URL can always be overridden per-visit with `?server=<url>`, which is how
the local setup above works without touching `config.js`.

## Shareable links

An online invite is just `?room=CODE`. For same-computer games the whole setup can
be passed in the URL too, so the same deal can be handed to someone else:

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
| `room`    | join an online room by code                |
| `name`    | your name for an online room (skips the join screen) |
| `server`  | override the relay URL                     |

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
src/net/
  config.js             relay URL, room codes, invite links
  client.js             WebSocket client: reconnects, heartbeats, throttling
src/ui/
  lobby.js              the room panel: seats, invite link, host controls
src/styles/             tokens.css + game.css
server/
  wrangler.jsonc        Worker + Durable Object config
  src/room.js           the room rules — pure, and covered by tests
  src/worker.js         routing and socket plumbing only
tests/                  node:test suites for src/game and server/src/room.js
scripts/serve.js        zero-dependency static server
scripts/build-artifact.mjs  generates the hostable copy of index.html
scripts/set-relay.mjs   writes the deployed relay URL into config.js
scripts/smoke-relay.mjs end-to-end protocol check against a running Worker
scripts/bot-player.mjs  a headless opponent, for testing online mode
```

## Tests

```bash
npm test              # node:test, 82 cases, no server needed
npm run smoke:relay   # 13 more against a running Worker
```

The suites cover the path rule (straight, one-turn, two-turn, routes around the
board edge, genuinely blocked pairs), deal determinism for a given seed, dead-board
detection and reshuffling, scoring and streaks, and a full 8×8 playthrough that
clears all 32 pairs.

For the relay: joining and slot assignment, turning away a third player, reconnects
keeping their slot, host-only settings and starts, progress relay, first-to-clear
winning, both-players-timed-out judging, draws, host handover when the host leaves,
and rematches with a fresh or repeated board.
