/**
 * The solo game surface.
 *
 * One board, one run, and the four panels that wrap it: the mode menu, the
 * stage briefing, the live HUD and the result screen. All of the state lives in
 * `useSolo`; this file only decides what is on screen right now.
 */

import { Board } from '../duel/components/Board';
import { Toast } from '../duel/components/Toast';
import { ModePicker } from './components/ModePicker';
import { RunHud } from './components/RunHud';
import { RunResult } from './components/RunResult';
import { StageIntro } from './components/StageIntro';
import { useSolo } from './hooks/useSolo';

export interface SoloGameProps {
  onOpenDuel: () => void;
}

export function SoloGame({ onOpenDuel }: SoloGameProps) {
  const solo = useSolo();
  const { board, hud, round, summary } = solo;

  const isMenu = solo.phase === 'menu';
  const isResultOpen = solo.phase === 'cleared' || solo.phase === 'failed' || solo.phase === 'over';

  return (
    <div className="shell" data-app data-surface="solo">
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
        onSelect={solo.selectMode}
        onDifficulty={solo.setDifficulty}
        onStart={solo.startRun}
        onOpenDuel={onOpenDuel}
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
        />
      )}

      <Toast message={solo.toast} />
    </div>
  );
}
