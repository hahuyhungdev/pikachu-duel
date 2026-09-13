import { useState, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  loadProfile,
  setAdventureBestStage,
  unlockStagesUpTo,
  resetAdventureProgress,
  type Profile,
} from '../../../../shared/game/profile';
import { stageConfig, describeStage } from '../../../../game/stages';
import { GRAVITY_LABELS } from '../../../../game/gravity';
import { submitScore } from '../../../leaderboard/leaderboardApi';
import { useAdminMode } from '../../hooks/useAdminMode';
import styles from './AdminPage.module.scss';

const PRESET_STAGES = [
  { stage: 1, label: 'Stage 1 (Intro)' },
  { stage: 4, label: 'Stage 4 (Gravity)' },
  { stage: 6, label: 'Stage 6 (Ice)' },
  { stage: 9, label: 'Stage 9 (Bombs)' },
  { stage: 16, label: 'Stage 16 (Milestone ⭐)' },
  { stage: 20, label: 'Stage 20' },
  { stage: 30, label: 'Stage 30' },
  { stage: 50, label: 'Stage 50' },
];

export function AdminPage() {
  const navigate = useNavigate();
  const params = useParams<{ stage?: string }>();
  const [searchParams] = useSearchParams();
  const { barVisible, toggleBar } = useAdminMode();

  const initialStage = useMemo(() => {
    const fromParam = params.stage ? parseInt(params.stage, 10) : NaN;
    const fromQuery = searchParams.get('stage') ? parseInt(searchParams.get('stage')!, 10) : NaN;
    if (!Number.isNaN(fromParam) && fromParam >= 1) return fromParam;
    if (!Number.isNaN(fromQuery) && fromQuery >= 1) return fromQuery;
    const p = loadProfile();
    return p.modes.adventure.bestStage > 1 ? p.modes.adventure.bestStage : 16;
  }, [params.stage, searchParams]);

  const [selectedStage, setSelectedStage] = useState<number>(initialStage);
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(null), 3000);
  };

  const config = useMemo(() => stageConfig(selectedStage), [selectedStage]);
  const summaryText = useMemo(() => describeStage(selectedStage), [selectedStage]);

  const handleSetProfileStage = () => {
    const updated = setAdventureBestStage(selectedStage);
    setProfile(updated);
    showToast(`Saved Stage ${selectedStage} as your Adventure record!`);
  };

  const handleUnlockUpTo = () => {
    const updated = unlockStagesUpTo(selectedStage);
    setProfile(updated);
    showToast(`Unlocked all stages up to Stage ${selectedStage} with 3 stars!`);
  };

  const handleResetProgress = () => {
    const updated = resetAdventureProgress();
    setProfile(updated);
    setSelectedStage(1);
    showToast('Reset Adventure progress back to Stage 1.');
  };

  const handlePlayStage = () => {
    // Save to profile as current best stage and launch directly into game
    setAdventureBestStage(selectedStage);
    navigate(`/?stage=${selectedStage}`);
  };

  const handleSubmitToLeaderboard = async () => {
    setSubmitting(true);
    try {
      const estimatedScore = selectedStage * 1800 + 3500;
      const res = await submitScore({
        mode: 'adventure',
        stage: selectedStage,
        score: estimatedScore,
        streak: selectedStage * 2,
        pairs: selectedStage * 8,
      });
      if (res?.rank) {
        showToast(`Submitted Stage ${selectedStage} to leaderboard! Rank: #${res.rank}`);
      } else {
        showToast(`Stage ${selectedStage} submitted!`);
      }
    } catch {
      showToast('Error submitting to leaderboard.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.adminContainer}>
      <div className={styles.adminContent}>
        <header className={styles.adminHeader}>
          <div className={styles.brand}>
            <h1>⚡ Pikachu Admin</h1>
            <span className={styles.badge}>Stage Controller</span>
          </div>
          <button
            type="button"
            className={styles.backBtn}
            onClick={() => navigate('/')}
          >
            ← Back to Game
          </button>
        </header>

        {/* Profile Status Overview */}
        <div className={styles.statusGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Current Saved Best Stage</div>
            <div className={`${styles.statValue} ${styles['statValue--highlight']}`}>
              Stage {profile.modes.adventure.bestStage}
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Adventure Best Score</div>
            <div className={styles.statValue}>
              {profile.modes.adventure.bestScore.toLocaleString('en-US')} pts
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Total Pairs Cleared</div>
            <div className={styles.statValue}>{profile.totalPairs.toLocaleString('en-US')}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Total Stars Earned</div>
            <div className={styles.statValue}>
              {Object.values(profile.stageStars).reduce((a, b) => a + b, 0)} ⭐
            </div>
          </div>
        </div>

        {/* Stage Controller Panel */}
        <section className={styles.panel}>
          <h2>🎮 Set Stage Anywhere</h2>

          <div className={styles.selectorRow}>
            <div className={styles.stageInputWrapper}>
              <label htmlFor="stage-input">Stage Number:</label>
              <input
                id="stage-input"
                type="number"
                min={1}
                max={999}
                value={selectedStage}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!Number.isNaN(val)) setSelectedStage(Math.max(1, val));
                }}
              />
            </div>

            <input
              type="range"
              min={1}
              max={100}
              className={styles.slider}
              value={Math.min(100, selectedStage)}
              onChange={(e) => setSelectedStage(parseInt(e.target.value, 10))}
              aria-label="Stage Slider"
            />
          </div>

          <div className={styles.presets}>
            <span className={styles.presetLabel}>Quick Presets:</span>
            {PRESET_STAGES.map((p) => (
              <button
                key={p.stage}
                type="button"
                className={`${styles.presetBtn} ${selectedStage === p.stage ? styles['presetBtn--active'] : ''}`}
                onClick={() => setSelectedStage(p.stage)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Stage Mechanics Inspector */}
          <div className={styles.stageSpecs}>
            <h3>Stage {selectedStage} Configuration: {summaryText}</h3>
            <div className={styles.specGrid}>
              <div className={styles.specItem}>
                <div className={styles.specLabel}>Grid Dimensions</div>
                <div className={styles.specValue}>{config.rows} × {config.cols} ({config.pairs} pairs)</div>
              </div>
              <div className={styles.specItem}>
                <div className={styles.specLabel}>Gravity Pattern</div>
                <div className={styles.specValue}>{GRAVITY_LABELS[config.gravity]}</div>
              </div>
              <div className={styles.specItem}>
                <div className={styles.specLabel}>Timer / Clock</div>
                <div className={styles.specValue}>{config.clock} seconds</div>
              </div>
              <div className={styles.specItem}>
                <div className={styles.specLabel}>Aids Awarded</div>
                <div className={styles.specValue}>{config.hints} hints · {config.shuffles} shuffles</div>
              </div>
              <div className={styles.specItem}>
                <div className={styles.specLabel}>Special Hazards</div>
                <div className={styles.specValue}>
                  {config.bomb > 0 ? `💣 ${config.bomb} bombs (${config.bombFuse}s) ` : ''}
                  {config.ice > 0 ? `❄️ ${config.ice} ice ` : ''}
                  {config.chrono > 0 ? `⏱️ ${config.chrono} chrono ` : ''}
                  {config.gold > 0 ? `🏆 ${config.gold} gold ` : ''}
                  {config.bomb === 0 && config.ice === 0 && config.chrono === 0 && config.gold === 0 ? 'None' : ''}
                </div>
              </div>
              <div className={styles.specItem}>
                <div className={styles.specLabel}>3-Star Gold Target</div>
                <div className={styles.specValue}>{config.stars.gold.toLocaleString('en-US')} pts</div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className={styles.actionsGrid}>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles['actionBtn--primary']}`}
              onClick={handlePlayStage}
            >
              ▶️ Play Stage {selectedStage} Now
            </button>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles['actionBtn--secondary']}`}
              onClick={handleSetProfileStage}
            >
              💾 Set Stage {selectedStage} in Profile
            </button>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles['actionBtn--success']}`}
              onClick={handleUnlockUpTo}
            >
              ⭐ Unlock All Stages Up To {selectedStage}
            </button>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles['actionBtn--secondary']}`}
              onClick={handleSubmitToLeaderboard}
              disabled={submitting}
            >
              🏆 {submitting ? 'Submitting…' : `Submit Stage ${selectedStage} to Ranking`}
            </button>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles['actionBtn--warning']}`}
              onClick={handleResetProgress}
            >
              🔄 Reset to Stage 1
            </button>
          </div>

          {/* Floating bar settings */}
          <div className={styles.adminSettings} style={{ marginTop: '1.5rem' }}>
            <label>
              <input
                type="checkbox"
                checked={barVisible}
                onChange={(e) => toggleBar(e.target.checked)}
              />
              Show In-Game Floating Stage Bar (allows jumping between stages mid-game)
            </label>
          </div>
        </section>
      </div>

      {toastMessage && (
        <div className={styles.toast} role="status">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
