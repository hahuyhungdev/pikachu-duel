/**
 * Tile faces. Icon ids are 1-based to keep 0 free as "empty".
 * Each face carries its own colour so tiles read as distinct plastic buttons
 * rather than a uniform grid.
 */

export const ICONS = [
  { glyph: '⚡', label: 'bolt', h: 95, l: '80%', c: 0.17 },
  { glyph: '🔥', label: 'flame', h: 42, l: '72%', c: 0.16 },
  { glyph: '💧', label: 'drop', h: 252, l: '72%', c: 0.14 },
  { glyph: '🍃', label: 'leaf', h: 145, l: '78%', c: 0.14 },
  { glyph: '⭐', label: 'star', h: 88, l: '86%', c: 0.13 },
  { glyph: '🌙', label: 'moon', h: 285, l: '74%', c: 0.11 },
  { glyph: '❄️', label: 'snowflake', h: 228, l: '88%', c: 0.07 },
  { glyph: '🌀', label: 'vortex', h: 205, l: '64%', c: 0.14 },
  { glyph: '🍀', label: 'clover', h: 172, l: '64%', c: 0.13 },
  { glyph: '🔮', label: 'orb', h: 310, l: '72%', c: 0.14 },
  { glyph: '💎', label: 'gem', h: 186, l: '82%', c: 0.11 },
  { glyph: '🌸', label: 'blossom', h: 350, l: '82%', c: 0.11 },
  { glyph: '🦴', label: 'bone', h: 68, l: '88%', c: 0.06 },
  { glyph: '🐾', label: 'paw', h: 30, l: '66%', c: 0.12 },
  { glyph: '🥚', label: 'egg', h: 58, l: '90%', c: 0.08 },
  { glyph: '🔔', label: 'bell', h: 72, l: '76%', c: 0.15 },
  { glyph: '🍎', label: 'apple', h: 22, l: '70%', c: 0.17 },
  { glyph: '👑', label: 'crown', h: 100, l: '84%', c: 0.15 },
  { glyph: '🎈', label: 'balloon', h: 358, l: '70%', c: 0.16 },
  { glyph: '🧲', label: 'magnet', h: 12, l: '74%', c: 0.14 },
];

export const MAX_ICONS = ICONS.length;

export function iconFor(id) {
  return ICONS[(id - 1) % ICONS.length];
}
