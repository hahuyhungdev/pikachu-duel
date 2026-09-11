import type { DuelMode, PlayerState } from '../../types/duel.types';
import { Cabinet } from '../Cabinet';

interface ArenaProps {
  mode: DuelMode;
  players: PlayerState[];
  onPick: (playerIndex: number, r: number, c: number) => void;
  onHint: (playerIndex: number) => void;
  onShuffle: (playerIndex: number) => void;
}

export function Arena({ mode, players, onPick, onHint, onShuffle }: ArenaProps) {
  const isSolo = mode === 'solo';
  const player1 = players[0];
  const player2 = players[1];

  return (
    <main className="arena" data-arena data-mode={mode}>
      {player1 && (
        <Cabinet
          player={player1}
          opponent={player2}
          mode={mode}
          onPick={(r, c) => onPick(0, r, c)}
          onHint={() => onHint(0)}
          onShuffle={() => onShuffle(0)}
        />
      )}
      {player2 ? (
        <Cabinet
          player={player2}
          opponent={player1}
          mode={mode}
          hidden={isSolo}
          onPick={(r, c) => onPick(1, r, c)}
          onHint={() => onHint(1)}
          onShuffle={() => onShuffle(1)}
        />
      ) : (
        <div data-cabinet data-player="2" hidden />
      )}
    </main>
  );
}
