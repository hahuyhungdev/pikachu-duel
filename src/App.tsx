import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useSearchParams } from 'react-router-dom';
import { SoloGame } from './features/solo';
import { AdminPage } from './features/admin';

const DuelGame = lazy(() => import('./features/duel').then((m) => ({ default: m.DuelGame })));

function SoloRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stageParam = searchParams.get('stage');
  const initialStage = stageParam ? parseInt(stageParam, 10) : undefined;

  return (
    <SoloGame
      onOpenDuel={() => navigate('/duel')}
      onOpenAdmin={() => navigate('/admin')}
      initialStage={initialStage}
    />
  );
}

function DuelRoute() {
  const navigate = useNavigate();
  return (
    <Suspense fallback={<div className="loading-shell" role="status">Loading Duel…</div>}>
      <button
        className="btn btn--surface-back"
        type="button"
        data-action="back-to-solo"
        onClick={() => navigate('/')}
      >
        ← Solo modes
      </button>
      <DuelGame />
    </Suspense>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SoloRoute />} />
      <Route path="/duel" element={<DuelRoute />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin/:stage" element={<AdminPage />} />
      <Route path="*" element={<SoloRoute />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
