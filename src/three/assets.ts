import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const TEXTURE_TIMEOUT = 24_000;
const MODEL_TIMEOUT = 36_000;

export interface TextureOptions {
  srgb?: boolean;
  repeat?: boolean;
  anisotropy?: number;
  /** Keep the image crisp when it is used as a UI-like billboard. */
  clamp?: boolean;
}

const textureCache = new Map<string, Promise<THREE.Texture | null>>();
const modelCache = new Map<string, Promise<THREE.Group | null>>();

function cacheKey(url: string, options: TextureOptions): string {
  return [
    url,
    options.srgb === false ? "linear" : "srgb",
    options.repeat === false ? "clamp" : "repeat",
    options.clamp ? "clamp-only" : "edge",
    options.anisotropy ?? 8,
  ].join("|");
}

async function fetchWithTimeout(url: string, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      mode: "cors",
      credentials: "omit",
      signal: controller.signal,
      cache: "force-cache",
    });
  } finally {
    window.clearTimeout(timer);
  }
}

async function loadTextureUncached(url: string, options: TextureOptions): Promise<THREE.Texture | null> {
  try {
    const response = await fetchWithTimeout(url, TEXTURE_TIMEOUT);
    if (!response.ok) return null;
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const texture = new THREE.Texture(bitmap);
    texture.colorSpace = options.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    texture.anisotropy = options.anisotropy ?? 8;
    if (options.repeat === false) {
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
    } else {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
    }
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.userData.shared = true;
    texture.needsUpdate = true;
    return texture;
  } catch {
    return null;
  }
}

/**
 * CORS-enabled, cached texture loader. Returns null on failure so a caller can
 * fall back to another real NASA image instead of leaving a blank object.
 */
export function loadTexture(url: string, options: TextureOptions = {}): Promise<THREE.Texture | null> {
  const key = cacheKey(url, options);
  const existing = textureCache.get(key);
  if (existing) return existing;
  const promise = loadTextureUncached(url, options);
  textureCache.set(key, promise);
  return promise;
}

export function firstTexture(urls: string[], options: TextureOptions = {}): Promise<THREE.Texture | null> {
  return urls.reduce<Promise<THREE.Texture | null>>(
    (chain, url) =>
      chain.then((texture) => {
        if (texture) return texture;
        return loadTexture(url, options);
      }),
    Promise.resolve(null),
  );
}

function markShared(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.userData.shared = true;
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      material.userData.shared = true;
      const record = material as THREE.Material & {
        map?: THREE.Texture;
        normalMap?: THREE.Texture;
        emissiveMap?: THREE.Texture;
        alphaMap?: THREE.Texture;
        metalnessMap?: THREE.Texture;
        roughnessMap?: THREE.Texture;
      };
      for (const key of ["map", "normalMap", "emissiveMap", "alphaMap", "metalnessMap", "roughnessMap"] as const) {
        const texture = record[key];
        if (texture instanceof THREE.Texture) texture.userData.shared = true;
      }
    }
  });
}

async function loadModelUncached(url: string): Promise<THREE.Group | null> {
  try {
    const response = await fetchWithTimeout(url, MODEL_TIMEOUT);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const base = url.slice(0, url.lastIndexOf("/") + 1);
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(buffer, base);
    markShared(gltf.scene);
    return gltf.scene;
  } catch {
    return null;
  }
}

/** CORS-enabled NASA GLB loader. The cached object must be cloned before use. */
export function loadModel(url: string): Promise<THREE.Group | null> {
  const existing = modelCache.get(url);
  if (existing) return existing;
  const promise = loadModelUncached(url);
  modelCache.set(url, promise);
  return promise;
}

/** Normalise an arbitrary NASA model to a predictable size and centre. */
export function prepareModel(source: THREE.Object3D, targetSize = 3.4): THREE.Group {
  const wrapper = new THREE.Group();
  const model = source.clone(true);
  wrapper.add(model);
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return wrapper;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / maxDimension;
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  return wrapper;
}

/** Attach a real texture to a material, cancelling cleanly if the material is gone. */
export function applyTexture(
  material: THREE.Material,
  url: string | undefined,
  options: TextureOptions = {},
  onLoaded?: (texture: THREE.Texture) => void,
): void {
  if (!url) return;
  const record = material as THREE.Material & { map?: THREE.Texture | null };
  void loadTexture(url, options).then((texture) => {
    if (!texture || material.userData.disposed) return;
    record.map = texture;
    if ("color" in material) {
      (material as THREE.MeshStandardMaterial).color.set("#ffffff");
    }
    material.needsUpdate = true;
    onLoaded?.(texture);
  });
}

export function textureAspect(texture: THREE.Texture): number {
  const image = texture.image as { width?: number; height?: number } | null;
  if (!image?.width || !image?.height) return 1;
  return image.width / image.height;
}

export function cancelMaterial(material: THREE.Material): void {
  material.userData.disposed = true;
}
