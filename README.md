# ⚡ Pikachu Duel

The classic **Pikachu / Onet connect** game, reimagined for modern browsers with real-time multiplayer, single-player campaigns, dynamic hazards, and responsive touch controls.

Both players in a duel receive a byte-identical board deal generated from a shared seed — the first to clear their board wins.

---

## 🎮 Play

- **Hosted on GitHub Pages**: **[https://hahuyhungdev.github.io/pikachu-duel/](https://hahuyhungdev.github.io/pikachu-duel/)**
- **Local Development**:
  ```bash
  npm install
  npm start          # Vite dev server on http://localhost:4173
  ```

`npm run build` compiles the production bundle into `dist/`.

---

## 📜 Connection Rules

Pick two matching Pokémon tiles. They clear if and only if an orthogonal path joins them that:
- Runs strictly horizontally and vertically,
- Traverses only **empty space** (cleared cells or the padded border around the grid), and
- Turns **at most twice** (maximum of two 90-degree corners).

Because paths can exit the grid into the padded outer ring, any two identical tiles along the outer perimeter can reach each other.

If a board runs out of legal moves at any point, it is automatically and deterministically reshuffled.

---

## 🕹️ Game Modes

Pikachu Duel offers 5 distinct game modes suited for competitive duels or solo runs:

1. **Classic (Duel & Solo)**: The original timed race. One board, one countdown timer ($300\text{s}$ default).
2. **Adventure Mode**: Climb a progressive ladder of handcrafted stages. Players start with 3 hearts. Board sizes grow from $6 \times 8$ up to $12 \times 16$, clock limits tighten, and new mechanics are introduced sequentially.
3. **Time Attack**: High-intensity mode starting with only $60\text{s}$ on the clock. Every matched pair adds $+2\text{s}$, and matching during Fever awards $+4\text{s}$.
4. **Daily Challenge**: A unique daily board identical for every player worldwide, derived deterministically from the calendar date (`YYYY-MM-DD`). One attempt per day.
5. **Zen Mode**: Relaxed, untimed board clearing with no countdown timer, no heart loss, and unlimited play.

### Modifiers & Combos
- **Rush Mode**: Enforces a fast-paced $5\text{s}$ combo window. Trigger Fever mode at $5$ consecutive matches instead of the usual $8$.
- **Fever State**: Accelerates score with a $2\times$ multiplier and visual spark effects.

---

## 💣 Special Tiles & Hazards

Certain modes and Adventure stages sprinkle tactical special tiles across the board:

| Special | Effect |
| ------- | ------ |
| **Gold** | Scores **$3\times$ points** for the match. |
| **Ice** | Encased in ice. Takes **two matches** to clear (the first cracks the ice). |
| **Bomb** | Carries a fuse that decrements with each match made. Detonation costs **$15\text{s}$** of clock time. |
| **Chrono** | Grants a **$+8\text{s}$ time surge** and **freezes the countdown clock for $5\text{s}$**. |
| **Gravity** | Board compacts toward edges or center following a clear (8 directional variants: *Fall, Rise, Drift Left, Drift Right, Squeeze In, Split Apart, Squeeze Down, Split Open*). |

---

## ⌨️ Controls & Multi-Device Support

| Action | Player 1 (Left / Solo) | Player 2 (Right) | Mobile / Touch |
| ------ | ---------------------- | ---------------- | -------------- |
| **Move** | `W` `A` `S` `D` | `↑` `←` `↓` `→` | Tap tile |
| **Pick** | `Space` / `F` | `Enter` | Tap tile |
| **Hint** | `Q` | `,` | Tap Hint button |
| **Shuffle** | `E` | `.` | Tap Shuffle button |

### Mobile & Touch Ergonomics
- **Responsive Layout**: On mobile viewports in portrait mode, boards automatically transpose dimensions (e.g. $9 \times 16$ becomes $16 \times 9$) so tiles remain large and legible.
- **Viewport Fitting**: Board dimensions scale dynamically with CSS `min()` clamping, preventing vertical scrolling and keeping HUD controls accessible.

---

## 🌐 Real-Time Multiplayer

### Two Ways to Duel
1. **Local Split-Screen**: Two players on a single keyboard or mouse, side by side.
2. **Online Relay**: Real-time room signaling via WebSocket. Each player sees their own board with live opponent score, pairs cleared, and progress indicators.

### Deploying the Cloudflare Worker Relay
The signaling relay runs on Cloudflare Workers using SQLite-backed Durable Objects (`server/src/room.js`):

```bash
npx wrangler login                 # authenticate with Cloudflare
npm run server:deploy              # deploys relay worker
npm run set-relay https://pikachu-duel-room.<subdomain>.workers.dev
```

### Local Relay Testing
```bash
npm run server:dev                            # starts local relay on 127.0.0.1:8787
npm run smoke:relay                           # runs 13 end-to-end WebSocket checks
npm run bot ROOM01 -- --name "Robo Misty"     # launches autonomous bot opponent
```

---

## 🛠️ Stage Controller & Admin Tools (`/admin`)

Pikachu Duel includes client-side routing via **React Router v7** and an interactive **Stage Controller**:

- **`/admin` Route**: Open the Admin Console to view live configuration recipes for any stage (dimensions, gravity patterns, special hazards, time limits, and 3-star thresholds).
- **Jump to Any Stage**: Set your saved Adventure stage, unlock stages with 3 stars, or jump directly into any stage (e.g. Stage 16) without grinding.
- **Direct Route Permalinks**:
  - `http://localhost:4173/admin`: Full Admin Console & Stage Inspector.
  - `http://localhost:4173/admin/16`: Direct inspector for Stage 16.
  - `http://localhost:4173/?stage=16`: Immediately deals and launches Stage 16.
  - `http://localhost:4173/?admin=true`: Enables the in-game floating stage jumper anywhere.
- **In-Game Floating Stage Bar**: When admin mode is active, a floating toolbar appears anywhere (during gameplay or on menus) allowing you to jump between stages on the fly (`[ - ] [ 16 ] [ + ] [ Jump ⚡ ]`).

---

## 📁 Project Architecture

For an in-depth architectural breakdown, data models, and memory layouts, see [**docs/ARCHITECTURE.md**](docs/ARCHITECTURE.md).

```
src/
├── app/                  # App integration tests, router, and root styles
├── assets/pokemon/       # 48 Pokémon battle sprites (Generations I-III)
├── features/
│   ├── admin/            # Admin console, live stage inspector, and stage jumper
│   ├── duel/             # 2-player duel feature, arena, and online sync
│   ├── leaderboard/      # Global rankings, account auth, and progress sync
│   └── solo/             # Single-player mode picker, HUD, and Adventure ladder
├── game/                 # Core deterministic game engine (TypeScript)
│   ├── board.ts          # Board generation and opening move validation
│   ├── connect.ts        # Pikachu orthogonal pathfinding and reshuffles
│   ├── gravity.ts        # 8-way directional board compaction
│   ├── grid.ts           # Flat Int32Array 1D buffer indexing & padding
│   ├── icons.ts          # Pokémon sprite catalog & icon resolution
│   ├── marks.ts          # Special hazards (Gold, Ice, Bomb, Chrono)
│   ├── modes.ts          # Mode definitions & round builder
│   ├── rng.ts            # Seeded Mulberry32 PRNG & Fisher-Yates shuffle
│   ├── session.ts        # Game loop, selections, and scoring engine
│   └── stages.ts         # Adventure ladder stage configurations
├── net/                  # WebSocket networking client & relay config
│   ├── client.ts         # Resilient client with backoff & progress throttling
│   └── config.ts         # Room codes & invite URL formatting
├── shared/               # Shared components (Board, Tile, Toast) & types
│   ├── components/       # Common UI primitives
│   ├── game/             # Shared presets and progress normalization
│   └── types/            # Central domain models (BoardData, PlayerSession)
server/                   # Cloudflare Worker + Durable Object relay
tests/                    # Node.js engine and room protocol test suites
docs/                     # Engineering documentation and architectural guides
```

---

## 🧪 Testing & Verification

The test suite covers deterministic engine deals, pathfinding edge cases, hazard interactions, UI flows, and relay socket protocols:

```bash
npm test              # runs core engine tests and Vitest UI tests (277 tests total)
npm run test:core     # 170 Node tests via native TypeScript strip-types
npm run test:ui       # 107 Vitest component, hook & router tests
npm run typecheck     # TypeScript strict validation (tsc -b)
npm run lint          # ESLint code quality inspection
npm run build         # Production Vite bundle compilation
npm run smoke:relay   # 13 WebSocket protocol checks against live relay
```

---

## 🔗 Shareable URL Parameters & Routes

Game and room settings can be preconfigured using routes and query parameters:

| Param / Route | Values | Description |
| ------------- | ------ | ----------- |
| `/admin` | route | Open the full Admin Console & Stage Controller |
| `/admin/:stage` | route | Direct permalink to inspect and jump to stage (e.g. `/admin/16`) |
| `stage` | integer | Immediately deal and start Adventure mode at stage $X$ (e.g. `?stage=16`) |
| `admin` | `1`, `true` | Enable the in-game floating stage jumper anywhere |
| `room` | `CODE` | Join an online room by code |
| `name` | string | Auto-fill player display name |
| `p1`, `p2` | string | Names for local split-screen players |
| `difficulty` | `easy`, `normal`, `hard` | Starting grid dimensions |
| `clock` | `0`, `180`, `300`, `480` | Match duration in seconds |
| `seed` | number / string | Deterministic board deal seed |
| `auto` | `1` | Skip setup screen and immediately start |
| `server` | string | Override relay server URL |

---

## 📄 License

MIT © hahuyhungdev
