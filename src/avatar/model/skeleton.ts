/**
 * Bones a GLB must drive. Both sexes use these contract names.
 * MPFB files keep their own bone names; the loader aliases them onto this list.
 */
export const REQUIRED_BONES = ['Neck', 'Head', 'LeftEye', 'RightEye'] as const;

/** Present when the mesh also drives the jaw with a bone. Lip-sync can use jawOpen alone. */
export const OPTIONAL_BONES = ['Jaw'] as const;

export type RequiredBoneName = (typeof REQUIRED_BONES)[number];
export type OptionalBoneName = (typeof OPTIONAL_BONES)[number];
export type BoneName = RequiredBoneName | OptionalBoneName;

/** Euler degrees, applied on top of the bind pose. */
export type BoneRotation = {
  x: number;
  y: number;
  z: number;
};

export type BonePose = Partial<Record<BoneName, BoneRotation>>;
