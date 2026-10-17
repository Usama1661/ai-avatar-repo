import * as THREE from 'three';

import type { AvatarPose } from '../animation/animator';
import { NECK_BONE_SHARE } from '../model/boneMap';
import { applyCpuMorphs } from '../model/cpuMorphs';
import { updateCpuSkins } from '../model/cpuSkin';
import type { LoadedAvatar } from '../model/loadAvatar';
import type { BoneName, BoneRotation } from '../model/skeleton';

const deltaEuler = new THREE.Euler(0, 0, 0, 'XYZ');
const deltaQuaternion = new THREE.Quaternion();
const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');

export function applyPose(avatar: LoadedAvatar, pose: AvatarPose) {
  applyCpuMorphs(avatar.cpuMorphs, pose.weights);

  for (const [name, bones] of Object.entries(avatar.bones) as [BoneName, NonNullable<LoadedAvatar['bones'][BoneName]>][]) {
    if (!bones) continue;
    const rotation = pose.bones[name];
    const share = name === 'Neck' && bones.length > 1 ? NECK_BONE_SHARE : 1;
    for (const bound of bones) {
      if (!rotation) {
        bound.bone.quaternion.copy(bound.rest);
        continue;
      }
      setDelta(rotation, share);
      bound.bone.quaternion.copy(bound.rest).multiply(deltaQuaternion);
    }
  }

  if (avatar.cpuSkins.length > 0) {
    avatar.lookGroup.quaternion.identity();
    avatar.scene.updateMatrixWorld(true);
    updateCpuSkins(avatar.cpuSkins);
    return;
  }

  // Static meshes have no skeleton to bend. Turn the whole figure instead.
  const head = pose.bones.Head;
  const neck = pose.bones.Neck;
  const pitch = ((head?.x ?? 0) + (neck?.x ?? 0)) * 0.55;
  const yaw = ((head?.y ?? 0) + (neck?.y ?? 0)) * 0.55;
  const roll = ((head?.z ?? 0) + (neck?.z ?? 0)) * 0.4;
  lookEuler.set(
    THREE.MathUtils.degToRad(pitch),
    THREE.MathUtils.degToRad(yaw),
    THREE.MathUtils.degToRad(roll),
  );
  avatar.lookGroup.quaternion.setFromEuler(lookEuler);
}

function setDelta(rotation: BoneRotation, share: number) {
  deltaEuler.set(
    THREE.MathUtils.degToRad(rotation.x * share),
    THREE.MathUtils.degToRad(rotation.y * share),
    THREE.MathUtils.degToRad(rotation.z * share),
  );
  deltaQuaternion.setFromEuler(deltaEuler);
}
