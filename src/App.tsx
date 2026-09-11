import { useState } from 'react';
import { DuelGame } from './features/duel';
import { SoloGame } from './features/solo';

type Surface = 'solo' | 'duel';

/**
 * The app has two surfaces: the solo run ladder, which is where a player lands,
 * and the original two-player duel. They share the board but not the rules, so
 * they stay separate features and this shell just picks one.
 */
export default function App() {
  const [surface, setSurface] = useState<Surface>('solo');

  if (surface === 'duel') {
    return (
      <>
        <button
          className="btn btn--surface-back"
          type="button"
          data-action="back-to-solo"
          onClick={() => setSurface('solo')}
        >
          ← Solo modes
        </button>
        <DuelGame />
      </>
    );
  }

  return <SoloGame onOpenDuel={() => setSurface('duel')} />;
}
