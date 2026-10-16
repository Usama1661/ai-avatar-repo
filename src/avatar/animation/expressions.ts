import type { BlendshapeWeights } from '../model/blendshapes';
import type { ExpressionName } from '../types';

/** Shared by male and female meshes. Mouth shapes yield to lip-sync while speaking. */
export const EXPRESSION_PRESETS: Record<ExpressionName, BlendshapeWeights> = {
  neutral: {},
  happy: {
    mouthSmileLeft: 0.7,
    mouthSmileRight: 0.7,
    cheekSquintLeft: 0.3,
    cheekSquintRight: 0.3,
    eyeSquintLeft: 0.2,
    eyeSquintRight: 0.2,
  },
  sad: {
    mouthFrownLeft: 0.6,
    mouthFrownRight: 0.6,
    browInnerUp: 0.6,
    browDownLeft: 0.25,
    browDownRight: 0.25,
    eyeSquintLeft: 0.15,
    eyeSquintRight: 0.15,
  },
  angry: {
    browDownLeft: 0.8,
    browDownRight: 0.8,
    browInnerUp: 0.35,
    eyeSquintLeft: 0.35,
    eyeSquintRight: 0.35,
    noseSneerLeft: 0.3,
    noseSneerRight: 0.3,
    jawForward: 0.2,
    mouthFrownLeft: 0.25,
    mouthFrownRight: 0.25,
  },
  surprised: {
    eyeWideLeft: 0.7,
    eyeWideRight: 0.7,
    browInnerUp: 0.7,
    browOuterUpLeft: 0.6,
    browOuterUpRight: 0.6,
    jawOpen: 0.35,
  },
  thinking: {
    browInnerUp: 0.25,
    browDownLeft: 0.2,
    eyeLookUpLeft: 0.25,
    eyeLookUpRight: 0.25,
    mouthPucker: 0.12,
  },
};
