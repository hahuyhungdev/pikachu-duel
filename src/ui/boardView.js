/** Renders one player's board and translates input into grid coordinates. */

import { getTile, isEmpty, inBounds } from '../game/board.js';
import { iconFor } from '../game/icons.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const REDUCED = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
export const CLEAR_MS = REDUCED ? 1 : 240;
const TRACE_MS = REDUCED ? 1 : 620;

const key = (r, c) => `${r},${c}`;

export function createBoardView({ mount, session, onPick }) {
  const { board } = session;
  const padRows = board.rows + 2;
  const padCols = board.cols + 2;
  // The border ring is half a cell wide: wide enough to show a path leaving the
  // board, narrow enough not to waste a fifth of the screen.
  const unitW = board.cols + 1;
  const unitH = board.rows + 1;
  const unitX = (c) => (c === 0 ? 0.25 : c <= board.cols ? c : board.cols + 0.75);
  const unitY = (r) => (r === 0 ? 0.25 : r <= board.rows ? r : board.rows + 0.75);

  const wrap = document.createElement('div');
  wrap.className = 'board-wrap';

  const grid = document.createElement('div');
  grid.className = 'board';
  grid.style.setProperty('--rows', String(board.rows));
  grid.style.setProperty('--cols', String(board.cols));
  grid.style.setProperty('--unit-w', String(unitW));
  grid.style.setProperty('--unit-h', String(unitH));
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', `${session.label} board, ${board.rows} by ${board.cols}`);

  const tiles = new Map();

  for (let r = 0; r < padRows; r += 1) {
    for (let c = 0; c < padCols; c += 1) {
      if (!inBounds(board, r, c)) {
        const voidCell = document.createElement('div');
        voidCell.className = 'cell--void';
        voidCell.setAttribute('aria-hidden', 'true');
        grid.append(voidCell);
        continue;
      }
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tile';
      tile.dataset.r = String(r);
      tile.dataset.c = String(c);
      tile.tabIndex = -1;
      const face = document.createElement('span');
      tile.append(face);
      tiles.set(key(r, c), tile);
      grid.append(tile);
    }
  }

  const trace = document.createElementNS(SVG_NS, 'svg');
  trace.setAttribute('class', 'trace');
  trace.setAttribute('viewBox', `0 0 ${unitW} ${unitH}`);
  trace.setAttribute('preserveAspectRatio', 'none');
  trace.setAttribute('aria-hidden', 'true');

  const veil = document.createElement('div');
  veil.className = 'veil';

  wrap.append(grid, trace, veil);
  mount.append(wrap);

  grid.addEventListener('click', (event) => {
    const tile = event.target.closest('.tile');
    if (!tile || tile.dataset.empty === 'true') return;
    onPick(Number(tile.dataset.r), Number(tile.dataset.c));
  });

  let cursor = null;

  function tileAt(point) {
    return tiles.get(key(point.r, point.c)) ?? null;
  }

  function render() {
    for (const [, tile] of tiles) {
      const r = Number(tile.dataset.r);
      const c = Number(tile.dataset.c);
      const icon = getTile(board, r, c);
      const face = tile.firstElementChild;
      if (icon === 0) {
        tile.dataset.empty = 'true';
        tile.removeAttribute('data-selected');
        tile.removeAttribute('data-hint');
        face.textContent = '';
        tile.setAttribute('aria-label', `row ${r} column ${c}, cleared`);
        continue;
      }
      const spec = iconFor(icon);
      delete tile.dataset.empty;
      face.textContent = spec.glyph;
      tile.style.setProperty('--tile-h', String(spec.h));
      tile.setAttribute('aria-label', `${spec.label}, row ${r} column ${c}`);
    }
    paintSelection();
    paintCursor();
  }

  function paintSelection() {
    for (const [, tile] of tiles) tile.removeAttribute('data-selected');
    const tile = session.selected && tileAt(session.selected);
    if (tile) tile.dataset.selected = 'true';
  }

  function clearHint() {
    for (const [, tile] of tiles) tile.removeAttribute('data-hint');
  }

  function showHint(move) {
    clearHint();
    for (const point of [move.a, move.b]) {
      const tile = tileAt(point);
      if (tile) tile.dataset.hint = 'true';
    }
  }

  function paintCursor() {
    for (const [, tile] of tiles) tile.removeAttribute('data-cursor');
    if (!cursor) return;
    const tile = tileAt(cursor);
    if (tile) tile.dataset.cursor = 'true';
  }

  function firstTile() {
    for (let r = 1; r <= board.rows; r += 1) {
      for (let c = 1; c <= board.cols; c += 1) {
        if (!isEmpty(board, r, c)) return { r, c };
      }
    }
    return null;
  }

  /** Step in a direction, skipping cleared cells so keyboard play stays quick. */
  function moveCursor(dr, dc) {
    if (!cursor) cursor = firstTile();
    if (!cursor) return null;
    let { r, c } = cursor;
    for (let step = 0; step < Math.max(board.rows, board.cols) + 1; step += 1) {
      r += dr;
      c += dc;
      if (!inBounds(board, r, c)) break;
      if (!isEmpty(board, r, c)) {
        cursor = { r, c };
        paintCursor();
        return cursor;
      }
    }
    paintCursor();
    return cursor;
  }

  function cursorAt() {
    if (!cursor) cursor = firstTile();
    paintCursor();
    return cursor;
  }

  function focusCursor(point) {
    cursor = point;
    paintCursor();
  }

  function showTrace(path) {
    const d = path.map((p, i) => `${i === 0 ? 'M' : 'L'} ${unitX(p.c)} ${unitY(p.r)}`).join(' ');
    const line = document.createElementNS(SVG_NS, 'path');
    line.setAttribute('d', d);
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    trace.append(line);
    setTimeout(() => line.remove(), TRACE_MS);
  }

  function showFloater(point, text) {
    const floater = document.createElement('span');
    floater.className = 'floater';
    floater.textContent = text;
    floater.style.left = `${(unitX(point.c) / unitW) * 100}%`;
    floater.style.top = `${(unitY(point.r) / unitH) * 100}%`;
    wrap.append(floater);
    setTimeout(() => floater.remove(), TRACE_MS);
  }

  function playMatch(result) {
    showTrace(result.path);
    for (const point of result.cleared) {
      const tile = tileAt(point);
      if (tile) tile.dataset.clearing = 'true';
    }
    const mid = result.cleared[0];
    showFloater(mid, `+${result.gained}`);
    clearHint();
    setTimeout(() => {
      for (const point of result.cleared) {
        const tile = tileAt(point);
        if (tile) delete tile.dataset.clearing;
      }
      render();
    }, CLEAR_MS);
    paintSelection();
  }

  function shake(points) {
    for (const point of points) {
      const tile = tileAt(point);
      if (!tile) continue;
      tile.dataset.shake = 'true';
      setTimeout(() => delete tile.dataset.shake, 300);
    }
  }

  /** Text only — player names are user input and must never be parsed as HTML. */
  function setVeil(headline, detail = '') {
    veil.replaceChildren();
    if (!headline) return;
    const box = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = headline;
    box.append(strong);
    if (detail) {
      const p = document.createElement('p');
      p.textContent = detail;
      box.append(p);
    }
    veil.append(box);
  }

  render();

  return {
    element: wrap,
    render,
    paintSelection,
    playMatch,
    shake,
    showHint,
    clearHint,
    moveCursor,
    cursorAt,
    focusCursor,
    setVeil,
  };
}
