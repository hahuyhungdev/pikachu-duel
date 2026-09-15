import { lazy, Suspense, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SoloGame } from './features/solo';
import { AdminPage } from './features/admin';
import { resolveRouterBasename, restoreGitHubPagesRoute } from './app/githubPagesRouter';

const DuelGame = lazy(() => import('./features/duel').then((m) => ({ default: m.DuelGame })));

function SoloRoute() {
  const navigate = useNavigate();
  const params = useParams<{ stage?: string }>();
  const [searchParams] = useSearchParams();

  const stageFromParam = params.stage ? parseInt(params.stage, 10) : NaN;
  const stageFromQuery = searchParams.get('stage') ? parseInt(searchParams.get('stage')!, 10) : NaN;
  const initialStage =
    !Number.isNaN(stageFromParam) && stageFromParam >= 1
      ? stageFromParam
      : !Number.isNaN(stageFromQuery) && stageFromQuery >= 1
      ? stageFromQuery
      : undefined;

  const handleStageChange = useCallback(
    (stage: number | null) => {
      if (typeof window === 'undefined') return;
      const currentPath = window.location.pathname;
      const search = window.location.search;

      if (stage !== null) {
        const isAdventureRoute = currentPath.startsWith('/adventure');
        const targetPath = isAdventureRoute ? `/adventure/${stage}` : `/stage/${stage}`;
        if (currentPath !== targetPath) {
          navigate(`${targetPath}${search}`, { replace: true });
        }
      } else {
        if (currentPath !== '/') {
          navigate(`/${search}`, { replace: true });
        }
      }
    },
    [navigate],
  );

  return (
    <SoloGame
      onOpenDuel={() => navigate('/duel')}
      onOpenAdmin={() => navigate('/admin')}
      initialStage={initialStage}
      onStageChange={handleStageChange}
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
      <Route path="/stage/:stage" element={<SoloRoute />} />
      <Route path="/adventure" element={<SoloRoute />} />
      <Route path="/adventure/:stage" element={<SoloRoute />} />
      <Route path="/duel" element={<DuelRoute />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin/:stage" element={<AdminPage />} />
      <Route path="*" element={<SoloRoute />} />
    </Routes>
  );
}

export default function App() {
  restoreGitHubPagesRoute();

  return (
    <BrowserRouter basename={resolveRouterBasename()}>
      <AppRoutes />
    </BrowserRouter>
  );
}
