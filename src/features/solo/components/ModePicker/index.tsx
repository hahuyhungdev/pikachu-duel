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
import { BOMB_PENALTY_SECONDS, CHRONO_FREEZE_SECONDS, CHRONO_SURGE_SECONDS, GOLD_MULTIPLIER } from '../../../../game/marks.js';
import { GRAVITY_LABELS } from '../../../../game/gravity.js';
import { avatarSrc } from '../../../leaderboard/avatars';
import { ICONS } from '../../../../game/icons.js';
import type { User } from '../../../leaderboard/leaderboardApi';
import type { ProgressSyncStatus } from '../../../leaderboard/hooks/useAccountProgress';
import type { Difficulty, GameMode, ModeCard, ProfileSummary } from '../../types/solo.types';
import styles from './ModePicker.module.scss';

interface ModePickerProps {
  isOpen: boolean;
  modes: ModeCard[];
  selected: GameMode;
  difficulty: Difficulty;
  /** Only Classic and Zen let the player pick a board size. */
  showDifficulty: boolean;
  profile: ProfileSummary;
  user?: User | null;
  syncStatus?: ProgressSyncStatus;
  onRetrySync?: () => void;
  onSelect: (mode: GameMode) => void;
  onDifficulty: (difficulty: Difficulty) => void;
  onStart: (targetStage?: number) => void;
  onOpenDuel: () => void;
  onOpenAuth?: () => void;
  onOpenLeaderboard?: () => void;
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
  user,
  syncStatus = 'local',
  onRetrySync,
  onSelect,
  onDifficulty,
  onStart,
  onOpenDuel,
  onOpenAuth,
  onOpenLeaderboard,
}: ModePickerProps) {
  const [guideOpen, setGuideOpen] = useState(false);

  const selectedCard = modes.find((card) => card.id === selected);
  const bestStage = profile?.adventureBestStage ?? 1;
  const startLabel =
    selectedCard?.spent && selected === 'daily'
      ? "Replay today's board"
      : selected === 'adventure' && bestStage > 1
      ? `Resume Stage ${bestStage}`
      : START_LABEL[selected];

  return (
    <div className={`${styles.overlay} overlay`} data-overlay="mode-picker" hidden={!isOpen}>
      <div className={`${styles.panel} panel panel--modes`}>
        <div className={`${styles.menuCloudBar} menu-cloud-bar`}>
          <button
            className="btn btn--user-badge"
            type="button"
            data-action="open-auth"
            onClick={onOpenAuth}
            aria-label="Tài khoản người chơi"
          >
            {user ? (
              <>
                <img
                  src={avatarSrc(user.avatar)}
                  alt=""
                  className="btn--user-avatar"
                />
                <span>{user.username}</span>
              </>
            ) : (
              <span>Đăng nhập / Hồ sơ</span>
            )}
          </button>

          <button
            className="btn btn--leaderboard-open"
            type="button"
            data-action="open-leaderboard"
            onClick={onOpenLeaderboard}
          >
            Bảng xếp hạng
          </button>
        </div>

        <p className="save-status" role="status" data-sync={syncStatus}>
          {syncStatus === 'local' ? 'Guest progress stays on this browser. Sign in to save to your account.'
            : syncStatus === 'synced' ? 'Progress saved to your account'
            : syncStatus === 'syncing' ? 'Syncing your progress…'
            : 'Saved on this device. Account sync unavailable.'}
          {syncStatus === 'error' && <button type="button" className="btn" onClick={onRetrySync}>Retry sync</button>}
        </p>

        <div className={`${styles.hero} menu-hero`}>
          <div>
            <div className="panel__eyebrow">Pokémon matching club · 01</div>
            <h1>Pikachu<span className={`${styles.heroAccent} menu-hero__accent`}>Play your next move.</span></h1>
            <p className="panel__lede">Find a pair. Find your rhythm. Beat your best.</p>
          </div>
          <div className={`${styles.mascot} menu-mascot`} aria-hidden="true">
            <img src={ICONS[0].src} alt="" />
            <span>48 Pokémon to discover</span>
          </div>
        </div>

        <div className={`${styles.startCard} menu-start`}>
          <div>
            <span className="panel__eyebrow">Your next challenge</span>
            <strong>{selectedCard?.label}</strong>
            <p>{selectedCard?.blurb}</p>
            {selected === 'adventure' && bestStage > 1 && (
              <button
                type="button"
                className="btn btn--quiet"
                style={{ padding: '2px 8px', fontSize: '12px', marginTop: '4px' }}
                onClick={() => onStart(1)}
              >
                Start from Stage 1
              </button>
            )}
          </div>
          <button className="btn btn--retry" type="button" data-action="start" onClick={() => onStart(selected === 'adventure' && bestStage > 1 ? bestStage : undefined)}>
            {startLabel} <span aria-hidden="true">→</span>
          </button>
        </div>

        <fieldset className={`${styles.modeList} mode-list`}>
          <legend className="mode-list__legend">Mode</legend>
          {modes.map((card) => (
            <label
              className={`${styles.modeCard} mode-card`}
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
                    {preset.rows}×{preset.cols} · {preset.iconCount} Pokémon
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
            <dt className="mark-guide__term" data-mark="chrono">
              Chrono
            </dt>
            <dd className="mark-guide__detail">
              Surges clock +{CHRONO_SURGE_SECONDS}s and freezes timer for {CHRONO_FREEZE_SECONDS}s.
            </dd>
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
