/**
 * Tile faces — the animal cast from the classic game. Icon ids are 1-based so 0
 * stays free as "empty".
 *
 * Every tile shares the same ivory face, exactly like the original: the picture
 * is the only thing that tells two tiles apart. Each face carries a barely-there
 * paper tint (chroma ~0.03) purely to help the eye scan a large board.
 */

export const ICONS = [
  { glyph: '🐦', label: 'bird', h: 235 },
  { glyph: '🐤', label: 'chick', h: 92 },
  { glyph: '🐧', label: 'penguin', h: 250 },
  { glyph: '🦆', label: 'duck', h: 150 },
  { glyph: '🦉', label: 'owl', h: 60 },
  { glyph: '🦅', label: 'eagle', h: 40 },
  { glyph: '🐺', label: 'wolf', h: 265 },
  { glyph: '🦊', label: 'fox', h: 45 },
  { glyph: '🐱', label: 'cat', h: 80 },
  { glyph: '🐶', label: 'dog', h: 55 },
  { glyph: '🐰', label: 'rabbit', h: 340 },
  { glyph: '🐭', label: 'mouse', h: 220 },
  { glyph: '🐹', label: 'hamster', h: 70 },
  { glyph: '🐷', label: 'pig', h: 355 },
  { glyph: '🐮', label: 'cow', h: 185 },
  { glyph: '🐸', label: 'frog', h: 140 },
  { glyph: '🐵', label: 'monkey', h: 50 },
  { glyph: '🐴', label: 'horse', h: 30 },
  { glyph: '🦁', label: 'lion', h: 88 },
  { glyph: '🐯', label: 'tiger', h: 66 },
  { glyph: '🐻', label: 'bear', h: 35 },
  { glyph: '🐨', label: 'koala', h: 200 },
  { glyph: '🐼', label: 'panda', h: 270 },
  { glyph: '🐔', label: 'chicken', h: 25 },
];

export const MAX_ICONS = ICONS.length;

export function iconFor(id) {
  return ICONS[(id - 1) % ICONS.length];
}
