/**
 * Canonical Pokémon battle sprites from the classic handheld games.
 * Icon ids stay 1-based so 0 remains the board's empty-cell sentinel.
 */

const sprite = (name) => new URL(`../assets/pokemon/${name}.png`, import.meta.url).href;

export const ICONS = [
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
];

export const MAX_ICONS = ICONS.length;

export function iconFor(id) {
  return ICONS[(id - 1) % ICONS.length];
}
