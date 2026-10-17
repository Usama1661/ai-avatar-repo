import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import { decode as decodeJpeg } from 'jpeg-js';
import { Platform } from 'react-native';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { createCpuSkins, type CpuSkin } from './cpuSkin';
import { MPFB_BONE_SOURCES } from './boneMap';
import { extractCpuMorphs, type CpuMorphMesh } from './cpuMorphs';
import type { BoneName } from './skeleton';

export type BoundBone = {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
};

export type LoadedAvatar = {
  scene: THREE.Group;
  /** Rotated for subtle head-turn without GPU skinning. */
  lookGroup: THREE.Group;
  /** @deprecated Prefer cpuMorphs — kept for older call sites. */
  morphMeshes: THREE.Mesh[];
  cpuMorphs: CpuMorphMesh[];
  cpuSkins: CpuSkin[];
  bones: Partial<Record<BoneName, BoundBone[]>>;
  frameCamera: (camera: THREE.PerspectiveCamera) => boolean;
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
  const loadedRoot = gltf.scene;
  onProgress?.('Loading textures…');
  await withTimeout(attachMissingTextures(loadedRoot, buffer), 20000, 'Loading textures');

  // Bind bones before neutralizing skinning so camera framing still works.
  const byName = new Map<string, THREE.Bone>();
  loadedRoot.traverse((object) => {
    if ((object as THREE.Bone).isBone) byName.set(object.name, object as THREE.Bone);
  });

  const bones: Partial<Record<BoneName, BoundBone[]>> = {};
  for (const [contractName, sources] of Object.entries(MPFB_BONE_SOURCES) as [BoneName, readonly string[]][]) {
    const bound: BoundBone[] = [];
    for (const sourceName of sources) {
      const bone = byName.get(sourceName);
      if (!bone || bound.some((item) => item.bone === bone)) continue;
      bound.push({ bone, rest: bone.quaternion.clone() });
    }
    if (bound.length > 0) bones[contractName] = bound;
  }

  // Native Expo GL cannot draw SkinnedMesh (float bone textures). Pose on the CPU.
  let cpuSkins: CpuSkin[] = [];
  if (Platform.OS !== 'web') {
    onProgress?.('Preparing mesh…');
    cpuSkins = createCpuSkins(loadedRoot);
    useBasicMaterials(loadedRoot);
  }

  const morphMeshes: THREE.Mesh[] = [];
  const cpuMorphs: CpuMorphMesh[] = [];
  loadedRoot.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
    morphMeshes.push(mesh);
    const cpu = extractCpuMorphs(mesh);
    if (cpu) cpuMorphs.push(cpu);
  });

  // Use every face shape the file actually has. A partial set still drives
  // Happy, Sad, and the other buttons; missing names stay at rest.
  for (const morph of cpuMorphs) {
    const skin = cpuSkins.find((item) => item.position === morph.position);
    if (skin) morph.morphOut = skin.morph;
  }

  loadedRoot.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) mesh.frustumCulled = false;
  });

  const lookGroup = new THREE.Group();
  lookGroup.name = 'AvatarLook';
  lookGroup.add(loadedRoot);

  return {
    scene: lookGroup,
    lookGroup,
    morphMeshes,
    cpuMorphs,
    cpuSkins,
    bones,
    frameCamera: (camera) => framePortrait(loadedRoot, camera),
    dispose: () => disposeScene(lookGroup),
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
  if (mime.includes('jpeg') || mime.includes('jpg')) return textureFromJpeg(bytes);
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
  // Expo GL uploads via texImage2D(..., { localUri }). Three only takes that
  // path when isDataTexture is set so image.data is passed as the pixels arg.
  const texture = new THREE.Texture();
  texture.image = { data: { localUri: fixFileUri(file.uri) }, width, height };
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  (texture as THREE.Texture & { isDataTexture?: boolean }).isDataTexture = true;
  return texture;
}

