import { memo } from 'react';
import { iconFor } from '../../../../game/icons.js';

interface TileProps {
  r: number;
  c: number;
  iconId: number;
  isSelected?: boolean;
  isHint?: boolean;
  isCursor?: boolean;
  isShaking?: boolean;
  isClearing?: boolean;
  onClick?: () => void;
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

  return (
    <button
      type="button"
      className="tile"
      data-r={String(r)}
      data-c={String(c)}
      data-selected={isSelected ? 'true' : undefined}
      data-hint={isHint ? 'true' : undefined}
      data-cursor={isCursor ? 'true' : undefined}
      data-shake={isShaking ? 'true' : undefined}
      data-clearing={isClearing ? 'true' : undefined}
      tabIndex={-1}
      aria-label={`${spec.label}, row ${r} column ${c}`}
      onClick={onClick}
    >
      <img className="tile__sprite" src={spec.src} alt="" draggable={false} />
    </button>
  );
});
