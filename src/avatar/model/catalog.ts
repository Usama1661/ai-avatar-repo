import type { AvatarModelId, AvatarOutfit } from '../types';

const MODELS: Partial<Record<AvatarModelId, number>> = {
  male: require('../../../assets/models/male-avatar.glb'),
};

const OUTFITS: Record<AvatarOutfit, number> = {
  casual: require('../../../assets/models/male-avatar-clothed.glb'),
};

export function avatarModelSource(id: AvatarModelId, outfit?: AvatarOutfit): number | null {
  if (outfit) return OUTFITS[outfit] ?? null;
  return MODELS[id] ?? null;
}

