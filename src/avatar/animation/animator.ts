import { BLENDSHAPE_CHANNELS, BLINK_DURATION_MS, BLINK_INTERVAL_MS, HEAD_LIMITS_DEG } from './channels';
import { EXPRESSION_PRESETS } from './expressions';
import type { BlendshapeName, BlendshapeWeights } from '../model/blendshapes';
import type { BonePose } from '../model/skeleton';
import type { ExpressionName } from '../types';
import { approximateMouthCues, mouthWeightsAt } from '../speech/approximateMouth';
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
const MOUTH_RATE = 18;

/**
 * Frame-independent face pose. Rendering only applies the result.
 * Mouth cues are a timed guess and are cleared as soon as speech stops.
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
  private speech: { cues: VisemeCue[]; startedAt: number | null } | null = null;

  setExpression(expression: ExpressionName) {
    this.expression = expression;
  }

  setFlags(flags: Flags) {
    this.flags = flags;
  }

  beginSpeech(text: string) {
    this.speech = { cues: approximateMouthCues(text), startedAt: null };
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
    if (this.nextSaccadeAt === 0) this.nextSaccadeAt = now + 1.2;

    const target = this.targetWeights(now);
    for (const name of keyedNames(target, this.weights)) {
      const next = target[name] ?? 0;
      const rate = isLipsync(name) ? MOUTH_RATE : EXPRESSION_RATE;
      const direct = (BLENDSHAPE_CHANNELS.blink as readonly string[]).includes(name);
      this.weights[name] = direct ? next : approach(this.weights[name] ?? 0, next, dt, rate);
      if ((this.weights[name] ?? 0) < 0.001) delete this.weights[name];
    }

    const head = this.flags.head ? idleHead(now) : { neck: zero(), head: zero() };
    const eyes = this.flags.eyes ? this.eyePose(dt, now) : { x: 0, y: 0, z: 0 };
    this.bones.Neck = approachRotation(this.bones.Neck ?? zero(), head.neck, dt, 3);
    this.bones.Head = approachRotation(this.bones.Head ?? zero(), head.head, dt, 3);
    this.bones.LeftEye = approachRotation(this.bones.LeftEye ?? zero(), eyes, dt, 10);
    this.bones.RightEye = approachRotation(this.bones.RightEye ?? zero(), eyes, dt, 10);
    this.bones.Jaw = zero();

    return { weights: { ...this.weights }, bones: clonePose(this.bones) };
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
    }

    if (this.speech) {
      if (this.speech.startedAt === null) this.speech.startedAt = now;
      const mouth = mouthWeightsAt(this.speech.cues, now - this.speech.startedAt);
      for (const name of BLENDSHAPE_CHANNELS.lipsync) target[name] = mouth[name] ?? 0;
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
    if (now >= this.nextSaccadeAt) {
      const glance = Math.random() < 0.2;
      this.gazeTarget = glance
        ? { x: (Math.random() * 2 - 1) * 0.08, y: (Math.random() * 2 - 1) * 0.04 }
        : { x: 0, y: 0 };
      this.nextSaccadeAt = now + (glance ? 0.16 + Math.random() * 0.2 : 1.6 + Math.random() * 2.2);
    }
    this.gaze.x = approach(this.gaze.x, this.gazeTarget.x, dt, 8);
    this.gaze.y = approach(this.gaze.y, this.gazeTarget.y, dt, 8);
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

function idleHead(now: number) {
  const yaw = Math.sin(now * 0.27) * 2.2;
  const pitch = Math.sin(now * 0.19) * 1.5;
  const roll = Math.sin(now * 0.13) * 1;
  return {
    neck: clampRotation(
      { x: pitch * 0.45, y: yaw * 0.35, z: roll * 0.4 },
      HEAD_LIMITS_DEG.neck,
    ),
    head: clampRotation(
      { x: pitch * 0.7, y: yaw * 0.6, z: roll },
      HEAD_LIMITS_DEG.head,
    ),
  };
}

function isLipsync(name: BlendshapeName) {
  return (BLENDSHAPE_CHANNELS.lipsync as readonly BlendshapeName[]).includes(name);
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
