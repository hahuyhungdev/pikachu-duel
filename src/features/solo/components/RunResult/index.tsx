/**
 * The screen between one attempt and the next.
 *
 * This is the only moment a solo player decides whether to press again or close
 * the tab, so it never says the same thing for a win and a loss, and it always
 * ends on a number worth chasing: a record just broken, or the exact gap that
 * was missed. The continue button is the loudest thing on screen and takes
 * focus, so Enter alone restarts the run.
 */

import type { CSSProperties } from 'react';
import type { RunSummary, RunPhase, GameMode } from '../../types/solo.types';
import styles from './RunResult.module.scss';

interface RunResultProps {
  isOpen: boolean;
  phase: RunPhase;
  summary: RunSummary;
  canContinue: boolean;
  continueLabel: string;
  onContinue: () => void;
  onRetryRun: () => void;
  onChangeMode: () => void;
  onOpenLeaderboard?: () => void;
}

const STAR_SLOTS = [0, 1, 2];

/** Stars are a per-stage rating, so they only mean something where stages are graded. */
const STARRED_MODES = new Set<GameMode>(['adventure', 'daily']);
const LADDER_MODES = new Set<GameMode>(['adventure']);

function num(value: number): string {
  return value.toLocaleString('en-US');
}

function lives(count: number): string {
  return count === 1 ? '1 life' : `${count} lives`;
}

function headlineFor(phase: RunPhase, summary: RunSummary, isLadder: boolean): string {
  if (phase === 'cleared') return isLadder ? `Stage ${summary.stage} cleared!` : 'Board cleared!';
  if (phase === 'failed') return 'So close!';
  if (summary.records.score) return 'Best run yet!';
  return 'Run over';
}

function ledeFor(phase: RunPhase, summary: RunSummary, isLadder: boolean): string {
  if (phase === 'cleared') {
    const timeText = summary.timeBonus && summary.timeBonus > 0 ? ` (+${num(summary.timeBonus)} speed bonus)` : '';
    return `+${num(summary.stageScore)} this stage${timeText} · ${num(summary.pairs)} pairs.`;
  }
  if (phase === 'failed') {
    return `${lives(summary.heartsLeft)} left. Same stage, one more go.`;
  }
  if (isLadder) {
    return `${summary.modeLabel} · reached stage ${num(summary.stage)} · ${num(summary.runScore)} points.`;
  }
  return `${summary.modeLabel} · ${num(summary.runScore)} points.`;
}

/** old → new, the shape the result CSS expects for every beaten record. */
function RecordRow({ kind, label, from, to }: RecordRowProps) {
  return (
    <div className="result__record" data-record={kind}>
      <p className="result__best">New best {label}</p>
      <p className="result__compare">
        <del>{from}</del>
        <i>→</i>
        <ins>{to}</ins>
      </p>
    </div>
  );
}

interface RecordRowProps {
  kind: string;
  label: string;
  from: string;
  to: string;
}

