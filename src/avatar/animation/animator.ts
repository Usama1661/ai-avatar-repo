import { BLENDSHAPE_CHANNELS, BLINK_DURATION_MS, BLINK_INTERVAL_MS, HEAD_LIMITS_DEG } from './channels';
import { EXPRESSION_PRESETS } from './expressions';
import type { BlendshapeName, BlendshapeWeights } from '../model/blendshapes';
import type { BonePose } from '../model/skeleton';
import type { ExpressionName } from '../types';
import {
  buildMouthWords,
  mouthWeightsAt,
  scaledWordCues,
  type MouthWord,
} from '../speech/approximateMouth';
import type { VisemeCue } from '../model/visemes';

export type AvatarPose = {
  weights: BlendshapeWeights;
  bones: BonePose;
};

type Flags = {
  blink: boolean;
  head: boolean;
  eyes: boolean;
};

const EXPRESSION_RATE = 6;

/**
 * Frame-independent face pose. Rendering only applies the result.
 * Mouth cues follow spoken word boundaries from the voice provider.
 */
export class AvatarAnimator {
  private expression: ExpressionName = 'neutral';
  private flags: Flags = { blink: true, head: true, eyes: true };
  private weights: BlendshapeWeights = {};
  private bones: Required<BonePose> = {
    Neck: { x: 0, y: 0, z: 0 },
    Head: { x: 0, y: 0, z: 0 },
    LeftEye: { x: 0, y: 0, z: 0 },
    RightEye: { x: 0, y: 0, z: 0 },
    Jaw: { x: 0, y: 0, z: 0 },
  };
  private lastTime: number | null = null;
  private nextBlinkAt = 0;
  private blinkStarted = false;
  private blinkAt = 0;
  private gaze = { x: 0, y: 0 };
  private gazeTarget = { x: 0, y: 0 };
  private nextSaccadeAt = 0;
  private speech: {
    words: MouthWord[];
    wordIndex: number;
    cues: VisemeCue[];
    cueStartedAt: number | null;
    armedAt: number | null;
    secondsPerUnit: number;
    boundarySeen: boolean;
    text: string;
  } | null = null;

  setExpression(expression: ExpressionName) {
    this.expression = expression;
  }

  setFlags(flags: Flags) {
    this.flags = flags;
  }

  beginSpeech(text: string) {
    const words = buildMouthWords(text);
    this.speech = {
      words,
      wordIndex: -1,
      cues: [{ time: 0, viseme: 'sil', weight: 1 }],
      cueStartedAt: null,
      armedAt: null,
      secondsPerUnit: 1,
      boundarySeen: false,
      text,
    };
  }

  /** Lock mouth shapes to the word the TTS engine is about to speak. */
  setSpeechBoundary(charIndex: number, charLength: number) {
    if (!this.speech) return;
    const index = wordIndexAt(this.speech.words, charIndex, charLength);
    if (index < 0) return;
    const now = this.lastTime;
    if (
      now !== null &&
      this.speech.wordIndex >= 0 &&
      this.speech.wordIndex !== index &&
      this.speech.cueStartedAt !== null
    ) {
      const previous = this.speech.words[this.speech.wordIndex];
      const spoken = Math.max(0.06, now - this.speech.cueStartedAt);
      if (previous && previous.duration > 0.04) {
        const measured = spoken / previous.duration;
        this.speech.secondsPerUnit = this.speech.secondsPerUnit * 0.4 + measured * 0.6;
      }
    }
    this.speech.boundarySeen = true;
    this.startWord(index, now);
  }

  endSpeech() {
    this.speech = null;
  }

  get speaking() {
    return this.speech !== null;
  }

  sample(now: number): AvatarPose {
    const dt = this.lastTime === null ? 0 : Math.min(0.05, Math.max(0, now - this.lastTime));
    this.lastTime = now;
    if (this.nextBlinkAt === 0) this.scheduleBlink(now);
    if (this.nextSaccadeAt === 0) this.nextSaccadeAt = now + 2.4;

    const target = this.targetWeights(now);
    for (const name of keyedNames(target, this.weights)) {
      const next = target[name] ?? 0;
      const blink = (BLENDSHAPE_CHANNELS.blink as readonly string[]).includes(name);
      const rate = isLipsync(name) ? mouthEase(name) : EXPRESSION_RATE;
      // The jaw has weight. Blink still cuts in immediately.
      this.weights[name] = blink ? next : approach(this.weights[name] ?? 0, next, dt, rate);
      if ((this.weights[name] ?? 0) < 0.001) delete this.weights[name];
    }

    const head = this.flags.head ? idleHead(now, this.speech !== null) : { neck: zero(), head: zero() };
    const eyes = this.flags.eyes ? this.eyePose(dt, now) : { x: 0, y: 0, z: 0 };
    this.bones.Neck = approachRotation(this.bones.Neck ?? zero(), head.neck, dt, 3);
    this.bones.Head = approachRotation(this.bones.Head ?? zero(), head.head, dt, 3);
    this.bones.LeftEye = approachRotation(this.bones.LeftEye ?? zero(), eyes, dt, 12);
    this.bones.RightEye = approachRotation(this.bones.RightEye ?? zero(), eyes, dt, 12);
    this.bones.Jaw = zero();

    return { weights: { ...this.weights }, bones: clonePose(this.bones) };
  }

