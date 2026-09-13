import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { getTile, inBounds } from '../../../game/board.js';
import type { BoardData, Floater, Point, TracePath, VeilInfo } from '../../types/board.types';
import { Tile, type TileMarkKind } from '../Tile';
import styles from './Board.module.scss';

/** Mark ids as `src/game/marks.js` stores them, mapped to what the Tile renders. */
const MARK_KINDS: Record<number, TileMarkKind> = { 1: 'gold', 2: 'ice', 3: 'bomb', 4: 'chrono' };

export interface BoardMark {
  r: number;
  c: number;
  mark: number;
  fuse: number;
}

export interface BoardSlide {
  key: string;
  dr: number;
  dc: number;
}

interface BoardProps {
  board: BoardData;
  label: string;
  selected: Point | null;
  hint: { a: Point; b: Point } | null;
  cursor: Point | null;
  clearingTiles: string[];
  shakingTiles: string[];
  traces: TracePath[];
  floaters: Floater[];
  veil: VeilInfo | null;
  /** Special tiles currently on the board. Empty for a plain duel board. */
  marks?: BoardMark[];
  /** Tiles that just travelled under gravity, so they can slide into place. */
  slides?: BoardSlide[];
  crackingTiles?: string[];
  onPick: (r: number, c: number) => void;
}

export function Board({
  board,
  label,
  selected,
  hint,
  cursor,
  clearingTiles,
  shakingTiles,
  traces,
  floaters,
  veil,
  marks = [],
  slides = [],
  crackingTiles = [],
  onPick,
}: BoardProps) {
  const [overview, setOverview] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 680 && window.innerHeight > window.innerWidth;
  });
  const padRows = board.rows + 2;
  const padCols = board.cols + 2;
  const unitW = board.cols + 1;
  const unitH = board.rows + 1;

  const unitX = (c: number) => (c === 0 ? 0.25 : c <= board.cols ? c : board.cols + 0.75);
  const unitY = (r: number) => (r === 0 ? 0.25 : r <= board.rows ? r : board.rows + 0.75);

  const clearingSet = useMemo(() => new Set(clearingTiles), [clearingTiles]);
  const shakingSet = useMemo(() => new Set(shakingTiles), [shakingTiles]);
  const crackingSet = useMemo(() => new Set(crackingTiles), [crackingTiles]);
  const markMap = useMemo(
    () => new Map(marks.map((m) => [`${m.r},${m.c}`, m])),
    [marks],
  );
  const slideMap = useMemo(() => new Map(slides.map((s) => [s.key, s])), [slides]);

  const cells: Array<{ r: number; c: number; isVoid: boolean; iconId: number }> = [];
  for (let r = 0; r < padRows; r += 1) {
    for (let c = 0; c < padCols; c += 1) {
      if (!inBounds(board, r, c)) {
        cells.push({ r, c, isVoid: true, iconId: 0 });
      } else {
        cells.push({ r, c, isVoid: false, iconId: getTile(board, r, c) });
      }
    }
  }

  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const boardStyle: CSSProperties = {
    ['--rows' as string]: String(board.rows),
    ['--cols' as string]: String(board.cols),
    ['--unit-w' as string]: String(unitW),
    ['--unit-h' as string]: String(unitH),
    ['--board-min' as string]: `${unitW * 46}px`,
    ['--zoom' as string]: String(zoom),
    ['--zoom-scale' as string]: String(zoom),
  };

  const zoomIn = () => {
    setZoom((z) => Math.min(1.5, Number((z + 0.1).toFixed(1))));
  };
  const zoomOut = () => {
    setZoom((z) => Math.max(0.7, Number((z - 0.1).toFixed(1))));
  };
  const zoomReset = () => {
    setZoom(1);
  };
  const toggleOverview = () => {
    if (!overview) setZoom(1);
    setOverview(!overview);
  };

  return (
    <div className={`${styles.stage} board-stage`} data-overview={overview} style={boardStyle}>
      <div className={`${styles.controls} board-controls`}>
        <div className={`${styles.zoomControls} zoom-controls`} role="group" aria-label="Zoom controls">
          <button type="button" className={`${styles.zoomBtn} zoom-btn`} aria-label="Zoom out" onClick={zoomOut} disabled={zoom <= 0.7}>−</button>
          <button type="button" className={`${styles.zoomBtn} ${styles.zoomVal} zoom-btn zoom-val`} aria-label="Reset zoom" onClick={zoomReset}>{Math.round(zoom * 100)}%</button>
          <button type="button" className={`${styles.zoomBtn} zoom-btn`} aria-label="Zoom in" onClick={zoomIn} disabled={zoom >= 1.5}>+</button>
          <button
            type="button"
            className={`${styles.zoomBtn} zoom-btn`}
            aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
            title={isFullscreen ? 'Thoát toàn màn hình' : 'Mở rộng toàn màn hình'}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? '✕' : '⛶'}
          </button>
        </div>
        <button type="button" className={`${styles.boardToggle} btn btn--sm board-toggle`} aria-pressed={!overview} onClick={toggleOverview}>
          {overview ? 'Larger tiles' : 'Whole board'}
        </button>
      </div>
      <div className={`${styles.viewport} board-viewport`} tabIndex={0} role="region" aria-label={`${label} scrollable playfield`}>
      <div className={`${styles.wrap} board-wrap`}>
      <div
        className={`${styles.board} board`}
        style={boardStyle}
        role="grid"
        aria-label={`${label} board, ${board.rows} by ${board.cols}`}
      >
        {cells.map(({ r, c, isVoid, iconId }) => {
          const key = `${r},${c}`;
          if (isVoid) {
            return <div key={key} className="cell--void" aria-hidden="true" />;
          }

          const isSelected = selected ? selected.r === r && selected.c === c : false;
          const isHint = hint
            ? (hint.a.r === r && hint.a.c === c) || (hint.b.r === r && hint.b.c === c)
            : false;
          const isCursor = cursor ? cursor.r === r && cursor.c === c : false;
          const isShaking = shakingSet.has(key);
          const isClearing = clearingSet.has(key);
          const marked = markMap.get(key);
          const slide = slideMap.get(key);

          return (
            <Tile
              key={key}
              r={r}
              c={c}
              iconId={iconId}
              isSelected={isSelected}
              isHint={isHint}
              isCursor={isCursor}
              isShaking={isShaking}
              isClearing={isClearing}
              isCracking={crackingSet.has(key)}
              mark={marked ? (MARK_KINDS[marked.mark] ?? null) : null}
              fuse={marked?.fuse ?? 0}
              slide={slide ? { dr: slide.dr, dc: slide.dc } : null}
              onClick={() => onPick(r, c)}
            />
          );
        })}
      </div>

      <svg
        className="trace"
        viewBox={`0 0 ${unitW} ${unitH}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {traces.map((t) => (
          <path key={t.id} d={t.d} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>

      {floaters.map((f) => (
        <span
          key={f.id}
          className="floater"
          style={{
            left: `${(unitX(f.point.c) / unitW) * 100}%`,
            top: `${(unitY(f.point.r) / unitH) * 100}%`,
          }}
        >
          {f.text}
        </span>
      ))}

      {veil && (
        <div className="veil">
          <div>
            <strong>{veil.headline}</strong>
            {veil.detail && <p>{veil.detail}</p>}
          </div>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
