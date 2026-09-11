import { useEffect, useRef, type RefObject } from 'react';
import { mountApp } from '../ui/app.js';

/**
 * App-shell compatibility boundary for the battle-tested game controller.
 * React owns document structure; this adapter mounts the existing network and
 * session state machine once the feature view is present.
 */
export function useLegacyDuel(): RefObject<HTMLDivElement | null> {
  const rootRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!rootRef.current || mounted.current) return;
    mounted.current = true;
    const controller = mountApp(rootRef.current);

    return () => {
      mounted.current = false;
      controller.destroy();
    };
  }, []);

  return rootRef;
}
