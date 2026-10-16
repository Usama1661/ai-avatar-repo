import type { BlendshapeName } from '../model/blendshapes';

/**
 * Later writers replace earlier ones on the same shape key.
 * Lip-sync owns the mouth. Blink owns the lids. Gaze owns eye direction.
 */
export const BLENDSHAPE_CHANNELS = {
  blink: ['eyeBlinkLeft', 'eyeBlinkRight'],
  gaze: [
    'eyeLookDownLeft',
    'eyeLookDownRight',
    'eyeLookInLeft',
    'eyeLookInRight',
    'eyeLookOutLeft',
    'eyeLookOutRight',
    'eyeLookUpLeft',
    'eyeLookUpRight',
  ],
  lipsync: [
    'jawOpen',
    'jawForward',
    'jawLeft',
    'jawRight',
    'mouthClose',
    'mouthFunnel',
    'mouthPucker',
    'mouthLeft',
    'mouthRight',
    'mouthSmileLeft',
    'mouthSmileRight',
    'mouthFrownLeft',
    'mouthFrownRight',
    'mouthDimpleLeft',
    'mouthDimpleRight',
    'mouthStretchLeft',
    'mouthStretchRight',
    'mouthRollLower',
    'mouthRollUpper',
    'mouthShrugLower',
    'mouthShrugUpper',
    'mouthPressLeft',
    'mouthPressRight',
    'mouthLowerDownLeft',
    'mouthLowerDownRight',
    'mouthUpperUpLeft',
    'mouthUpperUpRight',
    'tongueOut',
  ],
} as const satisfies Record<string, readonly BlendshapeName[]>;

export const BLINK_INTERVAL_MS = { min: 2400, max: 6000 } as const;
export const BLINK_DURATION_MS = 140;

/** Head idle and gaze stay inside these Euler degrees. */
export const HEAD_LIMITS_DEG = {
  neck: { x: 12, y: 18, z: 8 },
  head: { x: 16, y: 24, z: 10 },
  eye: { x: 18, y: 22, z: 0 },
} as const;
