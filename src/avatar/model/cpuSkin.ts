import * as THREE from 'three';

/**
 * Expo GL cannot sample the float bone texture Three.js uses for SkinnedMesh.
 * The mesh is drawn as a plain Mesh, and bone motion is applied on the CPU.
 */
export type CpuSkin = {
  position: THREE.BufferAttribute;
  bind: Float32Array;
  /** Added to the bind position before skinning. Face shapes write this. */
  morph: Float32Array;
  skinIndex: THREE.BufferAttribute;
  skinWeight: THREE.BufferAttribute;
  skeleton: THREE.Skeleton;
  bindMatrix: THREE.Matrix4;
  bindMatrixInverse: THREE.Matrix4;
  boneMatrices: THREE.Matrix4[];
};

const composed = new THREE.Matrix4();

export function createCpuSkins(scene: THREE.Object3D): CpuSkin[] {
  const skinned: THREE.SkinnedMesh[] = [];
  scene.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(object as THREE.SkinnedMesh);
  });

  const skins: CpuSkin[] = [];
  for (const source of skinned) {
    const parent = source.parent;
    const geometry = source.geometry;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    const skinIndex = geometry.getAttribute('skinIndex') as THREE.BufferAttribute | undefined;
    const skinWeight = geometry.getAttribute('skinWeight') as THREE.BufferAttribute | undefined;
    if (!parent || !source.skeleton || !position || !skinIndex || !skinWeight) continue;

    source.updateMatrixWorld(true);
    const mesh = new THREE.Mesh(geometry, source.material);
    mesh.name = source.name;
    mesh.frustumCulled = false;
    mesh.position.copy(source.position);
    mesh.quaternion.copy(source.quaternion);
    mesh.scale.copy(source.scale);
    mesh.morphTargetDictionary = source.morphTargetDictionary ? { ...source.morphTargetDictionary } : undefined;
    mesh.morphTargetInfluences = source.morphTargetInfluences ? source.morphTargetInfluences.slice() : undefined;
    parent.add(mesh);
    parent.remove(source);

    skins.push({
      position,
      bind: Float32Array.from(position.array as ArrayLike<number>),
      morph: new Float32Array(position.count * 3),
      skinIndex,
      skinWeight,
      skeleton: source.skeleton,
      bindMatrix: source.bindMatrix.clone(),
      bindMatrixInverse: source.bindMatrixInverse.clone(),
      boneMatrices: source.skeleton.bones.map(() => new THREE.Matrix4()),
    });
  }
  return skins;
}

export function updateCpuSkins(skins: CpuSkin[]) {
  for (const skin of skins) {
    const { skeleton, boneMatrices, bindMatrix, bindMatrixInverse } = skin;
    const bones = skeleton.bones;
    const inverses = skeleton.boneInverses;
    for (let bone = 0; bone < bones.length; bone += 1) {
      composed.multiplyMatrices(bones[bone].matrixWorld, inverses[bone]);
      composed.multiply(bindMatrix);
      boneMatrices[bone].multiplyMatrices(bindMatrixInverse, composed);
    }

    const out = skin.position.array as Float32Array;
    const bind = skin.bind;
    const morph = skin.morph;
    const indices = skin.skinIndex.array as ArrayLike<number>;
    const weights = skin.skinWeight.array as ArrayLike<number>;
    const stride = skin.skinIndex.itemSize;
    const count = skin.position.count;

    for (let vertex = 0; vertex < count; vertex += 1) {
      const x = bind[vertex * 3] + morph[vertex * 3];
      const y = bind[vertex * 3 + 1] + morph[vertex * 3 + 1];
      const z = bind[vertex * 3 + 2] + morph[vertex * 3 + 2];
      let ox = 0;
      let oy = 0;
      let oz = 0;
      const base = vertex * stride;
      for (let influence = 0; influence < stride; influence += 1) {
        const weight = weights[base + influence];
        if (weight === 0) continue;
        const elements = boneMatrices[indices[base + influence]].elements;
        ox += weight * (elements[0] * x + elements[4] * y + elements[8] * z + elements[12]);
        oy += weight * (elements[1] * x + elements[5] * y + elements[9] * z + elements[13]);
        oz += weight * (elements[2] * x + elements[6] * y + elements[10] * z + elements[14]);
      }
      out[vertex * 3] = ox;
      out[vertex * 3 + 1] = oy;
      out[vertex * 3 + 2] = oz;
    }
    skin.position.needsUpdate = true;
  }
}
