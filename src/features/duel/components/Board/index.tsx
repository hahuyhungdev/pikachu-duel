import { useMemo, type CSSProperties } from 'react';
import { getTile, inBounds } from '../../../../game/board.js';
import type { BoardData, Floater, Point, TracePath, VeilInfo } from '../../types/duel.types';
import { Tile } from '../Tile';

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
  onPick,
}: BoardProps) {
  const padRows = board.rows + 2;
  const padCols = board.cols + 2;
  const unitW = board.cols + 1;
  const unitH = board.rows + 1;

  const unitX = (c: number) => (c === 0 ? 0.25 : c <= board.cols ? c : board.cols + 0.75);
  const unitY = (r: number) => (r === 0 ? 0.25 : r <= board.rows ? r : board.rows + 0.75);

  const clearingSet = useMemo(() => new Set(clearingTiles), [clearingTiles]);
  const shakingSet = useMemo(() => new Set(shakingTiles), [shakingTiles]);

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

  const boardStyle: CSSProperties = {
    ['--rows' as string]: String(board.rows),
    ['--cols' as string]: String(board.cols),
    ['--unit-w' as string]: String(unitW),
    ['--unit-h' as string]: String(unitH),
    ['--board-min' as string]: `${unitW * 44}px`,
  };

  return (
    <div className="board-wrap">
      <div
        className="board"
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
  );
}
