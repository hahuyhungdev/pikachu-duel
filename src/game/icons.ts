/**
 * Canonical Pokémon battle sprites and icon mapping.
 *
 * Tile identifiers are strictly 1-based integers so that 0 represents
 * the board's empty-cell sentinel (`EMPTY = 0`).
 */

/** Empty cell identifier representing a cleared or vacant board cell. */
export const EMPTY_CELL_VALUE = 0;

/** Structure describing a playable Pokémon tile sprite. */
export interface IconDefinition {
  /** Display label / Pokémon name. */
  readonly label: string;
  /** Resolved asset URL string. */
  readonly src: string;
}

/** Helper resolving asset URLs relative to this module. */
const sprite = (name: string): string => new URL(`../assets/pokemon/${name}.png`, import.meta.url).href;

/** Canonical list of Pokémon icons available for board deals. */
export const ICONS: readonly IconDefinition[] = [
  { label: 'Pikachu', src: sprite('pikachu') },
  { label: 'Bulbasaur', src: sprite('bulbasaur') },
  { label: 'Charmander', src: sprite('charmander') },
  { label: 'Squirtle', src: sprite('squirtle') },
  { label: 'Raichu', src: sprite('raichu') },
  { label: 'Nidorino', src: sprite('nidorino') },
  { label: 'Nidoqueen', src: sprite('nidoqueen') },
  { label: 'Arcanine', src: sprite('arcanine') },
  { label: 'Machamp', src: sprite('machamp') },
  { label: 'Meowth', src: sprite('meowth') },
  { label: 'Psyduck', src: sprite('psyduck') },
  { label: 'Snorlax', src: sprite('snorlax') },
  { label: 'Gengar', src: sprite('gengar') },
  { label: 'Haunter', src: sprite('haunter') },
  { label: 'Lapras', src: sprite('lapras') },
  { label: 'Gyarados', src: sprite('gyarados') },
  { label: 'Aerodactyl', src: sprite('aerodactyl') },
  { label: 'Mewtwo', src: sprite('mewtwo') },
  { label: 'Dragonite', src: sprite('dragonite') },
  { label: 'Vulpix', src: sprite('vulpix') },
  { label: 'Growlithe', src: sprite('growlithe') },
  { label: 'Cubone', src: sprite('cubone') },
  { label: 'Scyther', src: sprite('scyther') },
  { label: 'Magikarp', src: sprite('magikarp') },
  { label: 'Venusaur', src: sprite('venusaur') },
  { label: 'Charizard', src: sprite('charizard') },
  { label: 'Blastoise', src: sprite('blastoise') },
  { label: 'Butterfree', src: sprite('butterfree') },
  { label: 'Beedrill', src: sprite('beedrill') },
  { label: 'Pidgeot', src: sprite('pidgeot') },
  { label: 'Rattata', src: sprite('rattata') },
  { label: 'Ekans', src: sprite('ekans') },
  { label: 'Sandshrew', src: sprite('sandshrew') },
  { label: 'Clefairy', src: sprite('clefairy') },
  { label: 'Jigglypuff', src: sprite('jigglypuff') },
  { label: 'Zubat', src: sprite('zubat') },
  { label: 'Oddish', src: sprite('oddish') },
  { label: 'Paras', src: sprite('paras') },
  { label: 'Diglett', src: sprite('diglett') },
  { label: 'Mankey', src: sprite('mankey') },
  { label: 'Poliwag', src: sprite('poliwag') },
  { label: 'Abra', src: sprite('abra') },
  { label: 'Tentacool', src: sprite('tentacool') },
  { label: 'Geodude', src: sprite('geodude') },
  { label: 'Ponyta', src: sprite('ponyta') },
  { label: 'Slowpoke', src: sprite('slowpoke') },
  { label: 'Magnemite', src: sprite('magnemite') },
  { label: 'Eevee', src: sprite('eevee') },
] as const;

/** Total count of distinct sprite varieties in the catalog. */
export const MAX_ICONS: number = ICONS.length;

/**
 * Returns the icon definition for a 1-based tile identifier.
 * Wraps around modulo `MAX_ICONS` if an index exceeds the available array length.
 *
 * @param id - The 1-based tile icon ID.
 * @returns The matching `IconDefinition`.
 */
export function iconFor(id: number): IconDefinition {
  const index = ((id - 1) % MAX_ICONS + MAX_ICONS) % MAX_ICONS;
  return ICONS[index];
}