  private startWord(index: number, now: number | null) {
    if (!this.speech || index < 0 || index >= this.speech.words.length) return;
    if (index === this.speech.wordIndex && this.speech.cueStartedAt !== null) return;
    const word = this.speech.words[index];
    const duration = clamp(word.duration * this.speech.secondsPerUnit, 0.16, 0.9);
    this.speech.wordIndex = index;
    this.speech.cues = scaledWordCues(word, duration);
    this.speech.cueStartedAt = now;
  }

  private targetWeights(now: number): BlendshapeWeights {
    const target: BlendshapeWeights = { ...EXPRESSION_PRESETS[this.expression] };

    if (this.flags.eyes) {
      for (const name of BLENDSHAPE_CHANNELS.gaze) target[name] = 0;
      const x = this.gaze.x;
      const y = this.gaze.y;
      target.eyeLookOutLeft = clamp01(x);
      target.eyeLookInLeft = clamp01(-x);
      target.eyeLookInRight = clamp01(x);
      target.eyeLookOutRight = clamp01(-x);
      target.eyeLookUpLeft = clamp01(y);
      target.eyeLookUpRight = clamp01(y);
      target.eyeLookDownLeft = clamp01(-y);
      target.eyeLookDownRight = clamp01(-y);
      // A little inward look so both eyes meet the person at the phone.
      target.eyeLookInLeft = Math.max(target.eyeLookInLeft ?? 0, 0.16);
      target.eyeLookInRight = Math.max(target.eyeLookInRight ?? 0, 0.16);
    }

    if (this.speech) {
      if (this.speech.armedAt === null) this.speech.armedAt = now;
      if (this.speech.wordIndex < 0) {
        // The first boundary starts the mouth with the voice. If none arrives, start anyway.
        if (!this.speech.boundarySeen && now - this.speech.armedAt > 0.22) this.startWord(0, now);
      } else if (this.speech.cueStartedAt !== null && !this.speech.boundarySeen) {
        const elapsed = now - this.speech.cueStartedAt;
        const end = this.speech.cues[this.speech.cues.length - 1]?.time ?? 0;
        if (elapsed > end && this.speech.wordIndex < this.speech.words.length - 1) {
          this.startWord(this.speech.wordIndex + 1, now);
        }
      }
      if (this.speech.cueStartedAt === null) this.speech.cueStartedAt = now;
      const mouth = mouthWeightsAt(this.speech.cues, now - this.speech.cueStartedAt);
      for (const name of BLENDSHAPE_CHANNELS.lipsync) target[name] = mouth[name] ?? 0;
      // Eyes meet the person in front of the camera.
      target.eyeLookOutLeft = 0;
      target.eyeLookOutRight = 0;
      target.eyeLookUpLeft = 0;
      target.eyeLookUpRight = 0;
      target.eyeLookDownLeft = 0;
      target.eyeLookDownRight = 0;
      target.eyeLookInLeft = 0.2;
      target.eyeLookInRight = 0.2;
    }

    const blink = this.flags.blink ? this.blinkWeight(now) : 0;
    target.eyeBlinkLeft = Math.max(target.eyeBlinkLeft ?? 0, blink);
    target.eyeBlinkRight = Math.max(target.eyeBlinkRight ?? 0, blink);
    return target;
  }

  private blinkWeight(now: number): number {
    const duration = BLINK_DURATION_MS / 1000;
    if (!this.blinkStarted && now >= this.nextBlinkAt) {
      this.blinkStarted = true;
      this.blinkAt = now;
    }
    if (!this.blinkStarted) return 0;

    const elapsed = now - this.blinkAt;
    const total = duration * 2;
    if (elapsed >= total) {
      this.blinkStarted = false;
      this.scheduleBlink(now);
      return 0;
    }
    if (elapsed < duration) return smoothstep(elapsed / duration);
    return 1 - smoothstep((elapsed - duration) / duration);
  }

