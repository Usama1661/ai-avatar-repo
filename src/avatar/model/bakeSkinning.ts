import * as THREE from 'three';

/**
 * Expo GL on the iOS Simulator cannot sample the float bone textures Three.js
 * uses for SkinnedMesh. Convert every skinned mesh to a plain Mesh at bind pose
 * so the avatar still draws. Face animation stays on CPU morphs; head turn is a
 * whole-body group rotation instead of bone skinning.
 */
export function bakeSkinningToStaticMeshes(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);
  const skinned: THREE.SkinnedMesh[] = [];
  scene.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) {
      skinned.push(object as THREE.SkinnedMesh);
    }
  });

  for (const source of skinned) {
    const parent = source.parent;
    if (!parent) continue;

    // Rest/bind pose → bone*inverse is identity, so buffer positions are correct.
    source.skeleton?.pose();
    source.updateMatrixWorld(true);

    const mesh = new THREE.Mesh(source.geometry, source.material);
    mesh.name = source.name;
    mesh.frustumCulled = false;
    mesh.castShadow = source.castShadow;
    mesh.receiveShadow = source.receiveShadow;
    mesh.visible = source.visible;
    mesh.layers.mask = source.layers.mask;
    mesh.position.copy(source.position);
    mesh.quaternion.copy(source.quaternion);
    mesh.scale.copy(source.scale);
    mesh.morphTargetDictionary = source.morphTargetDictionary
      ? { ...source.morphTargetDictionary }
      : undefined;
    mesh.morphTargetInfluences = source.morphTargetInfluences
      ? source.morphTargetInfluences.slice()
      : undefined;

    parent.add(mesh);
    parent.remove(source);
  }
}
