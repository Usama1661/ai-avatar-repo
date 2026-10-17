import type { BoneName } from './skeleton';

/**
 * MPFB default-rig names, then the names Three.js actually puts on the
 * objects. Dots are stripped on load (`eye.L` becomes `eyeL`) because they
 * are reserved in animation paths. The GLB itself is left unchanged.
 */
export const MPFB_BONE_SOURCES: Record<BoneName, readonly string[]> = {
  Head: ['head', 'Head', 'mixamorigHead'],
  Neck: ['neck01', 'neck02', 'neck03', 'Neck', 'mixamorigNeck'],
  LeftEye: ['eye.L', 'eyeL', 'LeftEye'],
  RightEye: ['eye.R', 'eyeR', 'RightEye'],
  Jaw: ['jaw', 'Jaw'],
};

/** Neck rotation is shared across the three neck bones so one control does not triple the bend. */
export const NECK_BONE_SHARE = 1 / 3;
