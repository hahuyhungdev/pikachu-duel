import { useMemo, type RefObject } from 'react';
import { createBoard } from '../../../../game/board.js';
import {
  calculateNextLevel,
  PRESETS,
} from '../../../../shared/game/presets.js';
import type { useDuel } from '../../hooks/useDuel';
import type { DuelMode, PlayerState } from '../../types/duel.types';
import { Arena } from '../Arena';
import { Hud } from '../Hud';
import { LobbyOverlay } from '../LobbyOverlay';
import { ResultOverlay } from '../ResultOverlay';
import { StartOverlay } from '../StartOverlay';
import { Toast } from '../Toast';

function createInitialPlayer(index: number, mode: DuelMode): PlayerState {
  const preset = PRESETS.normal;
  const totalPairs = (preset.rows * preset.cols) / 2;
  const board = createBoard({
    rows: preset.rows,
    cols: preset.cols,
    iconCount: preset.iconCount,
    seed: 1,
  });
  const label = mode === 'solo' ? 'Player' : index === 0 ? 'Player One' : 'Player Two';
  return {
    index,
    label,
    session: {
      label,
      seed: 1,
      board,
      status: 'playing',
      selected: null,
      hint: null,
      score: 0,
      matchedPairs: 0,
      streak: 0,
      bestStreak: 0,
      mistakes: 0,
      hintsLeft: preset.hints,
      shufflesLeft: preset.shuffles,
      reshuffles: 0,
    },
    totalPairs,
    cursor: null,
    clearingTiles: [],
    shakingTiles: [],
    traces: [],
    floaters: [],
    veil: null,
  };
}

export type DuelViewProps = ReturnType<typeof useDuel> & {
  rootRef?: RefObject<HTMLDivElement | null>;
};

export function DuelView({
  rootRef,
  activeTabMode,
  setActiveTabMode,
  duel,
  players,
  timeLeft,
  isUrgent,
  toastMessage,
  soundMuted,
  toggleSound,
  isStartOpen,
  isLobbyOpen,
  isResultOpen,
  online,
  startDuel,
  handlePick,
  triggerPlayerHint,
  triggerPlayerShuffle,
  advanceNextLevel,
  requestRematch,
  openNewDuel,
}: DuelViewProps) {
  const effectiveMode = duel?.mode ?? activeTabMode;

  const defaultPlayers = useMemo(
    () => [createInitialPlayer(0, effectiveMode), createInitialPlayer(1, effectiveMode)],
    [effectiveMode],
  );

  const displayPlayers = players.length > 0 ? players : defaultPlayers;

  const presetsMap = PRESETS as Record<string, typeof PRESETS.normal>;
  const diffPreset = presetsMap[duel?.setup.difficulty ?? 'normal'] ?? PRESETS.normal;
  const diffLabel = diffPreset.difficultyLabel ?? diffPreset.label;

  const next = calculateNextLevel(
    duel?.setup.difficulty ?? 'normal',
    duel?.level ?? 1,
    duel?.setup.clock ?? 300,
  );
  const nextPreset = presetsMap[next.difficulty] ?? PRESETS.hard;
  const nextDiffText =
    next.difficulty === 'hard' && duel?.setup.difficulty === 'hard'
      ? `Hard (${next.clock}s)`
      : (nextPreset.difficultyLabel ?? nextPreset.label);
  const nextLevelText = `Next level: Level ${next.level} (${nextDiffText})`;

  return (
    <div className="shell" data-app ref={rootRef}>
      <Hud
        level={duel?.level ?? 1}
        difficultyLabel={diffLabel}
        seed={duel?.seed ?? 0}
        timeLeft={timeLeft}
        isUrgent={isUrgent}
        canRematch={Boolean(duel)}
        isMuted={soundMuted}
        linkState={online.link ? online.status : undefined}
        onRematch={() => requestRematch(true)}
        onNewDuel={openNewDuel}
        onToggleSound={toggleSound}
      />

      <Arena
        mode={effectiveMode}
        players={displayPlayers}
        onPick={handlePick}
        onHint={triggerPlayerHint}
        onShuffle={triggerPlayerShuffle}
      />

      <StartOverlay
        isOpen={isStartOpen}
        activeMode={activeTabMode}
        initialP1={duel?.setup.names[0]}
        initialP2={duel?.setup.names[1]}
        initialDifficulty={duel?.setup.difficulty}
        initialClock={duel?.setup.clock}
        onlineNote={online.note}
        onChangeMode={setActiveTabMode}
        onStartGame={startDuel}
        onJoinOnline={() => {}}
      />

      <LobbyOverlay
        isOpen={isLobbyOpen}
        roomCode={online.code}
        statusText={online.note || 'Connecting to the relay…'}
        inviteLink={online.link}
        peers={online.players}
        isHost={Boolean(online.you && online.you === online.hostId)}
        settings={online.settings}
        onCopyInvite={() => {}}
        onChangeDifficulty={() => {}}
        onChangeClock={() => {}}
        onStartDuel={() => {}}
        onLeaveRoom={openNewDuel}
      />

      <ResultOverlay
        isOpen={isResultOpen}
        mode={effectiveMode}
        winner={duel?.winner ?? -1}
        reason={duel?.reason ?? null}
        players={displayPlayers}
        nextLevelText={nextLevelText}
        canAdvanceLevel={true}
        onNextLevel={advanceNextLevel}
        onPlayAgain={() => requestRematch(true)}
        onFreshBoard={() => requestRematch(false)}
        onChangeSettings={openNewDuel}
      />

      <Toast message={toastMessage} />
    </div>
  );
}
