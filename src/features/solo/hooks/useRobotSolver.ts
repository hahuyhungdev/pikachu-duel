/**
 * Robot Solver Hook for Pikachu Duel.
 *
 * Automates board solving with intelligent tactical prioritization:
 * - Immediate bomb defusal to prevent clock penalties.
 * - Harvesting Chrono tiles for time surges and freeze.
 * - Collecting Gold tiles for 3x combo bonuses.
 * - Seamless stage-to-stage progression in Adventure mode.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Session as SoloSession } from '../../../game/session.ts';
import type { RunPhase } from '../types/solo.types.ts';
import { findSmartRobotMove } from '../../../game/bot.ts';

export type RobotSpeed = 'smooth' | 'fast' | 'turbo' | 'instant';

export const ROBOT_SPEED_DELAYS: Record<RobotSpeed, number> = {
  smooth: 320,
  fast: 110,
  turbo: 25,
  instant: 0,
};

export interface UseRobotSolverOptions {
  session: SoloSession | null;
  phase: RunPhase;
  introOpen: boolean;
  beginStage: () => void;
  pick: (r: number, c: number) => void;
  shuffle: () => void;
  continueRun: () => void;
}

export interface RobotSolverState {
  isRunning: boolean;
  isSolvingRound: boolean;
  speed: RobotSpeed;
  autoAdvance: boolean;
  lastActionReason: string | null;
  setSpeed: (speed: RobotSpeed) => void;
  setAutoAdvance: (auto: boolean) => void;
  startRobot: () => void;
  stopRobot: () => void;
  toggleRobot: () => void;
  solveRound: () => void;
  stepOnce: () => boolean;
}

export function useRobotSolver({
  session,
  phase,
  introOpen,
  beginStage,
  pick,
  shuffle,
  continueRun,
}: UseRobotSolverOptions): RobotSolverState {
  const [isRunning, setIsRunning] = useState(false);
  const [isSolvingRound, setIsSolvingRound] = useState(false);
  const [speed, setSpeed] = useState<RobotSpeed>('fast');
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [lastActionReason, setLastActionReason] = useState<string | null>(null);

  // References to keep callbacks and timers fresh without re-triggering loops
  const sessionRef = useRef(session);
  const phaseRef = useRef(phase);
  const introOpenRef = useRef(introOpen);
  const autoAdvanceRef = useRef(autoAdvance);
  const speedRef = useRef(speed);
  const isRunningRef = useRef(isRunning);
  const isSolvingRoundRef = useRef(isSolvingRound);
  const timerRef = useRef<number | null>(null);
  const scheduleNextStepRef = useRef<() => void>(() => {});

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    introOpenRef.current = introOpen;
  }, [introOpen]);

  useEffect(() => {
    autoAdvanceRef.current = autoAdvance;
  }, [autoAdvance]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    isSolvingRoundRef.current = isSolvingRound;
  }, [isSolvingRound]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * Executes a single smart step:
   * 1. Deselects mismatched active selection if needed.
   * 2. Finds the highest priority move (bomb > chrono > gold > normal).
   * 3. Triggers pick(a) then pick(b).
   * 4. If blocked, attempts a shuffle.
   *
   * @returns true if a move or shuffle was made, false if stalled or finished.
   */
  const stepOnce = useCallback((): boolean => {
    const curSession = sessionRef.current;
    if (!curSession || curSession.status !== 'playing') return false;
    if (curSession.board.remaining <= 0) return false;

    const decision = findSmartRobotMove(curSession.board);

    if (!decision) {
      // Board has remaining tiles but no legal move found
      if (curSession.shufflesLeft > 0) {
        setLastActionReason('shuffling');
        shuffle();
        return true;
      }
      return false;
    }

    const { move, reason } = decision;
    setLastActionReason(reason);

    // Handle any pre-existing selection to avoid accidental mismatch
    const curSelected = curSession.selected;
    if (curSelected) {
      const isAlreadyA = curSelected.r === move.a.r && curSelected.c === move.a.c;
      const isAlreadyB = curSelected.r === move.b.r && curSelected.c === move.b.c;

      if (isAlreadyA) {
        pick(move.b.r, move.b.c);
        return true;
      }
      if (isAlreadyB) {
        pick(move.a.r, move.a.c);
        return true;
      }
      // Selected tile is completely different, deselect it first
      pick(curSelected.r, curSelected.c);
    }

    // Connect the pair
    pick(move.a.r, move.a.c);
    pick(move.b.r, move.b.c);
    return true;
  }, [pick, shuffle]);

  const stopRobot = useCallback(() => {
    clearTimer();
    setIsRunning(false);
    setIsSolvingRound(false);
  }, [clearTimer]);

  const scheduleNextStep = useCallback(() => {
    clearTimer();
    if (!isRunningRef.current && !isSolvingRoundRef.current) return;

    // If intro card is open, dismiss it by beginning the stage
    if (introOpenRef.current) {
      beginStage();
      timerRef.current = window.setTimeout(() => scheduleNextStepRef.current(), 250);
      return;
    }

    // If stage was cleared and autoAdvance is on
    if (phaseRef.current === 'cleared') {
      if (isSolvingRoundRef.current && !isRunningRef.current) {
        // Solving round finished!
        setIsSolvingRound(false);
        return;
      }
      if (autoAdvanceRef.current) {
        continueRun();
        timerRef.current = window.setTimeout(() => scheduleNextStepRef.current(), 600);
        return;
      }
      // Stop when stage cleared if auto-advance is disabled
      stopRobot();
      return;
    }

    // If failed or game over, stop
    if (phaseRef.current === 'failed' || phaseRef.current === 'over' || phaseRef.current === 'menu') {
      stopRobot();
      return;
    }

    const curSession = sessionRef.current;
    if (!curSession || curSession.status !== 'playing') {
      // Wait for session readiness
      timerRef.current = window.setTimeout(() => scheduleNextStepRef.current(), 150);
      return;
    }

    if (curSession.board.remaining <= 0) {
      // Board is empty, wait for phase change
      timerRef.current = window.setTimeout(() => scheduleNextStepRef.current(), 100);
      return;
    }

    const delay = ROBOT_SPEED_DELAYS[speedRef.current];

    if (delay === 0) {
      // Instant / burst batch
      let burstCount = 0;
      let ok = true;
      while (ok && burstCount < 6 && curSession.board.remaining > 0) {
        ok = stepOnce();
        burstCount += 1;
      }
      timerRef.current = window.setTimeout(() => scheduleNextStepRef.current(), 16);
    } else {
      stepOnce();
      timerRef.current = window.setTimeout(() => scheduleNextStepRef.current(), delay);
    }
  }, [beginStage, clearTimer, continueRun, stepOnce, stopRobot]);

  useEffect(() => {
    scheduleNextStepRef.current = scheduleNextStep;
  }, [scheduleNextStep]);

  const startRobot = useCallback(() => {
    setIsRunning(true);
    isRunningRef.current = true;
    if (introOpenRef.current) {
      beginStage();
    }
    // Kick off loop on next tick
    clearTimer();
    timerRef.current = window.setTimeout(() => scheduleNextStepRef.current(), 50);
  }, [beginStage, clearTimer]);

  const solveRound = useCallback(() => {
    setIsSolvingRound(true);
    isSolvingRoundRef.current = true;
    if (introOpenRef.current) {
      beginStage();
    }
    clearTimer();
    timerRef.current = window.setTimeout(() => scheduleNextStepRef.current(), 30);
  }, [beginStage, clearTimer]);

  const toggleRobot = useCallback(() => {
    if (isRunning || isSolvingRound) {
      stopRobot();
    } else {
      startRobot();
    }
  }, [isRunning, isSolvingRound, startRobot, stopRobot]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  // Respond to phase or intro state changes while active
  useEffect(() => {
    if ((isRunning || isSolvingRound) && timerRef.current === null) {
      timerRef.current = window.setTimeout(() => scheduleNextStepRef.current(), 80);
    }
  }, [isRunning, isSolvingRound, phase, introOpen]);

  return {
    isRunning,
    isSolvingRound,
    speed,
    autoAdvance,
    lastActionReason,
    setSpeed,
    setAutoAdvance,
    startRobot,
    stopRobot,
    toggleRobot,
    solveRound,
    stepOnce,
  };
}
