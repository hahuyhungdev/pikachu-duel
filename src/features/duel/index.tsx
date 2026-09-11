import type { RefObject } from 'react';
import { PRESETS as GAME_PRESETS } from '../../shared/game/presets.js';
import { DuelView } from './components/DuelView';
import { useDuel } from './hooks/useDuel';

export const PRESETS = GAME_PRESETS;

export interface DuelGameProps {
  rootRef?: RefObject<HTMLDivElement | null>;
}

export function DuelGame({ rootRef }: DuelGameProps = {}) {
  const duelState = useDuel();
  return <DuelView rootRef={rootRef} {...duelState} />;
}
