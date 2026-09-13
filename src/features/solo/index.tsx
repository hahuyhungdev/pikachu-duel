/**
 * The solo game surface.
 *
 * One board, one run, and the four panels that wrap it: the mode menu, the
 * stage briefing, the live HUD and the result screen. All of the state lives in
 * `useSolo`; this file only decides what is on screen right now.
 */

import { useState } from 'react';
import { Board } from '../../shared/components/Board';
import { Toast } from '../../shared/components/Toast';
import { ModePicker } from './components/ModePicker';
import { RunHud } from './components/RunHud';
import { RunResult } from './components/RunResult';
import { StageIntro } from './components/StageIntro';
import { useSolo } from './hooks/useSolo';
import { useAuth, useAccountProgress, AuthModal, LeaderboardModal } from '../leaderboard';

export interface SoloGameProps {
  onOpenDuel: () => void;
}

export function SoloGame({ onOpenDuel }: SoloGameProps) {
  const auth = useAuth();
  const progress = useAccountProgress(auth.user);
  return <SoloSurface key={auth.user?.id ?? 'guest'} onOpenDuel={onOpenDuel} auth={auth} progress={progress} />;
}

function SoloSurface({ onOpenDuel, auth, progress }: SoloGameProps & {
  auth: ReturnType<typeof useAuth>;
  progress: ReturnType<typeof useAccountProgress>;
}) {
  const { user, login, register, logout } = auth;
  const solo = useSolo(user?.id, progress.profile);
  const { board, hud, round, summary } = solo;

  const [authOpen, setAuthOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  const isMenu = solo.phase === 'menu';
  const isResultOpen = solo.phase === 'cleared' || solo.phase === 'failed' || solo.phase === 'over';

  return (
    <div className="shell" data-app data-surface="solo" data-in-game={!isMenu ? 'true' : undefined}>
      {hud && (
        <RunHud
          hud={hud}
          isMuted={solo.soundMuted}
          canHint={solo.phase === 'playing' && hud.hintsLeft > 0}
          canShuffle={solo.phase === 'playing' && hud.shufflesLeft > 0}
          onHint={solo.hint}
          onShuffle={solo.shuffle}
          onToggleSound={solo.toggleSound}
          onQuit={solo.changeMode}
        />
      )}

      <main className="arena" data-arena data-mode="solo" data-fever={hud?.fever ? 'true' : undefined}>
        {board && round && (
          <section className="cabinet" data-cabinet data-player="1">
            <div data-board-mount>
              <Board
                board={board.session.board}
                label={round.label}
                selected={board.session.selected}
                hint={board.session.hint}
                cursor={null}
                clearingTiles={board.clearingTiles}
                shakingTiles={board.shakingTiles}
                crackingTiles={board.crackingTiles}
                marks={board.marks}
                slides={board.slides}
                traces={board.traces}
                floaters={board.floaters}
                veil={null}
                onPick={solo.pick}
              />
            </div>
          </section>
        )}
      </main>

      <ModePicker
        isOpen={isMenu}
        modes={solo.modeCards}
        selected={solo.mode}
        difficulty={solo.difficulty}
        showDifficulty={solo.showDifficulty}
        profile={solo.profileSummary}
        user={user}
        syncStatus={progress.status}
        onRetrySync={progress.retry}
        onSelect={solo.selectMode}
        onDifficulty={solo.setDifficulty}
        onStart={solo.startRun}
        onOpenDuel={onOpenDuel}
        onOpenAuth={() => setAuthOpen(true)}
        onOpenLeaderboard={() => setLeaderboardOpen(true)}
      />

      {solo.stageIntro && (
        <StageIntro
          isOpen={solo.introOpen}
          stage={solo.stageIntro.stage}
          note={solo.stageIntro.note}
          objective={solo.stageIntro.objective}
          fresh={solo.stageIntro.fresh}
          onStart={solo.beginStage}
        />
      )}

      {summary && (
        <RunResult
          isOpen={isResultOpen}
          phase={solo.phase}
          summary={summary}
          canContinue={solo.canContinue}
          continueLabel={solo.continueLabel}
          onContinue={solo.continueRun}
          onRetryRun={solo.retryRun}
          onChangeMode={solo.changeMode}
          onOpenLeaderboard={() => setLeaderboardOpen(true)}
        />
      )}

      <AuthModal
        isOpen={authOpen}
        user={user}
        onClose={() => setAuthOpen(false)}
        onLogin={login}
        onRegister={register}
        onLogout={logout}
        syncStatus={progress.status}
        onRetrySync={progress.retry}
      />

      <LeaderboardModal
        isOpen={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        defaultMode={solo.mode}
      />

      <Toast message={solo.toast} />
    </div>
  );
}
