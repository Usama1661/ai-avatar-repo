import * as THREE from 'three';

import type { AvatarPose } from '../animation/animator';
import { NECK_BONE_SHARE } from '../model/boneMap';
import type { LoadedAvatar } from '../model/loadAvatar';
import type { BoneName, BoneRotation } from '../model/skeleton';

const deltaEuler = new THREE.Euler(0, 0, 0, 'XYZ');
const deltaQuaternion = new THREE.Quaternion();

export function applyPose(avatar: LoadedAvatar, pose: AvatarPose) {
  for (const mesh of avatar.morphMeshes) {
    const dictionary = mesh.morphTargetDictionary;
    const influences = mesh.morphTargetInfluences;
    if (!dictionary || !influences) continue;
    for (const [name, index] of Object.entries(dictionary)) {
      influences[index] = pose.weights[name as keyof typeof pose.weights] ?? 0;
    }
  }

  for (const [name, bones] of Object.entries(avatar.bones) as [BoneName, LoadedAvatar['bones'][BoneName]][]) {
    const rotation = pose.bones[name];
    const share = name === 'Neck' ? NECK_BONE_SHARE : 1;
    for (const bound of bones) {
      if (!rotation) {
        bound.bone.quaternion.copy(bound.rest);
        continue;
      }
      setDelta(rotation, share);
      bound.bone.quaternion.copy(bound.rest).multiply(deltaQuaternion);
    }
  }
}

function setDelta(rotation: BoneRotation, share: number) {
  deltaEuler.set(
    THREE.MathUtils.degToRad(rotation.x * share),
    THREE.MathUtils.degToRad(rotation.y * share),
    THREE.MathUtils.degToRad(rotation.z * share),
  );
  deltaQuaternion.setFromEuler(deltaEuler);
}
