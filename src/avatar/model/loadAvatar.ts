import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { MPFB_BONE_SOURCES } from './boneMap';
import { BLENDSHAPES } from './blendshapes';
import type { BoneName } from './skeleton';

export type BoundBone = {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
};

export type LoadedAvatar = {
  scene: THREE.Group;
  morphMeshes: THREE.Mesh[];
  bones: Record<BoneName, BoundBone[]>;
  frameCamera: (camera: THREE.PerspectiveCamera) => void;
  dispose: () => void;
};

type GlbImage = {
  bufferView?: number;
  mimeType?: string;
};

type GlbMaterial = {
  name?: string;
  pbrMetallicRoughness?: {
    baseColorTexture?: { index?: number };
  };
};

type GlbJson = {
  bufferViews?: { byteOffset?: number; byteLength: number }[];
  images?: GlbImage[];
  textures?: { source?: number }[];
  materials?: GlbMaterial[];
};

export async function loadAvatar(
  moduleId: number,
  onProgress?: (status: string) => void,
): Promise<LoadedAvatar> {
  onProgress?.('Reading model…');
  const buffer = await withTimeout(readModel(moduleId), 20000, 'Reading the model');
  // GLTFLoader turns embedded PNGs into blob: URLs. Those requests hang on
  // iOS, so the scene promise never resolves. Parse the rig without images,
  // then attach the same PNGs through a local file Expo GL can upload.
  onProgress?.('Parsing model…');
  const gltf = await withTimeout(
    parseGltf(Platform.OS === 'web' ? buffer : glbWithoutTextureRefs(buffer)),
    20000,
    'Parsing the model',
  );
  const scene = gltf.scene;
  onProgress?.('Loading textures…');
  await withTimeout(attachMissingTextures(scene, buffer), 20000, 'Loading textures');

  const morphMeshes: THREE.Mesh[] = [];
  const found = new Set<string>();
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
    morphMeshes.push(mesh);
    for (const name of Object.keys(mesh.morphTargetDictionary)) found.add(name);
  });

  const missingMorphs = BLENDSHAPES.filter((name) => !found.has(name));
  if (missingMorphs.length > 0) {
    throw new Error(`GLB is missing ARKit morph targets: ${missingMorphs.join(', ')}`);
  }

  const byName = new Map<string, THREE.Bone>();
  scene.traverse((object) => {
    if ((object as THREE.Bone).isBone) byName.set(object.name, object as THREE.Bone);
  });

  const bones = {} as Record<BoneName, BoundBone[]>;
  for (const [contractName, sources] of Object.entries(MPFB_BONE_SOURCES) as [BoneName, readonly string[]][]) {
    const bound: BoundBone[] = [];
    for (const sourceName of sources) {
      const bone = byName.get(sourceName);
      if (!bone || bound.some((item) => item.bone === bone)) continue;
      bound.push({ bone, rest: bone.quaternion.clone() });
    }
    if (bound.length === 0) {
      throw new Error(`GLB is missing a bone for ${contractName}. Looked for ${sources.join(', ')}.`);
    }
    bones[contractName] = bound;
  }

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) mesh.frustumCulled = false;
  });

  return {
    scene,
    morphMeshes,
    bones,
    frameCamera: (camera) => frameOnFace(bones, camera),
    dispose: () => disposeScene(scene),
  };
}

async function readModel(moduleId: number): Promise<ArrayBuffer> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error(`Could not fetch the avatar model (${response.status}).`);
    return response.arrayBuffer();
  }
  const bytes = await new File(uri).bytes();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function parseGltf(buffer: ArrayBuffer): Promise<{ scene: THREE.Group }> {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(buffer, '', (gltf) => resolve(gltf), (error) => reject(error));
  });
}

async function attachMissingTextures(scene: THREE.Group, buffer: ArrayBuffer) {
  const images = materialImages(buffer);
  const textures = new Map<string, THREE.Texture>();
  const pending: Promise<void>[] = [];
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!isStandard(material) || material.map) continue;
      const image = images.get(material.name);
      if (!image || textures.has(material.name)) continue;
      pending.push(
        textureFromBytes(material.name, image.bytes, image.mime).then((texture) => {
          textures.set(material.name, texture);
          material.map = texture;
          tuneMaterial(material);
          material.needsUpdate = true;
        }),
      );
    }
  });
  await Promise.all(pending);

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (isStandard(material)) tuneMaterial(material);
    }
  });
}

function materialImages(buffer: ArrayBuffer): Map<string, { bytes: Uint8Array; mime: string }> {
  const { json, bin } = readGlb(buffer);
  const images = new Map<string, { bytes: Uint8Array; mime: string }>();
  for (const material of json.materials ?? []) {
    if (!material.name) continue;
    const textureIndex = material.pbrMetallicRoughness?.baseColorTexture?.index;
    if (textureIndex === undefined) continue;
    const imageIndex = json.textures?.[textureIndex]?.source;
    if (imageIndex === undefined) continue;
    const image = json.images?.[imageIndex];
    if (!image || image.bufferView === undefined) continue;
    const view = json.bufferViews?.[image.bufferView];
    if (!view) continue;
    const start = view.byteOffset ?? 0;
    images.set(material.name, {
      bytes: bin.slice(start, start + view.byteLength),
      mime: image.mimeType ?? 'image/png',
    });
  }
  return images;
}

