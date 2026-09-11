/**
 * The head-up display for a solo run.
 *
 * Everything here has to be readable in the two seconds between matches on a
 * phone, so each readout answers one question: how long have I got, how many
 * tries are left, is my multiplier climbing, and how close is the board to
 * empty. Fields that do not apply to a mode are not rendered at all — a frozen
 * clock in Zen or an empty heart rail in Time Attack reads as a bug, not as
 * information.
 */

import type { CSSProperties } from 'react';
import { clockText } from '../../../../shared/utils/format';
import type { SoloHud } from '../../types/solo.types';

interface RunHudProps {
  hud: SoloHud;
  isMuted: boolean;
  canHint: boolean;
  canShuffle: boolean;
  onHint: () => void;
  onShuffle: () => void;
  onToggleSound: () => void;
  onQuit: () => void;
}

/** Only Adventure climbs numbered stages; elsewhere "Stage 1" is noise. */
const LADDER_MODES = new Set(['adventure']);

/** The word escalates with the tier so "bigger is better" reads without a legend. */
function comboWord(tier: number, fever: boolean): string {
  if (fever || tier >= 3) return 'Fever';
  if (tier === 2) return 'Hot';
  return 'Combo';
}

export function RunHud({
  hud,
  isMuted,
  canHint,
  canShuffle,
  onHint,
  onShuffle,
  onToggleSound,
  onQuit,
}: RunHudProps) {
  const isLadder = LADDER_MODES.has(hud.mode);
  const stageName = isLadder ? `Stage ${hud.stage}` : hud.modeLabel;
  const hasStreak = hud.streak > 0;
  const chasingBest = hud.bestScore > 0;
  const beatingBest = chasingBest && hud.runScore > hud.bestScore;

  // Custom properties are not part of CSSProperties, so the cast is the only
  // way to hand the meter its fill without reaching for `any`.
  const comboStyle = {
    '--combo-progress': Math.min(1, Math.max(0, hud.comboProgress)),
  } as CSSProperties;

  return (
    <header className="run-hud" data-mode={hud.mode}>
      <div className="run-hud__status">
        <span className="stage-chip" data-mode={hud.mode}>
          <b className="stage-chip__name">{stageName}</b>
          {hud.stageNote ? <span className="stage-chip__note">{hud.stageNote}</span> : null}
        </span>

        {hud.hearts > 0 ? (
          <ul className="hearts" aria-label={`${hud.heartsLeft} of ${hud.hearts} lives left`}>
            {Array.from({ length: hud.hearts }, (_, index) => (
              <li
                key={index}
                className="heart"
                data-spent={index < hud.heartsLeft ? undefined : 'true'}
              />
            ))}
          </ul>
        ) : null}

        {hud.timed ? (
          <output
            className="clock"
            data-clock
            data-urgent={hud.isUrgent ? 'true' : 'false'}
            data-critical={hud.isCritical ? 'true' : 'false'}
            aria-label="Time left"
          >
            {clockText(hud.timeLeft)}
          </output>
        ) : null}
      </div>

      {hud.objective ? <p className="objective">{hud.objective}</p> : null}

      <div className="run-hud__meters">
        <div
          className="combo"
          data-tier={String(hud.tier)}
          data-fever={hud.fever ? 'true' : undefined}
        >
          <span className="combo__label">{comboWord(hud.tier, hud.fever)}</span>
          <span className="combo__count">{hasStreak ? `×${hud.streak}` : '—'}</span>
          <span className="combo__bar" aria-hidden="true">
            <span className="combo__fill" style={comboStyle} />
          </span>
        </div>

        <div className="run-stats">
          <div className="run-stat" data-stat="pairs">
            <span className="run-stat__label">Pairs left</span>
            {/* The one number worth announcing mid-run: how close the board is to done. */}
            <output
              className="run-stat__value"
              aria-live="polite"
              aria-label={`${hud.pairsLeft} of ${hud.totalPairs} pairs left`}
            >
              {hud.pairsLeft}
              <i className="run-stat__total">/{hud.totalPairs}</i>
            </output>
          </div>

          <div className="run-stat" data-stat="score">
            <span className="run-stat__label">Score</span>
            <output className="run-stat__value">{hud.runScore.toLocaleString('en-US')}</output>
            {chasingBest ? (
              <span className="run-stat__best" data-beaten={beatingBest ? 'true' : undefined}>
                Best {hud.bestScore.toLocaleString('en-US')}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="hud__actions run-hud__actions">
        <button
          className="btn"
          type="button"
          data-action="hint"
          disabled={!canHint}
          onClick={onHint}
        >
          Hint ({hud.hintsLeft})
        </button>
        <button
          className="btn"
          type="button"
          data-action="shuffle"
          disabled={!canShuffle}
          onClick={onShuffle}
        >
          Shuffle ({hud.shufflesLeft})
        </button>
        <button
          className="btn"
          type="button"
          data-action="sound"
          aria-pressed={!isMuted}
          onClick={onToggleSound}
        >
          {isMuted ? 'Sound off' : 'Sound on'}
        </button>
        <button className="btn" type="button" data-action="quit" onClick={onQuit}>
          Quit
        </button>
      </div>
    </header>
  );
}
