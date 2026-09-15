import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { loadProfile } from '../shared/game/profile';

describe('App React Router and Admin Stage Controller', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('renders the solo game surface on the root route "/"', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /start adventure/i })).toBeInTheDocument();
  });

  it('keeps GitHub Pages navigation inside the /pikachu-duel base path', async () => {
    window.history.replaceState({}, '', '/pikachu-duel/');
    render(<App />);

    expect(await screen.findByRole('button', { name: /start adventure/i })).toBeInTheDocument();
    expect(window.location.pathname).toMatch(/^\/pikachu-duel\/?$/);

    fireEvent.click(screen.getByRole('button', { name: /Two players.*Open Duel/i }));
    expect(await screen.findByRole('button', { name: /start duel/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/pikachu-duel/duel');

    fireEvent.click(screen.getByRole('button', { name: /Solo modes/i }));
    expect(await screen.findByRole('button', { name: /start adventure/i })).toBeInTheDocument();
    expect(window.location.pathname).toMatch(/^\/pikachu-duel\/?$/);
  });

  it('restores a GitHub Pages deep route before the router renders', async () => {
    window.history.replaceState({}, '', '/pikachu-duel/?__route=%2Fduel');
    render(<App />);

    expect(await screen.findByRole('button', { name: /start duel/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/pikachu-duel/duel');
    expect(window.location.search).toBe('');
  });

  it('navigates to the /admin route and renders the Admin Stage Controller', async () => {
    window.history.replaceState({}, '', '/admin');
    render(<App />);

    expect(await screen.findByText('⚡ Pikachu Admin')).toBeInTheDocument();
    expect(screen.getByText('Stage Controller')).toBeInTheDocument();
    expect(screen.getByText(/Set Stage Anywhere/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to Game/i })).toBeInTheDocument();
  });

  it('allows user to set any stage from /admin and updates profile', async () => {
    window.history.replaceState({}, '', '/admin');
    render(<App />);

    const stageInput = (await screen.findByLabelText(/Stage Number/i)) as HTMLInputElement;
    fireEvent.change(stageInput, { target: { value: '25' } });
    expect(stageInput.value).toBe('25');

    // Click "Set Stage 25 in Profile"
    const setProfileBtn = screen.getByRole('button', { name: /Set Stage 25 in Profile/i });
    fireEvent.click(setProfileBtn);

    expect(loadProfile().modes.adventure.bestStage).toBe(25);
  });

  it('allows user to unlock all stages up to selected stage', async () => {
    window.history.replaceState({}, '', '/admin/16');
    render(<App />);

    const unlockBtn = await screen.findByRole('button', { name: /Unlock All Stages Up To 16/i });
    fireEvent.click(unlockBtn);

    const profile = loadProfile();
    expect(profile.modes.adventure.bestStage).toBeGreaterThanOrEqual(16);
    expect(profile.stageStars['16']).toBe(3);
    expect(profile.stageStars['1']).toBe(3);
  });

  it('allows clicking quick stage presets in /admin', async () => {
    window.history.replaceState({}, '', '/admin');
    render(<App />);

    const stage16Preset = await screen.findByRole('button', { name: /Stage 16 \(Milestone/i });
    fireEvent.click(stage16Preset);

    expect(screen.getByText(/Stage 16 Configuration/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Play Stage 16 Now/i })).toBeInTheDocument();
  });

  it('navigates back to the game when clicking "Back to Game"', async () => {
    window.history.replaceState({}, '', '/admin');
    render(<App />);

    const backBtn = await screen.findByRole('button', { name: /Back to Game/i });
    fireEvent.click(backBtn);

    expect(await screen.findByRole('button', { name: /start adventure/i })).toBeInTheDocument();
  });

  it('renders the floating Admin Stage Bar when ?admin=true is passed', async () => {
    window.history.replaceState({}, '', '/?admin=true');
    render(<App />);

    expect(await screen.findByRole('region', { name: /Admin Stage Controller/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Jump to/i })).toBeInTheDocument();
  });

  it('allows jumping between stages anywhere in-game using the floating stage bar', async () => {
    window.history.replaceState({}, '', '/?admin=true');
    const { container } = render(<App />);

    // Start adventure run
    const startBtn = screen.getByRole('button', { name: /start adventure/i });
    fireEvent.click(startBtn);

    // Jump to Stage 16 directly using the Admin Stage Bar
    const adminBar = screen.getByRole('region', { name: /Admin Stage Controller/i });
    const stageInput = adminBar.querySelector<HTMLInputElement>('input[type="number"]')!;
    fireEvent.change(stageInput, { target: { value: '16' } });

    const jumpBtn = screen.getByRole('button', { name: /Jump to 16/i });
    fireEvent.click(jumpBtn);

    // Board should now be in stage 16
    expect(container.querySelector('[data-arena]')).toBeInTheDocument();
  });

  it('navigates directly to /stage/16 and reflects stage in URL', async () => {
    window.history.replaceState({}, '', '/stage/16');
    render(<App />);

    const stageLabels = await screen.findAllByText(/Stage 16/i);
    expect(stageLabels.length).toBeGreaterThan(0);
    expect(window.location.pathname).toBe('/stage/16');
  });

  it('hides robot resolve button for regular player accounts', async () => {
    window.history.replaceState({}, '', '/stage/1');
    render(<App />);

    // Start stage
    const startBtn = await screen.findByRole('button', { name: /start stage/i });
    fireEvent.click(startBtn);

    // Regular players should not see Robot solver button in HUD
    expect(screen.queryByRole('button', { name: /🤖 Robot/i })).toBeNull();
  });

  it('shows robot resolve button for admin accounts', async () => {
    window.history.replaceState({}, '', '/stage/1?admin=true');
    render(<App />);

    // Start stage
    const startBtn = await screen.findByRole('button', { name: /start stage/i });
    fireEvent.click(startBtn);

    // Admin accounts must see the Robot button in HUD
    expect(await screen.findByRole('button', { name: /🤖 Robot/i })).toBeInTheDocument();
  });
});
