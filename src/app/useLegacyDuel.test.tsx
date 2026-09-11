import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const controller = vi.hoisted(() => ({ destroy: vi.fn() }));

vi.mock('../ui/app.js', () => ({
  mountApp: vi.fn(() => controller),
}));

import { useLegacyDuel } from './useLegacyDuel';

function Harness() {
  const rootRef = useLegacyDuel();
  return <div ref={rootRef} />;
}

describe('React controller compatibility boundary', () => {
  it('destroys the mounted controller when React unmounts it', () => {
    const view = render(<Harness />);

    view.unmount();

    expect(controller.destroy).toHaveBeenCalledOnce();
  });
});