function textureFromJpeg(bytes: Uint8Array): THREE.DataTexture {
  const decoded = decodeJpeg(Uint8Array.from(bytes), { useTArray: true, formatAsRGBA: true });
  const texture = new THREE.DataTexture(decoded.data, decoded.width, decoded.height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** Expo GL expects `file://`, but some File APIs emit `file:/`. */
function fixFileUri(uri: string): string {
  if (uri.startsWith('file:') && !uri.startsWith('file://')) {
    return `file://${uri.slice('file:'.length)}`;
  }
  return uri;
}

function imageSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (png) return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
  throw new Error('Avatar texture is not a PNG.');
}

function tuneMaterial(material: THREE.MeshStandardMaterial) {
  const name = material.name.toLowerCase();
  material.envMapIntensity = 0.85;
  if (name.includes('hair') || name.includes('eyebrow')) {
    material.transparent = true;
    material.depthWrite = false;
    material.side = THREE.DoubleSide;
    material.alphaTest = 0.05;
    material.roughness = Math.min(material.roughness ?? 1, 0.72);
  } else if (name.includes('eye')) {
    material.transparent = true;
    material.depthWrite = true;
    material.side = THREE.DoubleSide;
    material.roughness = 0.18;
    material.metalness = 0.02;
  } else if (name.includes('cloth') || name.includes('shirt') || name.includes('top')) {
    material.transparent = false;
    material.depthWrite = true;
    material.side = THREE.DoubleSide;
    material.roughness = 0.78;
    material.metalness = 0.02;
  } else {
    // Skin reads more alive with a little warm albedo bias and soft specular.
    material.transparent = false;
    material.depthWrite = true;
    material.side = THREE.FrontSide;
    material.roughness = Math.min(material.roughness ?? 1, 0.55);
    material.metalness = 0.02;
    if (!material.map) material.color.set('#e8c4a8');
  }
}

function isStandard(material: THREE.Material): material is THREE.MeshStandardMaterial {
  return 'map' in material;
}

function useBasicMaterials(scene: THREE.Object3D) {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const basic = materials.map((material) => {
      if (!(material instanceof THREE.MeshStandardMaterial) && !(material instanceof THREE.MeshPhysicalMaterial)) {
        material.side = THREE.DoubleSide;
        return material;
      }
      const next = new THREE.MeshBasicMaterial({
        name: material.name,
        map: material.map,
        color: material.map ? new THREE.Color('#ffffff') : fallbackColor(material),
        side: THREE.DoubleSide,
        depthWrite: true,
      });
      return next;
    });
    mesh.material = Array.isArray(mesh.material) ? basic : basic[0];
  });
}

function fallbackColor(material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial): THREE.Color {
  const name = material.name.toLowerCase();
  if (name.includes('hair')) return new THREE.Color('#2c2118');
  if (name.includes('eyebrow')) return new THREE.Color('#241810');
  if (name.includes('eye')) return new THREE.Color('#6e4b32');
  if (name.includes('cloth') || name.includes('suit') || name.includes('shirt')) return material.color.clone();
  if (material.color && material.map === null && material.color.getHex() !== 0xffffff) return material.color.clone();
  return new THREE.Color('#d7a07a');
}

function framePortrait(root: THREE.Object3D, camera: THREE.PerspectiveCamera): boolean {
  let headBone: THREE.Bone | null = null;
  root.traverse((object) => {
    const bone = object as THREE.Bone;
    if (!headBone && bone.isBone && bone.name.toLowerCase() === 'head') headBone = bone;
  });
  if (!headBone) return frameFaceAndChest(root, camera);

  const neck = headBone as THREE.Bone;
  neck.updateWorldMatrix(true, false);
  const head = new THREE.Vector3();
  neck.getWorldPosition(head);
  const lookY = head.y + 0.08;
  camera.position.set(head.x, lookY, head.z + 0.82);
  camera.near = 0.04;
  camera.far = 20;
  camera.fov = 26;
  camera.lookAt(head.x, lookY + 0.02, head.z);
  camera.updateProjectionMatrix();
  return true;
}

/** Face plus a short strip of chest, for a mesh that has no head bone. */
function frameFaceAndChest(root: THREE.Object3D, camera: THREE.PerspectiveCamera): boolean {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  if (size.y < 1e-4) return false;
  const centerX = (box.min.x + box.max.x) * 0.5;
  const lookY = box.max.y - Math.min(0.2, size.y * 0.12);
  camera.position.set(centerX, lookY, box.max.z + 0.82);
  camera.near = 0.04;
  camera.far = 20;
  camera.fov = 26;
  camera.lookAt(centerX, lookY + 0.04, box.max.z);
  camera.updateProjectionMatrix();
  return true;
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
  // Prefer the face forward (+Z for this MPFB export). Fall back to eye−head.
  let forward = new THREE.Vector3(0, 0, 1);
  const fromBones = eyes.clone().sub(head);
  fromBones.y = 0;
  if (fromBones.lengthSq() > 1e-6) forward = fromBones.normalize();
  camera.position.copy(eyes).addScaledVector(forward, 0.72);
  camera.position.y = eyes.y + 0.02;
  camera.near = 0.05;
  camera.far = 20;
  camera.fov = 28;
  // Aim slightly below the eyes so the whole face (and shirt collar) reads.
  camera.lookAt(eyes.x, eyes.y - 0.04, eyes.z);
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
