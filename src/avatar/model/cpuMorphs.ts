import * as THREE from 'three';

import type { BlendshapeWeights } from './blendshapes';

/**
 * Expo GL on iOS (especially the Simulator) often cannot sample the float
 * DataArrayTexture Three.js uses for morph targets. We strip GPU morphs and
 * apply the same deltas on the CPU so the body mesh still draws.
 */
export type CpuMorphMesh = {
  mesh: THREE.Mesh;
  dictionary: Record<string, number>;
  basePosition: Float32Array;
  baseNormal: Float32Array | null;
  positionDeltas: Float32Array[];
  normalDeltas: Float32Array[] | null;
  position: THREE.BufferAttribute;
  normal: THREE.BufferAttribute | null;
  scratchPosition: Float32Array;
  scratchNormal: Float32Array | null;
  lastKey: string;
  /** When set, expression offsets are stored here so CPU skinning can run after them. */
  morphOut?: Float32Array;
};

export function extractCpuMorphs(mesh: THREE.Mesh): CpuMorphMesh | null {
  const dictionary = mesh.morphTargetDictionary;
  const geometry = mesh.geometry;
  const morphPositions = geometry.morphAttributes.position;
  if (!dictionary || !morphPositions || morphPositions.length === 0) return null;

  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute | null;
  const morphNormals = geometry.morphAttributes.normal;

  const basePosition = floatCopy(position);
  const baseNormal = normal ? floatCopy(normal) : null;
  const positionDeltas = morphPositions.map((attr) => floatCopy(attr as THREE.BufferAttribute));
  const normalDeltas =
    normal && morphNormals && morphNormals.length === morphPositions.length
      ? morphNormals.map((attr) => floatCopy(attr as THREE.BufferAttribute))
      : null;

  // Drop GPU morphs so Three.js never uploads a float morph texture.
  geometry.morphAttributes = {};
  delete mesh.morphTargetDictionary;
  delete mesh.morphTargetInfluences;

  return {
    mesh,
    dictionary: { ...dictionary },
    basePosition,
    baseNormal,
    positionDeltas,
    normalDeltas,
    position,
    normal,
    scratchPosition: new Float32Array(basePosition.length),
    scratchNormal: baseNormal ? new Float32Array(baseNormal.length) : null,
    lastKey: '',
  };
}

export function applyCpuMorphs(targets: CpuMorphMesh[], weights: BlendshapeWeights) {
  const key = weightKey(weights);
  for (const target of targets) {
    if (target.lastKey === key) continue;
    target.lastKey = key;
    const { scratchPosition, basePosition, positionDeltas, dictionary } = target;
    scratchPosition.set(basePosition);

    for (const [name, weight] of Object.entries(weights)) {
      if (!weight) continue;
      const index = dictionary[name];
      if (index === undefined) continue;
      const delta = positionDeltas[index];
      if (!delta) continue;
      const amount = weight;
      for (let i = 0; i < scratchPosition.length; i += 1) {
        scratchPosition[i] += delta[i] * amount;
      }
    }

    if (target.morphOut) {
      const morph = target.morphOut;
      const base = target.basePosition;
      for (let i = 0; i < scratchPosition.length; i += 1) morph[i] = scratchPosition[i] - base[i];
    } else {
      (target.position.array as Float32Array).set(scratchPosition);
      target.position.needsUpdate = true;
    }

    if (target.scratchNormal && target.baseNormal && target.normal && target.normalDeltas) {
      const scratchNormal = target.scratchNormal;
      scratchNormal.set(target.baseNormal);
      for (const [name, weight] of Object.entries(weights)) {
        if (!weight) continue;
        const index = dictionary[name];
        if (index === undefined) continue;
        const delta = target.normalDeltas[index];
        if (!delta) continue;
        for (let i = 0; i < scratchNormal.length; i += 1) {
          scratchNormal[i] += delta[i] * weight;
        }
      }
      (target.normal.array as Float32Array).set(scratchNormal);
      target.normal.needsUpdate = true;
    }
  }
}

function floatCopy(attr: THREE.BufferAttribute): Float32Array {
  const array = attr.array;
  return array instanceof Float32Array ? new Float32Array(array) : Float32Array.from(array as ArrayLike<number>);
}

function weightKey(weights: BlendshapeWeights): string {
  const parts: string[] = [];
  for (const [name, weight] of Object.entries(weights)) {
    if (!weight || weight < 0.001) continue;
    parts.push(`${name}:${weight.toFixed(3)}`);
  }
  return parts.join('|');
}
