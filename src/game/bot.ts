/**
 * Intelligent Robot Solver for Pikachu Duel.
 *
 * Scans the board, prioritizes urgent hazards (defusing ticking bombs),
 * collects high-value bonus tiles (Chrono freeze and Gold multipliers),
 * and automatically plans sequential pair clears.
 */

import type { Board } from './grid.ts';
import type { MoveHint } from './connect.ts';
import { findPath } from './connect.ts';
import { listTiles } from './grid.ts';
import { MARK_BOMB, MARK_CHRONO, MARK_GOLD, type BoardWithMarks } from './marks.ts';

export interface RobotMoveDecision {
  move: MoveHint;
  priority: number;
  reason: 'bomb' | 'chrono' | 'gold' | 'normal';
}

/**
 * Finds the most strategic legal move currently available on the board.
 *
 * Priority order:
 * 1. Low-fuse bombs (defuse before detonation to protect clock)
 * 2. Chrono tiles (freeze timer and grant +8s surge)
 * 3. Gold tiles (3x score multiplier)
 * 4. Standard orthogonal connection moves
 *
 * @param board - The target game board.
 * @returns The best move decision, or null if no legal move exists.
 */
export function findSmartRobotMove(board: Board): RobotMoveDecision | null {
  const markedBoard = board as BoardWithMarks;
  const marks = markedBoard.marks;
  const fuses = markedBoard.fuses;
  const stride = board.cols + 2;

  // Group tiles by icon ID
  const byIcon = new Map<number, { r: number; c: number; icon: number }[]>();
  for (const tile of listTiles(board)) {
    const group = byIcon.get(tile.icon);
    if (group) {
      group.push(tile);
    } else {
      byIcon.set(tile.icon, [tile]);
    }
  }

  const candidateMoves: RobotMoveDecision[] = [];

  for (const group of byIcon.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const path = findPath(board, group[i], group[j]);
        if (path) {
          let priority = 10;
          let reason: 'bomb' | 'chrono' | 'gold' | 'normal' = 'normal';

          if (marks) {
            const idxA = group[i].r * stride + group[i].c;
            const idxB = group[j].r * stride + group[j].c;
            const markA = marks[idxA];
            const markB = marks[idxB];

            if (markA === MARK_BOMB || markB === MARK_BOMB) {
              const fuseA = fuses ? fuses[idxA] : 99;
              const fuseB = fuses ? fuses[idxB] : 99;
              const lowestFuse = Math.min(fuseA, fuseB);
              // Imminent bombs (fuse <= 3) are top emergency priority
              priority = 1000 - lowestFuse * 10;
              reason = 'bomb';
            } else if (markA === MARK_CHRONO || markB === MARK_CHRONO) {
              priority = 200;
              reason = 'chrono';
            } else if (markA === MARK_GOLD || markB === MARK_GOLD) {
              priority = 100;
              reason = 'gold';
            }
          }

          const move: MoveHint = {
            a: { r: group[i].r, c: group[i].c },
            b: { r: group[j].r, c: group[j].c },
            path,
          };

          candidateMoves.push({
            move,
            priority,
            reason,
          });

          // Immediate return for critical bomb
          if (priority >= 950) {
            return {
              move,
              priority,
              reason: 'bomb',
            };
          }
        }
      }
    }
  }

  if (candidateMoves.length === 0) return null;

  candidateMoves.sort((a, b) => b.priority - a.priority);
  return candidateMoves[0];
}
