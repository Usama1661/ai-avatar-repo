export { AIAvatar } from './AIAvatar';
export { AvatarView } from './AvatarView';
export { EXPRESSION_PRESETS } from './animation/expressions';
export { BLENDSHAPE_CHANNELS, BLINK_DURATION_MS, BLINK_INTERVAL_MS, HEAD_LIMITS_DEG } from './animation/channels';
export { ARKIT_BLENDSHAPES, BLENDSHAPES } from './model/blendshapes';
export { OPTIONAL_BONES, REQUIRED_BONES } from './model/skeleton';
export { VISEME_BLENDSHAPES, VISEMES } from './model/visemes';

export type { BlendshapeName, BlendshapeWeights } from './model/blendshapes';
export type { BoneName, BonePose, BoneRotation } from './model/skeleton';
export type { VisemeCue, VisemeId } from './model/visemes';
export type { SpeechResult, VoiceProvider } from './voice/types';
export type { AIAvatarHandle, AIAvatarProps } from './AIAvatar';
export type {
  AvatarModel,
  AvatarModelId,
  AvatarOutfit,
  AvatarSex,
  AvatarViewProps,
  ExpressionName,
  GazeTarget,
  SpeakRequest,
} from './types';
