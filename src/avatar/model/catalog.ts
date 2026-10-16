import type { AvatarModelId } from '../types';

const MODELS: Partial<Record<AvatarModelId, number>> = {
  male: require('../../../assets/models/male-avatar.glb'),
};

export function avatarModelSource(id: AvatarModelId): number | null {
  return MODELS[id] ?? null;
}
