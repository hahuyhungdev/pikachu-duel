import { memo, type CSSProperties } from 'react';
import { iconFor } from '../../../../game/icons.js';

/** The special-tile treatments a board can ask for. */
export type TileMarkKind = 'gold' | 'ice' | 'bomb';

interface TileProps {
  r: number;
  c: number;
  iconId: number;
  isSelected?: boolean;
  isHint?: boolean;
  isCursor?: boolean;
  isShaking?: boolean;
  isClearing?: boolean;
  isCracking?: boolean;
  mark?: TileMarkKind | null;
  /** Remaining moves on a bomb; only meaningful when `mark` is 'bomb'. */
  fuse?: number;
  /** How far this tile just travelled under gravity, in cells. */
  slide?: { dr: number; dc: number } | null;
  onClick?: () => void;
}

/** A bomb this close to going off has to be impossible to miss. */
const FUSE_CRITICAL = 3;

function markLabel(mark: TileMarkKind, fuse: number): string {
  if (mark === 'gold') return 'golden, triple score';
  if (mark === 'ice') return 'iced, needs two matches';
  return `bomb, ${fuse} ${fuse === 1 ? 'move' : 'moves'} left`;
}

export const Tile = memo(function Tile({
  r,
  c,
  iconId,
  isSelected,
  isHint,
  isCursor,
  isShaking,
  isClearing,
  isCracking,
  mark = null,
  fuse = 0,
  slide = null,
  onClick,
}: TileProps) {
  const isEmpty = iconId === 0;

  if (isEmpty) {
    return (
      <button
        type="button"
        className="tile"
        data-r={String(r)}
        data-c={String(c)}
        data-empty="true"
        tabIndex={-1}
        aria-label={`row ${r} column ${c}, cleared`}
      >
        <img className="tile__sprite" alt="" draggable={false} />
      </button>
    );
  }

  const spec = iconFor(iconId);
  const style: CSSProperties | undefined = slide
    ? ({ ['--fall-dr' as string]: String(slide.dr), ['--fall-dc' as string]: String(slide.dc) } as CSSProperties)
    : undefined;

  // The mark is gameplay information, not decoration, so it goes in the label
  // rather than being left to colour alone.
  const label = mark ? `${spec.label}, ${markLabel(mark, fuse)}, row ${r} column ${c}` : `${spec.label}, row ${r} column ${c}`;

  return (
    <button
      type="button"
      className="tile"
      style={style}
      data-r={String(r)}
      data-c={String(c)}
      data-selected={isSelected ? 'true' : undefined}
      data-hint={isHint ? 'true' : undefined}
      data-cursor={isCursor ? 'true' : undefined}
      data-shake={isShaking ? 'true' : undefined}
      data-clearing={isClearing ? 'true' : undefined}
      data-cracking={isCracking ? 'true' : undefined}
      data-mark={mark ?? undefined}
      data-falling={slide ? 'true' : undefined}
      data-fuse-critical={mark === 'bomb' && fuse <= FUSE_CRITICAL ? 'true' : undefined}
      tabIndex={-1}
      aria-label={label}
      onClick={onClick}
    >
      <img className="tile__sprite" src={spec.src} alt="" draggable={false} />
      {mark === 'bomb' && <span className="tile__fuse" aria-hidden="true">{fuse}</span>}
    </button>
  );
});
