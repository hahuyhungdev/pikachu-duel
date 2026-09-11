import { DuelGame } from './features/duel';
import { useLegacyDuel } from './app/useLegacyDuel';

export default function App() {
  const rootRef = useLegacyDuel();
  return <DuelGame rootRef={rootRef} />;
}
