import type { BlendshapeWeights } from './blendshapes';

/**
 * Oculus viseme set (15). Speech text and audio both resolve to this list
 * before they touch the mesh.
 */
export const VISEMES = [
  'sil',
  'PP',
  'FF',
  'TH',
  'DD',
  'kk',
  'CH',
  'SS',
  'nn',
  'RR',
  'aa',
  'E',
  'ih',
  'oh',
  'ou',
] as const;

export type VisemeId = (typeof VISEMES)[number];

export type VisemeCue = {
  /** Seconds from the start of the utterance. */
  time: number;
  viseme: VisemeId;
  /** 0 to 1. Neighboring cues are crossfaded. */
  weight: number;
};

/**
 * Starting weights for each viseme. Tuned once a real mesh is loaded.
 * `sil` is silence and leaves the mouth on the current expression.
 */
export const VISEME_BLENDSHAPES: Record<VisemeId, BlendshapeWeights> = {
  sil: { jawOpen: 0.05, mouthClose: 0.08 },
  PP: { jawOpen: 0, mouthClose: 0.9, mouthPressLeft: 0.45, mouthPressRight: 0.45 },
  FF: { jawOpen: 0.07, mouthLowerDownLeft: 0.4, mouthLowerDownRight: 0.4, mouthUpperUpLeft: 0.18, mouthUpperUpRight: 0.18 },
  TH: { jawOpen: 0.16, tongueOut: 0.28 },
  DD: { jawOpen: 0.14 },
  kk: { jawOpen: 0.2 },
  CH: { jawOpen: 0.18, mouthFunnel: 0.32, mouthPucker: 0.16 },
  SS: { jawOpen: 0.05, mouthStretchLeft: 0.32, mouthStretchRight: 0.32 },
  nn: { jawOpen: 0.08, mouthClose: 0.18 },
  RR: { jawOpen: 0.14, mouthPucker: 0.18, mouthFunnel: 0.12 },
  aa: { jawOpen: 0.58, mouthLowerDownLeft: 0.32, mouthLowerDownRight: 0.32 },
  E: { jawOpen: 0.3, mouthSmileLeft: 0.32, mouthSmileRight: 0.32, mouthStretchLeft: 0.24, mouthStretchRight: 0.24 },
  ih: { jawOpen: 0.16, mouthSmileLeft: 0.14, mouthSmileRight: 0.14 },
  oh: { jawOpen: 0.4, mouthFunnel: 0.48, mouthPucker: 0.12 },
  ou: { jawOpen: 0.14, mouthPucker: 0.55, mouthFunnel: 0.24 },
};