const TEXTURE_KEYS = [
  'baseColorTexture',
  'metallicRoughnessTexture',
  'normalTexture',
  'occlusionTexture',
  'emissiveTexture',
] as const;

function glbWithoutTextureRefs(buffer: ArrayBuffer): ArrayBuffer {
  const { json, bin } = readGlb(buffer);
  const materials = (json.materials ?? []) as Array<Record<string, unknown>>;
  for (const material of materials) {
    for (const key of TEXTURE_KEYS) delete material[key];
    const pbr = material.pbrMetallicRoughness;
    if (pbr && typeof pbr === 'object') {
      const surface = pbr as Record<string, unknown>;
      for (const key of TEXTURE_KEYS) delete surface[key];
    }
  }

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadding = (4 - (jsonBytes.byteLength % 4)) % 4;
  const binPadding = (4 - (bin.byteLength % 4)) % 4;
  const total = 12 + 8 + jsonBytes.byteLength + jsonPadding + 8 + bin.byteLength + binPadding;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);

  let offset = 12;
  view.setUint32(offset, jsonBytes.byteLength + jsonPadding, true);
  view.setUint32(offset + 4, 0x4e4f534a, true);
  out.set(jsonBytes, offset + 8);
  out.fill(0x20, offset + 8 + jsonBytes.byteLength, offset + 8 + jsonBytes.byteLength + jsonPadding);
  offset += 8 + jsonBytes.byteLength + jsonPadding;

  view.setUint32(offset, bin.byteLength + binPadding, true);
  view.setUint32(offset + 4, 0x004e4942, true);
  out.set(bin, offset + 8);
  return out.buffer;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out.`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function readGlb(buffer: ArrayBuffer): { json: GlbJson; bin: Uint8Array } {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Avatar file is not a GLB.');
  let offset = 12;
  let json: GlbJson | null = null;
  let bin = new Uint8Array();
  while (offset + 8 <= buffer.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, length))) as GlbJson;
    } else if (type === 0x004e4942) {
      bin = new Uint8Array(buffer, start, length);
    }
    offset = start + length;
  }
  if (!json) throw new Error('Avatar GLB is missing its JSON chunk.');
  return { json, bin };
}

async function textureFromBytes(name: string, bytes: Uint8Array, mime: string): Promise<THREE.Texture> {
  if (Platform.OS === 'web') {
    const blob = new Blob([Uint8Array.from(bytes)], { type: mime });
    const url = URL.createObjectURL(blob);
    const texture = await new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(url, resolve, undefined, reject);
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
  }

  const extension = mime.includes('jpeg') ? 'jpg' : 'png';
  const file = new File(Paths.cache, `avatar-${name.replace(/[^\w-]+/g, '_')}.${extension}`);
  file.create({ overwrite: true, intermediates: true });
  file.write(bytes);
  const { width, height } = imageSize(bytes);
  const texture = new THREE.Texture();
  texture.image = { data: { localUri: file.uri }, width, height };
  texture.flipY = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  (texture as THREE.Texture & { isDataTexture?: boolean }).isDataTexture = true;
  return texture;
}

function imageSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (png) return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
  throw new Error('Avatar texture is not a PNG.');
}

function tuneMaterial(material: THREE.MeshStandardMaterial) {
  const name = material.name.toLowerCase();
  if (name.includes('hair') || name.includes('eyebrow')) {
    material.transparent = true;
    material.depthWrite = false;
    material.side = THREE.DoubleSide;
    material.alphaTest = 0.05;
  } else if (name.includes('eye')) {
    material.transparent = true;
    material.depthWrite = true;
    material.side = THREE.DoubleSide;
  } else {
    material.transparent = false;
    material.depthWrite = true;
    material.side = THREE.FrontSide;
  }
}

function isStandard(material: THREE.Material): material is THREE.MeshStandardMaterial {
  return 'map' in material;
}

function frameOnFace(bones: Record<BoneName, BoundBone[]>, camera: THREE.PerspectiveCamera) {
  const head = new THREE.Vector3();
  const left = new THREE.Vector3();
  const right = new THREE.Vector3();
  bones.Head[0].bone.updateWorldMatrix(true, false);
  bones.LeftEye[0].bone.updateWorldMatrix(true, false);
  bones.RightEye[0].bone.updateWorldMatrix(true, false);
  bones.Head[0].bone.getWorldPosition(head);
  bones.LeftEye[0].bone.getWorldPosition(left);
  bones.RightEye[0].bone.getWorldPosition(right);
  const eyes = left.clone().add(right).multiplyScalar(0.5);
  const forward = eyes.clone().sub(head);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
  forward.normalize();
  camera.position.copy(eyes).addScaledVector(forward, 0.78);
  camera.position.y = eyes.y + 0.03;
  camera.near = 0.05;
  camera.far = 20;
  camera.lookAt(eyes.x, eyes.y - 0.06, eyes.z);
  camera.updateProjectionMatrix();
}

function disposeScene(scene: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (isStandard(material) && material.map) textures.add(material.map);
      material.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
}