export function RunResult({
  isOpen,
  phase,
  summary,
  canContinue,
  continueLabel,
  onContinue,
  onRetryRun,
  onChangeMode,
  onOpenLeaderboard,
}: RunResultProps) {
  const isLadder = LADDER_MODES.has(summary.mode);
  const showStars = STARRED_MODES.has(summary.mode);
  const { records, previousBest } = summary;
  const anyRecord = records.score || records.stage || records.streak;
  const scoreGap = previousBest.score - summary.runScore;

  return (
    <div className={`${styles.overlay} overlay`} data-overlay="run-result" hidden={!isOpen}>
      <div className={`${styles.panel} panel panel--run-result`} data-phase={phase}>
        <p className="panel__eyebrow">{summary.modeLabel}</p>
        <p className="result__banner" data-result-banner>
          {headlineFor(phase, summary, isLadder)}
        </p>
        <p className="panel__lede">{ledeFor(phase, summary, isLadder)}</p>

        {showStars ? (
          <ul className={`${styles.stars} stars`} aria-label={`${summary.stars} of 3 stars`}>
            {STAR_SLOTS.map((index) => (
              <li
                key={index}
                className="star"
                data-earned={index < summary.stars ? 'true' : undefined}
                style={{ '--star-index': index } as CSSProperties}
              />
            ))}
          </ul>
        ) : null}

        {((phase === 'cleared' && ((summary.timeBonus && summary.timeBonus > 0) || summary.recoveredHeart || summary.recoveredAids)) || summary.globalRank) ? (
          <div className={`${styles.speedStrip} result__time-rewards`} data-reward-strip>
            {summary.globalRank ? (
              <div className={`${styles.rankBadge} time-reward time-reward--rank`}>
                <span className="time-reward__badge">🏆 Hạng #{summary.globalRank} Toàn Cầu</span>
                <span className="time-reward__desc">Điểm số đã được đồng bộ lên Bảng Xếp Hạng!</span>
              </div>
            ) : null}
            {summary.timeBonus && summary.timeBonus > 0 ? (
              <div className="time-reward time-reward--bonus">
                <span className="time-reward__label">⏱ Speed Bonus (+50/s)</span>
                <b className="time-reward__val">+{num(summary.timeBonus)} pts ({summary.timeLeft}s left)</b>
              </div>
            ) : null}
            {summary.recoveredHeart ? (
              <div className="time-reward time-reward--heart">
                <span className="time-reward__badge">❤️ Fast Clear (≥45s)</span>
                <span className="time-reward__desc">+1 Life Restored!</span>
              </div>
            ) : null}
            {summary.recoveredAids ? (
              <div className="time-reward time-reward--aids">
                <span className="time-reward__badge">✨ Speed Milestone (≥30s)</span>
                <span className="time-reward__desc">+1 Hint &amp; Shuffle Bonus!</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="result__records">
          {records.score ? (
            <RecordRow
              kind="score"
              label="score"
              from={num(previousBest.score)}
              to={num(summary.runScore)}
            />
          ) : null}
          {records.stage ? (
            <RecordRow
              kind="stage"
              label="stage"
              from={num(previousBest.stage)}
              to={num(summary.stage)}
            />
          ) : null}
          {records.streak ? (
            <RecordRow
              kind="streak"
              label="streak"
              from={`×${num(previousBest.streak)}`}
              to={`×${num(summary.bestStreak)}`}
            />
          ) : null}

          {/* No record: the near miss is the strongest reason to press again. */}
          {!anyRecord && scoreGap > 0 ? (
            <p className="result__compare" data-miss="true">
              <ins>{num(scoreGap)}</ins>
              <i>short of your best ({num(previousBest.score)})</i>
            </p>
          ) : null}
          {!anyRecord && scoreGap <= 0 && previousBest.score === 0 ? (
            <p className="result__compare" data-miss="true">
              <i>First run banked. Everything from here is a record.</i>
            </p>
          ) : null}
          {!anyRecord && scoreGap <= 0 && previousBest.score > 0 ? (
            <p className="result__compare" data-miss="true">
              <i>Matched your best of {num(previousBest.score)}.</i>
            </p>
          ) : null}
        </div>

        <dl className="result__stats">
          <dt>Run score</dt>
          <dd>{num(summary.runScore)}</dd>
          {summary.timeBonus && summary.timeBonus > 0 ? (
            <>
              <dt>Speed bonus</dt>
              <dd>+{num(summary.timeBonus)}</dd>
            </>
          ) : null}
          {isLadder ? (
            <>
              <dt>Stage reached</dt>
              <dd>{num(summary.stage)}</dd>
            </>
          ) : null}
          <dt>Pairs cleared</dt>
          <dd>{num(summary.pairs)}</dd>
          <dt>Best streak</dt>
          <dd>×{num(summary.bestStreak)}</dd>
          {isLadder ? (
            <>
              <dt>Lives left</dt>
              <dd>{num(summary.heartsLeft)}</dd>
            </>
          ) : null}
        </dl>

        {summary.newUnlocks.length > 0 ? (
          <ul className="unlocks" aria-label="New unlocks">
            {summary.newUnlocks.map((unlock) => (
              <li key={unlock.id} className="unlock-toast">
                <b className="unlock-toast__label">{unlock.label}</b>
                <span className="unlock-toast__detail">{unlock.detail}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className={`${styles.actions} panel__actions`}>
          {canContinue ? (
            // The key remounts the button each time the overlay opens, which is
            // what makes autoFocus fire on a panel that is only hidden, not torn down.
            <button
              key={isOpen ? 'continue-open' : 'continue-closed'}
              className="btn btn--retry"
              type="button"
              data-action="continue"
              autoFocus={isOpen}
              onClick={onContinue}
            >
              {continueLabel}
            </button>
          ) : null}
          {onOpenLeaderboard ? (
            <button
              className="btn btn--leaderboard-open"
              type="button"
              data-action="open-leaderboard"
              onClick={onOpenLeaderboard}
            >
              🏆 Bảng Xếp Hạng
            </button>
          ) : null}
          <button className="btn" type="button" data-action="retry-run" onClick={onRetryRun}>
            {isLadder && phase === 'over' ? 'Start from Stage 1' : 'New run'}
          </button>
          <button className="btn" type="button" data-action="change-mode" onClick={onChangeMode}>
            Change mode
          </button>
        </div>
      </div>
    </div>
  );
}
