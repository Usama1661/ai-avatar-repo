export type AvatarSex = 'female' | 'male';

/** Which bundled GLB to show. Female is reserved until that model is exported. */
export type AvatarModelId = AvatarSex;

/** Clothes bundled with the male human. `casual` is the black crew-neck. */
export type AvatarOutfit = 'casual';

export type ExpressionName =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'thinking';

/** Gaze direction in view space. 0 is toward the camera. Each axis is -1 to 1. */
export type GazeTarget = {
  x: number;
  y: number;
};

/**
 * A GLB/GLTF avatar. `source` is a Metro asset module from `require()`
 * or a `file://` URI already on device.
 */
export type AvatarModel = {
  sex: AvatarSex;
  source: number | string;
};

export type SpeakRequest = {
  text: string;
  voiceId?: string;
  /** Fired when TTS reaches a word (iOS/Android). Used to lock lip-sync. */
  onBoundary?: (event: { charIndex: number; charLength: number }) => void;
};

export type AvatarViewProps = {
  model?: AvatarModel;
  sex?: AvatarSex;
  expression?: ExpressionName;
  gaze?: GazeTarget;
  speak?: SpeakRequest | null;
};
