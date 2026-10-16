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
  sil: {},
  PP: { mouthClose: 0.8, mouthPressLeft: 0.4, mouthPressRight: 0.4, mouthPucker: 0.2 },
  FF: { mouthFunnel: 0.4, mouthLowerDownLeft: 0.3, mouthLowerDownRight: 0.3, jawOpen: 0.15 },
  TH: { mouthStretchLeft: 0.3, mouthStretchRight: 0.3, jawOpen: 0.2, tongueOut: 0.4 },
  DD: { jawOpen: 0.25, mouthUpperUpLeft: 0.3, mouthUpperUpRight: 0.3 },
  kk: { jawOpen: 0.3, mouthFunnel: 0.15 },
  CH: { jawOpen: 0.3, mouthFunnel: 0.35, mouthPucker: 0.2 },
  SS: { jawOpen: 0.15, mouthStretchLeft: 0.4, mouthStretchRight: 0.4 },
  nn: { jawOpen: 0.15, mouthClose: 0.3 },
  RR: { jawOpen: 0.2, mouthFunnel: 0.25, mouthPucker: 0.2 },
  aa: { jawOpen: 0.7, mouthLowerDownLeft: 0.3, mouthLowerDownRight: 0.3 },
  E: {
    jawOpen: 0.35,
    mouthSmileLeft: 0.4,
    mouthSmileRight: 0.4,
    mouthStretchLeft: 0.2,
    mouthStretchRight: 0.2,
  },
  ih: { jawOpen: 0.25, mouthSmileLeft: 0.25, mouthSmileRight: 0.25 },
  oh: { jawOpen: 0.45, mouthFunnel: 0.55, mouthPucker: 0.2 },
  ou: { jawOpen: 0.3, mouthFunnel: 0.35, mouthPucker: 0.55 },
};
