/**
 * The solo menu — the screen that has to answer "what am I about to play?"
 * before anyone presses start.
 *
 * Everything here is a real form control: the mode list and the board size are
 * genuine radio groups, so a thumb, a Tab key and a screen reader all reach the
 * same thing. The rules a first-time player cannot guess (combo, the three
 * special tiles, gravity) live in a native <details> so they are one tap away
 * on a phone without swallowing the screen. The numbers quoted in that guide are
 * imported from the rules themselves rather than retyped, so they cannot drift.
 */

import { useState } from 'react';
import { PRESETS } from '../../../../shared/game/presets.js';
import { FEVER_MULTIPLIER, FEVER_STREAK } from '../../../../game/session.js';
import { BOMB_PENALTY_SECONDS, GOLD_MULTIPLIER } from '../../../../game/marks.js';
import { GRAVITY_LABELS } from '../../../../game/gravity.js';
import type { Difficulty, GameMode, ModeCard, ProfileSummary } from '../../types/solo.types';

interface ModePickerProps {
  isOpen: boolean;
  modes: ModeCard[];
  selected: GameMode;
  difficulty: Difficulty;
  /** Only Classic and Zen let the player pick a board size. */
  showDifficulty: boolean;
  profile: ProfileSummary;
  onSelect: (mode: GameMode) => void;
  onDifficulty: (difficulty: Difficulty) => void;
  onStart: () => void;
  onOpenDuel: () => void;
}

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

/** Say what is about to happen, not "Start". */
const START_LABEL: Record<GameMode, string> = {
  classic: 'Start Classic',
  adventure: 'Start Adventure',
  timeattack: 'Start Time Attack',
  daily: "Play today's board",
  zen: 'Open the Zen board',
};

export function ModePicker({
  isOpen,
  modes,
  selected,
  difficulty,
  showDifficulty,
  profile,
  onSelect,
  onDifficulty,
  onStart,
  onOpenDuel,
}: ModePickerProps) {
  const isFirstTime = profile.totalPlays === 0;
  const [guideOpen, setGuideOpen] = useState(isFirstTime);

  const selectedCard = modes.find((card) => card.id === selected);
  const startLabel =
    selectedCard?.spent && selected === 'daily' ? "Replay today's board" : START_LABEL[selected];

  return (
    <div className="overlay" data-overlay="mode-picker" hidden={!isOpen}>
      <div className="panel panel--modes">
        <div className="panel__eyebrow">Solo run</div>
        <h1>Pick your board</h1>
        <p className="panel__lede">Same matching rules every time. Only the pressure changes.</p>

        <fieldset className="mode-list">
          <legend className="mode-list__legend">Mode</legend>
          {modes.map((card) => (
            <label
              className="mode-card"
              key={card.id}
              data-mode={card.id}
              data-selected={card.id === selected ? 'true' : 'false'}
              data-spent={card.spent ? 'true' : undefined}
            >
              <input
                className="mode-card__input"
                type="radio"
                name="solo-mode"
                value={card.id}
                checked={card.id === selected}
                onChange={() => onSelect(card.id)}
              />
              <span className="mode-card__label">{card.label}</span>
              <span className="mode-card__blurb">{card.blurb}</span>
              <span className="mode-card__best" data-empty={card.bestValue ? undefined : 'true'}>
                <span className="mode-card__best-label">
                  {card.bestValue ? card.bestLabel : 'No run yet'}
                </span>
                <span className="mode-card__best-value">
                  {card.bestValue || 'Be the first to set it'}
                </span>
              </span>
              {card.spent && (
                <span className="mode-card__spent">
                  Already played today — a replay won&rsquo;t count.
                </span>
              )}
            </label>
          ))}
        </fieldset>

        {showDifficulty && (
          <fieldset className="difficulty">
            <legend className="difficulty__legend">Board size</legend>
            {DIFFICULTIES.map((id) => {
              const preset = PRESETS[id];
              return (
                <label
                  className="difficulty-option"
                  key={id}
                  data-difficulty={id}
                  data-selected={id === difficulty ? 'true' : 'false'}
                >
                  <input
                    className="difficulty-option__input"
                    type="radio"
                    name="solo-difficulty"
                    value={id}
                    checked={id === difficulty}
                    onChange={() => onDifficulty(id)}
                  />
                  <span className="difficulty-option__label">
                    {preset.difficultyLabel} · {preset.label}
                  </span>
                  <span className="difficulty-option__size">
                    {preset.rows}×{preset.cols}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}

        <details
          className="how-it-works"
          open={guideOpen}
          onToggle={(e) => setGuideOpen(e.currentTarget.open)}
        >
          <summary className="how-it-works__summary">How it works</summary>

          <p className="how-it-works__line" data-topic="combo">
            <strong>Combo.</strong> Every pair you match without missing is worth more than the last.
            Reach {FEVER_STREAK} in a row and Fever multiplies your score by {FEVER_MULTIPLIER} until
            you miss.
          </p>

          <dl className="mark-guide">
            <dt className="mark-guide__term" data-mark="gold">
              Gold
            </dt>
            <dd className="mark-guide__detail">Scores {GOLD_MULTIPLIER}× — hunt it first.</dd>
            <dt className="mark-guide__term" data-mark="ice">
              Ice
            </dt>
            <dd className="mark-guide__detail">Two matches to clear; the first only cracks it.</dd>
            <dt className="mark-guide__term" data-mark="bomb">
              Bomb
            </dt>
            <dd className="mark-guide__detail">
              Ticks down on every match. At zero it costs you {BOMB_PENALTY_SECONDS} seconds.
            </dd>
          </dl>

          <p className="how-it-works__line" data-topic="gravity">
            <strong>Gravity.</strong> On later stages the tiles slide after every match —{' '}
            {GRAVITY_LABELS.down}, {GRAVITY_LABELS.up}, {GRAVITY_LABELS['inward-h']}. The stage card
            tells you which before you start.
          </p>
        </details>

        <dl className="profile-strip">
          <dt className="profile-strip__term" data-stat="streak">
            Day streak
          </dt>
          <dd className="profile-strip__value" data-stat="streak">
            {profile.dayStreak}
          </dd>
          <dt className="profile-strip__term" data-stat="pairs">
            Pairs cleared
          </dt>
          <dd className="profile-strip__value" data-stat="pairs">
            {profile.totalPairs.toLocaleString('en-US')}
          </dd>
          <dt className="profile-strip__term" data-stat="unlocks">
            Unlocks
          </dt>
          <dd className="profile-strip__value" data-stat="unlocks">
            {profile.unlocked} / {profile.unlockTotal}
          </dd>
        </dl>

        <div className="panel__actions">
          <button className="btn btn--retry" type="button" data-action="start" onClick={onStart}>
            {startLabel}
          </button>
          <button
            className="btn btn--quiet"
            type="button"
            data-action="open-duel"
            onClick={onOpenDuel}
          >
            Two players? Open Duel
          </button>
        </div>
      </div>
    </div>
  );
}
