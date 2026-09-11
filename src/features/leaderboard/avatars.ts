import { ICONS } from '../../game/icons.js';

export interface AvatarOption {
  id: string;
  name: string;
  src: string;
}

export const AVATARS: AvatarOption[] = ICONS.map((icon) => ({
  id: icon.label.toLowerCase(),
  name: icon.label,
  src: icon.src,
}));

export function avatarSrc(avatarId?: string): string {
  const found = AVATARS.find((a) => a.id === avatarId?.toLowerCase());
  return found?.src ?? AVATARS[0].src;
}