  private eyePose(dt: number, now: number) {
    // Mostly look straight at the user/camera; rare tiny glances only.
    if (now >= this.nextSaccadeAt) {
      const glance = Math.random() < 0.12;
      this.gazeTarget = glance
        ? { x: (Math.random() * 2 - 1) * 0.035, y: (Math.random() * 2 - 1) * 0.02 }
        : { x: 0, y: 0 };
      this.nextSaccadeAt = now + (glance ? 0.14 + Math.random() * 0.16 : 2.8 + Math.random() * 3.2);
    }
    this.gaze.x = approach(this.gaze.x, this.gazeTarget.x, dt, 10);
    this.gaze.y = approach(this.gaze.y, this.gazeTarget.y, dt, 10);
    return {
      x: this.gaze.y * HEAD_LIMITS_DEG.eye.x,
      y: this.gaze.x * HEAD_LIMITS_DEG.eye.y,
      z: 0,
    };
  }

  private scheduleBlink(now: number) {
    const span = BLINK_INTERVAL_MS.max - BLINK_INTERVAL_MS.min;
    this.nextBlinkAt = now + (BLINK_INTERVAL_MS.min + Math.random() * span) / 1000;
  }
}

function wordIndexAt(words: MouthWord[], charIndex: number, charLength: number): number {
  const end = charIndex + Math.max(charLength, 1);
  const inside = words.findIndex((word) => charIndex >= word.start && charIndex < word.end);
  if (inside >= 0) return inside;
  const ahead = words.findIndex((word) => word.start >= charIndex && word.start < end);
  if (ahead >= 0) return ahead;
  let nearest = -1;
  for (let index = 0; index < words.length; index += 1) {
    if (words[index].start <= charIndex) nearest = index;
  }
  return nearest;
}

function idleHead(now: number, speaking: boolean) {
  // Face the camera. A nod while speaking, almost no turn away.
  if (speaking) {
    const nod = Math.sin(now * 2.1) * 1.6;
    return {
      neck: { x: nod * 0.35, y: 0, z: 0 },
      head: { x: nod * 0.7, y: 0, z: 0 },
    };
  }
  const yaw = Math.sin(now * 0.22) * 1.1;
  const pitch = Math.sin(now * 0.18) * 1;
  return {
    neck: clampRotation({ x: pitch * 0.3, y: yaw * 0.2, z: 0 }, HEAD_LIMITS_DEG.neck),
    head: clampRotation({ x: pitch * 0.4, y: yaw * 0.3, z: 0 }, HEAD_LIMITS_DEG.head),
  };
}

function isLipsync(name: BlendshapeName) {
  return (BLENDSHAPE_CHANNELS.lipsync as readonly BlendshapeName[]).includes(name);
}

function mouthEase(name: string): number {
  if (name === 'jawOpen') return 12;
  if (name === 'mouthClose' || name.startsWith('mouthPress')) return 22;
  return 16;
}

function keyedNames(target: BlendshapeWeights, current: BlendshapeWeights): BlendshapeName[] {
  return [...new Set([...Object.keys(target), ...Object.keys(current)])] as BlendshapeName[];
}

function approach(current: number, target: number, dt: number, rate: number): number {
  if (dt <= 0) return target;
  const step = 1 - Math.exp(-rate * dt);
  return current + (target - current) * step;
}

function approachRotation(
  current: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
  dt: number,
  rate: number,
) {
  return {
    x: approach(current.x, target.x, dt, rate),
    y: approach(current.y, target.y, dt, rate),
    z: approach(current.z, target.z, dt, rate),
  };
}

function clampRotation(
  rotation: { x: number; y: number; z: number },
  limits: { x: number; y: number; z: number },
) {
  return {
    x: clamp(rotation.x, -limits.x, limits.x),
    y: clamp(rotation.y, -limits.y, limits.y),
    z: clamp(rotation.z, -limits.z, limits.z),
  };
}

function zero() {
  return { x: 0, y: 0, z: 0 };
}

function clonePose(pose: Required<BonePose>): BonePose {
  return {
    Neck: { ...pose.Neck! },
    Head: { ...pose.Head! },
    LeftEye: { ...pose.LeftEye! },
    RightEye: { ...pose.RightEye! },
    Jaw: { ...pose.Jaw! },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function smoothstep(t: number) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}
