import { useState, lazy, Suspense } from 'react';
import { SoloGame } from './features/solo';

const DuelGame = lazy(() => import('./features/duel').then((m) => ({ default: m.DuelGame })));

type Surface = 'solo' | 'duel';

/**
 * The app has two surfaces: the solo run ladder, which is where a player lands,
 * and the original two-player duel. They share the board but not the rules, so
 * they stay separate features and this shell lazily loads the multiplayer duel.
 */
export default function App() {
  const [surface, setSurface] = useState<Surface>('solo');

  if (surface === 'duel') {
    return (
      <Suspense fallback={<div className="loading-shell" role="status">Loading Duel…</div>}>
        <button
          className="btn btn--surface-back"
          type="button"
          data-action="back-to-solo"
          onClick={() => setSurface('solo')}
        >
          ← Solo modes
        </button>
        <DuelGame />
      </Suspense>
    );
  }

  return <SoloGame onOpenDuel={() => setSurface('duel')} />;
}
