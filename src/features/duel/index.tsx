import { useRef, type RefObject } from 'react';
import { PRESETS as GAME_PRESETS } from '../../shared/game/presets.js';
import { DuelView } from './components/DuelView';

export const PRESETS = GAME_PRESETS;

interface DuelGameProps {
  rootRef?: RefObject<HTMLDivElement | null>;
}

export function DuelGame({ rootRef }: DuelGameProps = {}) {
  const localRef = useRef<HTMLDivElement>(null);
  return <DuelView rootRef={rootRef ?? localRef} />;
}
