import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { createBoard } from '../../../../game/board.js';
import { Board } from './index';

it('lets a player switch between readable tiles and the whole-board overview without changing the deal', () => {
  render(<Board board={createBoard({ rows: 9, cols: 16, iconCount: 24, seed: 4 })}
    label="Ash" selected={null} hint={null} cursor={null} clearingTiles={[]} shakingTiles={[]}
    traces={[]} floaters={[]} veil={null} onPick={vi.fn()} />);
  const tiles = screen.getAllByRole('button', { name: /row \d+ column/ }).map((tile) => tile.getAttribute('aria-label'));
  fireEvent.click(screen.getByRole('button', { name: 'Whole board' }));
  expect(screen.getByRole('button', { name: 'Larger tiles' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getAllByRole('button', { name: /row \d+ column/ }).map((tile) => tile.getAttribute('aria-label'))).toEqual(tiles);
});

it('lets a player zoom in, zoom out, and reset the zoom scale', () => {
  render(<Board board={createBoard({ rows: 9, cols: 16, iconCount: 24, seed: 4 })}
    label="Ash" selected={null} hint={null} cursor={null} clearingTiles={[]} shakingTiles={[]}
    traces={[]} floaters={[]} veil={null} onPick={vi.fn()} />);

  const zoomReset = screen.getByRole('button', { name: 'Reset zoom' });
  const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
  const zoomOut = screen.getByRole('button', { name: 'Zoom out' });

  expect(zoomReset).toHaveTextContent('100%');
  fireEvent.click(zoomIn);
  expect(zoomReset).toHaveTextContent('110%');
  fireEvent.click(zoomOut);
  expect(zoomReset).toHaveTextContent('100%');
  fireEvent.click(zoomOut);
  expect(zoomReset).toHaveTextContent('90%');
  fireEvent.click(zoomReset);
  expect(zoomReset).toHaveTextContent('100%');
});
