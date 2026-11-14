import * as THREE from "three";
import type { ScenePlan } from "../types";
import {
  addAtmosphere,
  addPointLight,
  createEarthMaterial,
  makeGlowSprite,
  makeRingBands,
} from "./materials";
import {
  createRng,
  getEarthTextures,
  gibsLayerUrl,
  makeAuroraOvalTexture,
  makeCloudTexture,
  makeGlowTexture,
  makeHurricaneTexture,
  makePlanetTexture,
  makeRockyTexture,
  makeSunTexture,
} from "./textures";
import { applyTexture, loadModel, loadTexture, prepareModel, textureAspect } from "./assets";
import { TEXTURES } from "../data/body";

export interface BuiltScene {
  group: THREE.Group;
  radius: number;
  elevation: number;
  update: (dt: number, elapsed: number, camera?: THREE.Camera) => void;
}

const TAU = Math.PI * 2;
const START_THETA = -0.42;

const PLANET_RADIUS_KM: Record<string, number> = {
  mercury: 2_440,
  venus: 6_052,
  earth: 6_371,
  mars: 3_390,
  jupiter: 69_911,
  saturn: 58_232,
  uranus: 25_362,
  neptune: 24_622,
  pluto: 1_188,
  moon: 1_737,
  io: 1_822,
  europa: 1_561,
  ganymede: 2_634,
  callisto: 2_410,
  titan: 2_575,
  enceladus: 252,
  triton: 1_353,
  charon: 606,
  phobos: 11,
  deimos: 6,
};

function mesh<G extends THREE.BufferGeometry, M extends THREE.Material>(geometry: G, material: M): THREE.Mesh<G, M> {
  return new THREE.Mesh(geometry, material);
}

function sphere(radius: number, material: THREE.Material, width = 96, height = 64): THREE.Mesh {
  return mesh(new THREE.SphereGeometry(radius, width, height), material);
}

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function accentPalette(accent?: string): string[] {
  if (!accent) return ["#2b3444", "#5d7188", "#97aabf", "#dbe6f0"];
  const color = new THREE.Color(accent);
  const dark = color.clone().multiplyScalar(0.35).getStyle();
  const light = color.clone().lerp(new THREE.Color("#ffffff"), 0.5).getStyle();
  return [dark, accent, light, "#d8e2ee"];
}

function applyTextureToMaterial(
  material: THREE.MeshStandardMaterial,
  url: string | undefined,
  onLoaded?: (texture: THREE.Texture) => void,
): void {
  applyTexture(material, url, { srgb: true, repeat: true, anisotropy: 8 }, onLoaded);
}

/**
 * A real NASA/JPL photograph, masked into a clean disc and billboarded. This is
 * used for moons that have a published image but no equirectangular map, so the
 * moon still looks photographic instead of a painted procedural sphere.
 */
function createPhotoDisc(radius: number, url: string): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    transparent: true,
    depthWrite: false,
    color: "#ffffff",
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(radius * 2, radius * 2, 1);
  void loadTexture(url, { srgb: true, repeat: false, anisotropy: 8 }).then((texture) => {
    if (!texture || sprite.userData.disposed) return;
    const image = texture.image as CanvasImageSource & { width?: number; height?: number };
    try {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        material.map = texture;
        material.needsUpdate = true;
        return;
      }
      const sourceWidth = image.width || size;
      const sourceHeight = image.height || size;
      const cover = Math.max(size / sourceWidth, size / sourceHeight);
      const drawWidth = sourceWidth * cover;
      const drawHeight = sourceHeight * cover;
      context.save();
      context.beginPath();
      context.arc(size / 2, size / 2, size / 2 - 1, 0, TAU);
      context.clip();
      context.drawImage(image, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight);
      context.restore();
      const pixels = context.getImageData(0, 0, size, size);
      const data = pixels.data;
      for (let i = 0; i < data.length; i += 4) {
        const luma = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
        const background = Math.max(0, Math.min(1, (luma - 0.016) / 0.05));
        data[i + 3] = Math.round(data[i + 3] * background);
      }
      context.putImageData(pixels, 0, 0);
      const masked = new THREE.CanvasTexture(canvas);
      masked.colorSpace = THREE.SRGBColorSpace;
      masked.anisotropy = 4;
      masked.userData.shared = true;
      masked.needsUpdate = true;
      material.map = masked;
      material.needsUpdate = true;
    } catch {
      // Canvas filtering can fail on an unusual image; show the NASA photo raw.
      material.map = texture;
      material.needsUpdate = true;
    }
  });
  return sprite;
}

function addSolarLighting(group: THREE.Group, intensity = 3.2, ambient = 0.42): void {
  const key = new THREE.DirectionalLight("#fff1dc", intensity);
  key.position.set(5, 2.8, 4.4);
  group.add(key);
  const fill = new THREE.DirectionalLight("#4e6fb8", ambient * 1.3);
  fill.position.set(-5, -2, -4);
  group.add(fill);
  group.add(new THREE.AmbientLight("#2a3350", ambient));
}

function addStarDust(group: THREE.Group, count: number, spread: number, color: string, seed = 11): THREE.Points {
  const rng = createRng(seed);
  const positions: number[] = [];
  const colors: number[] = [];
  const base = new THREE.Color(color);
  for (let i = 0; i < count; i += 1) {
    const radius = spread * (0.25 + Math.pow(rng(), 0.6) * 0.75);
    const theta = rng() * TAU;
    const phi = Math.acos(2 * rng() - 1);
    positions.push(
      Math.sin(phi) * Math.cos(theta) * radius,
      Math.cos(phi) * radius * 0.65,
      Math.sin(phi) * Math.sin(theta) * radius,
    );
    const tint = base.clone().offsetHSL((rng() - 0.5) * 0.08, 0, (rng() - 0.5) * 0.2);
    colors.push(tint.r, tint.g, tint.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.035,
      map: makeGlowTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  group.add(points);
  return points;
}

function latLonToVector3(latDeg: number, lonDeg: number, radius: number): THREE.Vector3 {
  const lat = THREE.MathUtils.degToRad(latDeg);
  const lon = THREE.MathUtils.degToRad(lonDeg);
  return new THREE.Vector3(
    radius * Math.cos(lat) * Math.cos(lon),
    radius * Math.sin(lat),
    -radius * Math.cos(lat) * Math.sin(lon),
  );
}

function makeSurfaceMarker(parent: THREE.Object3D, position: THREE.Vector3, color: string, size: number): THREE.Group {
  const marker = new THREE.Group();
  marker.position.copy(position);
  marker.lookAt(0, 0, 0);
  const ring = mesh(
    new THREE.RingGeometry(size * 0.62, size, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const dot = mesh(
    new THREE.CircleGeometry(size * 0.18, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  marker.add(ring, dot);
  parent.add(marker);
  return marker;
}

function makeSegmentIntersectsSphere(
  a: THREE.Vector3,
  b: THREE.Vector3,
  center: THREE.Vector3,
  radius: number,
): boolean {
  const direction = b.clone().sub(a);
  const lengthSq = direction.lengthSq();
  if (lengthSq === 0) return a.distanceToSquared(center) < radius * radius;
  let t = center.clone().sub(a).dot(direction) / lengthSq;
  t = THREE.MathUtils.clamp(t, 0, 1);
  const closest = a.clone().add(direction.multiplyScalar(t));
  return closest.distanceToSquared(center) < radius * radius;
}

function createEarthScene(plan: ScenePlan): BuiltScene {
  const group = new THREE.Group();
  const sunDir = new THREE.Vector3(5, 2.5, 4).normalize();
  const tilt = new THREE.Group();
  tilt.rotation.z = THREE.MathUtils.degToRad(plan.axialTiltDeg ?? 23.4);
  group.add(tilt);

  const earth = sphere(1.5, createEarthMaterial(sunDir), 160, 112);
  tilt.add(earth);

  const cloudTexture = makeCloudTexture();
  const cloudMaterial = new THREE.MeshBasicMaterial({
    map: cloudTexture,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const clouds = sphere(1.512, cloudMaterial, 128, 96);
  tilt.add(clouds);
  const cloudMaterial2 = cloudMaterial.clone();
  cloudMaterial2.opacity = 0.26;
  const clouds2 = sphere(1.519, cloudMaterial2, 128, 96);
  clouds2.rotation.y = 1.9;
  tilt.add(clouds2);
  applyTexture(cloudMaterial, TEXTURES.clouds, { srgb: true, repeat: true, anisotropy: 8 });
  applyTexture(cloudMaterial2, TEXTURES.clouds, { srgb: true, repeat: true, anisotropy: 8 });

  addAtmosphere(tilt, 1.5, "#5fa8ff", 0.95);
  addSolarLighting(group, 2.5, 0.62);

  const moonTexture = makeRockyTexture(301, "#8e8c88", "#c9c3b7", { craters: 180 });
  const moonMaterial = new THREE.MeshStandardMaterial({ map: moonTexture, roughness: 1, metalness: 0 });
  applyTextureToMaterial(moonMaterial, TEXTURES.moon);
  const moon = sphere(0.405, moonMaterial, 64, 48);
  const moonPivot = new THREE.Group();
  moonPivot.rotation.z = THREE.MathUtils.degToRad(5.1);
  moonPivot.add(moon);
  group.add(moonPivot);
  const orbit = mesh(
    new THREE.RingGeometry(3.39, 3.4, 128),
    new THREE.MeshBasicMaterial({
      color: "#8ea9cc",
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  orbit.rotation.x = Math.PI / 2;
  moonPivot.add(orbit);

  return {
    group,
    radius: plan.cameraDistance ?? 5.4,
    elevation: plan.orbitElevation ?? 0.16,
    update: (dt, elapsed) => {
      earth.rotation.y += dt * 0.032;
      clouds.rotation.y += dt * 0.043;
      clouds2.rotation.y += dt * 0.051;
      const angle = elapsed * 0.075;
      moon.position.set(Math.cos(angle) * 3.4, 0, Math.sin(angle) * 3.4);
      moon.rotation.y += dt * 0.08;
    },
  };
}

function planetRingSpan(bodyId: string): { inner: number; outer: number; palette: string[]; opacity: number } {
  if (bodyId === "saturn") {
    return {
      inner: 1.35,
      outer: 2.4,
      palette: ["#eadfc9", "#c7b695", "#f4ecd9", "#a99678", "#ddd0b8"],
      opacity: 1,
    };
  }
  if (bodyId === "uranus") {
    return { inner: 1.55, outer: 1.9, palette: ["#8fc6cf", "#6fa3ad", "#c4e3e8"], opacity: 0.45 };
  }
  return { inner: 1.62, outer: 2.02, palette: ["#6f8fd0", "#8fb0e8", "#b8d0f0"], opacity: 0.4 };
}

function createPlanetScene(plan: ScenePlan): BuiltScene {
  const group = new THREE.Group();
  const bodyId = plan.bodyId ?? "planet";
  const planetRadius = 1.55;
  const planetRadiusKm = PLANET_RADIUS_KM[bodyId] ?? 6_371;
  const tilt = new THREE.Group();
  tilt.rotation.z = THREE.MathUtils.degToRad(plan.axialTiltDeg ?? 0);
  group.add(tilt);

  const seed = hash(bodyId);
  const placeholder = makeRockyTexture(seed, "#7b746b", "#b9ae9e", { craters: 90 });
  const material = new THREE.MeshStandardMaterial({
    map: placeholder,
    roughness: 0.92,
    metalness: 0,
  });
  const planet = sphere(planetRadius, material, 160, 112);
  tilt.add(planet);
  applyTextureToMaterial(material, plan.textureUrl, (texture) => {
    material.map = texture;
    material.needsUpdate = true;
  });

  if (plan.atmosphereColor) {
    addAtmosphere(tilt, planetRadius, plan.atmosphereColor, bodyId === "venus" ? 0.55 : 0.3);
  } else {
    addAtmosphere(tilt, planetRadius, "#9bb8d8", 0.12);
  }

  if (plan.rings) {
    const span = planetRingSpan(bodyId);
    const rings = makeRingBands(planetRadius * span.inner, planetRadius * span.outer, span.palette);
    if (span.opacity < 1) {
      rings.traverse((object) => {
        const material = (object as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if (material?.opacity !== undefined) material.opacity *= span.opacity;
      });
    }
    tilt.add(rings);
  }

  addSolarLighting(group, 3.1, 0.4);

  const moons: Array<{
    body: THREE.Object3D;
    orbitRadius: number;
    speed: number;
    phase: number;
  }> = [];
  if (plan.moons?.length) {
    const moonsSorted = [...plan.moons].sort((a, b) => a.distanceKm - b.distanceKm);
    const ratios = moonsSorted.map((moon) => Math.max(1.01, moon.distanceKm / planetRadiusKm));
    const minRatio = Math.min(...ratios);
    const maxRatio = Math.max(...ratios);
    const ringOuter = plan.rings ? planetRadius * planetRingSpan(bodyId).outer : 0;
    const innerDistance = Math.max(planetRadius * 1.95, ringOuter * 1.06);
    const outerDistance = Math.max(innerDistance + planetRadius * 0.9, Math.min(planetRadius * 3.5, 5.2));
    const logSpan = Math.log(maxRatio / minRatio) || 1;

    // Only moons with a real NASA/JPL texture or photograph are modelled in
    // three dimensions. Any other confirmed moon stays an honest point, never
    // a hand-painted procedural sphere.
    const detailed = moonsSorted.filter((moon) => Boolean(moon.textureUrl || moon.imageUrl));

    detailed.forEach((moon, index) => {
      const ratio = Math.max(1.01, moon.distanceKm / planetRadiusKm);
      const t = Math.log(ratio / minRatio) / logSpan;
      const distance = innerDistance + t * (outerDistance - innerDistance);
      const trueRadius = (moon.radiusKm / planetRadiusKm) * planetRadius;
      const displayRadius = Math.max(moon.textureUrl ? 0.02 : 0.052, trueRadius);
      const moonSeed = hash(`${bodyId}-${moon.id}`);
      let body: THREE.Object3D;
      if (moon.textureUrl) {
        const moonMaterial = new THREE.MeshStandardMaterial({
          map: makeRockyTexture(moonSeed, moon.color ?? "#aaa298", "#d8d0c4", { craters: 28 }),
          roughness: 1,
          metalness: 0,
        });
        applyTextureToMaterial(moonMaterial, moon.textureUrl);
        const moonMesh = sphere(displayRadius, moonMaterial, 48, 32);
        moonMesh.rotation.y = moonSeed % 10;
        body = moonMesh;
      } else {
        body = createPhotoDisc(displayRadius, moon.imageUrl!);
      }
      const pivot = new THREE.Group();
      pivot.rotation.z = THREE.MathUtils.degToRad(((index % 2 ? 1 : -1) * (index + 1) * 0.5) / 2);
      const orbitLine = mesh(
        new THREE.RingGeometry(distance - 0.004, distance + 0.004, 128),
        new THREE.MeshBasicMaterial({
          color: moon.color ?? "#9bacbf",
          transparent: true,
          opacity: 0.1,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      orbitLine.rotation.x = Math.PI / 2;
      pivot.add(orbitLine, body);
      tilt.add(pivot);
      moons.push({
        body,
        orbitRadius: distance,
        speed: 0.34 / Math.sqrt(distance / planetRadius),
        phase: (index / Math.max(1, detailed.length)) * TAU,
      });
    });

    const remaining = (plan.moonCount ?? moonsSorted.length) - detailed.length;
    if (remaining > 0) {
      const rng = createRng(hash(`${bodyId}-moon-count`));
      const count = Math.min(remaining, 240);
      const positions: number[] = [];
      for (let i = 0; i < count; i += 1) {
        const angle = rng() * TAU;
        const distance = outerDistance * (1.03 + rng() * 0.32);
        positions.push(Math.cos(angle) * distance, (rng() - 0.5) * 0.12, Math.sin(angle) * distance);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const points = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: "#c9d6e8",
          size: 0.026,
          map: makeGlowTexture(),
          transparent: true,
          opacity: 0.62,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      tilt.add(points);
    }
  }

  const spinHours = plan.rotationHours ?? 24;
  const spinSpeed = THREE.MathUtils.clamp(0.075 * (24 / Math.abs(spinHours || 24)), 0.008, 0.16);

  return {
    group,
    radius: plan.cameraDistance ?? 5.9,
    elevation: plan.orbitElevation ?? 0.14,
    update: (dt, elapsed) => {
      planet.rotation.y += dt * spinSpeed;
      moons.forEach((moon) => {
        const angle = moon.phase + elapsed * moon.speed;
        moon.body.position.set(Math.cos(angle) * moon.orbitRadius, 0, Math.sin(angle) * moon.orbitRadius);
        if (moon.body instanceof THREE.Sprite) {
          const material = moon.body.material as THREE.SpriteMaterial;
          material.rotation += dt * 0.02;
        } else {
          moon.body.rotation.y += dt * 0.12;
        }
      });
    },
  };
}

function createSunScene(plan: ScenePlan): BuiltScene {
  const group = new THREE.Group();
  const placeholder = makeSunTexture();
  const sunMaterial = new THREE.MeshBasicMaterial({ map: placeholder, color: "#fff2c8" });
  const sun = sphere(1.62, sunMaterial, 128, 96);
  group.add(sun);
  applyTexture(sunMaterial, plan.textureUrl ?? TEXTURES.sun, { srgb: true, repeat: true, anisotropy: 8 }, (texture) => {
    sunMaterial.map = texture;
    sunMaterial.needsUpdate = true;
  });

  const coronaA = makeGlowSprite("#ffcf76", 6.8, 0.78);
  const coronaB = makeGlowSprite("#ff8c35", 10.6, 0.34);
  const coronaC = makeGlowSprite("#ffe9b8", 4.8, 0.42);
  group.add(coronaA, coronaB, coronaC);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: "#ffb45c",
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const coronaRing = mesh(new THREE.RingGeometry(1.7, 2.05, 128), ringMaterial);
  group.add(coronaRing);
  const coronaRing2 = mesh(
    new THREE.RingGeometry(2.1, 2.28, 128),
    new THREE.MeshBasicMaterial({
      color: "#ffdf9c",
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(coronaRing2);
  addPointLight(group, "#ffb15a", 2.4, 16).position.set(0, 0, 2);
  group.add(new THREE.AmbientLight("#ffb95e", 1.1));

  const flares: THREE.Sprite[] = [];
  const flareRng = createRng(440);
  for (let i = 0; i < 3; i += 1) {
    const flare = makeGlowSprite(i % 2 ? "#ff8b3d" : "#ffd27a", 0.7 + flareRng() * 0.7, 0.55);
    const angle = flareRng() * TAU;
    flare.position.set(Math.cos(angle) * 1.7, (flareRng() - 0.5) * 2.4, Math.sin(angle) * 1.7);
    group.add(flare);
    flares.push(flare);
  }

  return {
    group,
    radius: plan.cameraDistance ?? 5.5,
    elevation: plan.orbitElevation ?? 0.12,
    update: (dt, elapsed) => {
      sun.rotation.y += dt * 0.019;
      coronaA.scale.setScalar(6.8 + Math.sin(elapsed * 0.45) * 0.14);
      coronaB.scale.setScalar(10.6 + Math.sin(elapsed * 0.31 + 1.7) * 0.24);
      coronaC.scale.setScalar(4.8 + Math.sin(elapsed * 0.6 + 0.8) * 0.1);
      coronaRing.rotation.z += dt * 0.03;
      coronaRing2.rotation.z -= dt * 0.02;
      flares.forEach((flare, index) => {
        const pulse = 0.55 + Math.max(0, Math.sin(elapsed * 0.7 + index * 2.1)) * 0.8;
        flare.material.opacity = 0.12 + pulse * 0.42;
        flare.scale.setScalar((0.7 + index * 0.2) * (0.85 + pulse * 0.35));
      });
    },
  };
}

function createDeepSpaceScene(plan: ScenePlan): BuiltScene {
  const group = new THREE.Group();
  const accent = plan.accent ?? "#c8d8ff";
  const urls = plan.imageUrls ?? [];
  const mainUrl = urls[0];
  const backUrl = urls[1] ?? urls[0];
  const isSmallBody = plan.variant === "small-body";
  const isBlackHole = plan.variant === "black-hole";
  const isDeepField = plan.variant === "deep-field";

  const glow = makeGlowSprite(accent, isDeepField ? 8.2 : 6.4, 0.2);
  glow.position.z = -2.3;
  group.add(glow);

  if (isBlackHole) {
    const lens = mesh(
      new THREE.TorusGeometry(2.25, 0.012, 8, 160),
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    lens.rotation.x = Math.PI / 2.35;
    lens.rotation.y = 0.24;
    group.add(lens);
  }

  const layers: Array<{ mesh: THREE.Mesh; base: THREE.Vector3; phase: number }> = [];

  const makeLayer = (
    url: string | undefined,
    width: number,
    targetOpacity: number,
    z: number,
    blending: THREE.Blending,
    seed: number,
  ): void => {
    const material = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending,
    });
    const plane = mesh(new THREE.PlaneGeometry(1, 1), material);
    plane.position.set(0, 0, z);
    plane.userData.basePosition = plane.position.clone();
    plane.userData.phase = seed * 1.7;
    group.add(plane);
    layers.push({ mesh: plane, base: plane.position.clone(), phase: seed * 1.7 });
    if (!url) return;
    void loadTexture(url, { srgb: true, repeat: false, anisotropy: 8 }).then((texture) => {
      if (!texture || group.userData.disposed) return;
      const aspect = textureAspect(texture);
      plane.scale.set(width, width / Math.max(0.35, aspect), 1);
      material.map = texture;
      material.color.set("#ffffff");
      material.opacity = targetOpacity;
      material.needsUpdate = true;
    });
  };

  if (isSmallBody) {
    makeLayer(mainUrl, 3.7, 1, 0.1, THREE.NormalBlending, 1);
    makeLayer(backUrl, 4.4, 0.14, -0.8, THREE.AdditiveBlending, 2);
  } else {
    makeLayer(backUrl, 7.6, 0.2, -2.0, THREE.AdditiveBlending, 1);
    makeLayer(mainUrl, 5.8, 0.55, -0.7, THREE.AdditiveBlending, 2);
    makeLayer(mainUrl, isDeepField ? 4.4 : 4.7, 1, 0, THREE.NormalBlending, 3);
  }

  addStarDust(group, isDeepField ? 900 : 520, 8, accent, hash(plan.bodyId ?? "deep-space"));

  if (plan.variant === "nebula") {
    const wisps = makeGlowSprite(accent, 9.5, 0.08);
    wisps.position.set(-1.8, 1.1, -3.4);
    group.add(wisps);
  }

  return {
    group,
    radius: plan.cameraDistance ?? (isSmallBody ? 5.2 : 6.3),
    elevation: plan.orbitElevation ?? 0.16,
    update: (dt, elapsed) => {
      group.rotation.y += dt * (isSmallBody ? 0.018 : 0.009);
      group.rotation.z = Math.sin(elapsed * 0.08) * 0.01;
      layers.forEach((layer, index) => {
        layer.mesh.position.x = layer.base.x + Math.sin(elapsed * 0.16 + layer.phase) * (index === 2 ? 0.035 : 0.06);
        layer.mesh.position.y = layer.base.y + Math.cos(elapsed * 0.13 + layer.phase) * 0.03;
      });
    },
  };
}

function createSpacecraftScene(plan: ScenePlan): BuiltScene {
  const group = new THREE.Group();
  const bodyId = plan.bodyId ?? "spacecraft";
  const accent = plan.accent ?? "#c9d8ea";

  addSolarLighting(group, 3.8, 0.5);
  const rim = new THREE.DirectionalLight("#5b8bd6", 2.2);
  rim.position.set(-5, -2.5, -4);
  group.add(rim);
  const warm = new THREE.DirectionalLight("#ffd7a8", 2.1);
  warm.position.set(4, -1.5, 3);
  group.add(warm);

  const placeholderGlow = makeGlowSprite(accent, 3.4, 0.16);
  group.add(placeholderGlow);

  if (bodyId === "hubble" || bodyId === "iss") {
    const earthGroup = new THREE.Group();
    earthGroup.position.set(0, -5.6, 0);
    const earth = sphere(5.4, createEarthMaterial(new THREE.Vector3(0.5, 0.9, 0.3)), 96, 64);
    earthGroup.add(earth);
    addAtmosphere(earthGroup, 5.4, "#5c9dff", 0.7);
    group.add(earthGroup);
  }

  if (bodyId === "perseverance" || bodyId === "ingenuity") {
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: "#9b5b37",
      roughness: 1,
      metalness: 0,
    });
    applyTextureToMaterial(groundMaterial, TEXTURES.mars);
    const ground = mesh(new THREE.CircleGeometry(7.5, 64), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.95;
    group.add(ground);
    const dust = makeGlowSprite("#d19a6e", 7, 0.12);
    dust.position.set(0, -1.4, 0);
    group.add(dust);
  }

  const spin = new THREE.Group();
  group.add(spin);

  if (plan.modelUrl) {
    void loadModel(plan.modelUrl).then((model) => {
      if (!model || group.userData.disposed) return;
      const prepared = prepareModel(model, bodyId === "iss" ? 3.9 : 3.4);
      prepared.traverse((object) => {
        const objectWithLight = object as THREE.Object3D & { isLight?: boolean; isCamera?: boolean };
        if (objectWithLight.isLight || objectWithLight.isCamera) objectWithLight.visible = false;
        const material = (object as THREE.Mesh).material;
        const materials = Array.isArray(material) ? material : material ? [material] : [];
        for (const entry of materials) {
          if (entry instanceof THREE.MeshStandardMaterial) {
            entry.metalness = Math.min(entry.metalness, 0.38);
            entry.roughness = Math.max(entry.roughness, 0.4);
            entry.needsUpdate = true;
          }
        }
      });
      prepared.rotation.set(0.18, 0.7, 0.08);
      spin.add(prepared);
      placeholderGlow.material.opacity = 0.08;
    });
  }

  return {
    group,
    radius: plan.cameraDistance ?? 5.6,
    elevation: plan.orbitElevation ?? 0.18,
    update: (dt, elapsed) => {
      spin.rotation.y += dt * 0.12;
      spin.rotation.x = Math.sin(elapsed * 0.16) * 0.03;
      placeholderGlow.material.opacity = Math.max(0.05, placeholderGlow.material.opacity - dt * 0.05);
    },
  };
}

function addEarthShell(
  parent: THREE.Object3D,
  radius: number,
  sunDirection: THREE.Vector3,
  options: { clouds?: boolean; atmosphere?: boolean } = {},
): { earth: THREE.Mesh; clouds: THREE.Mesh[]; spin: THREE.Group } {
  const spin = new THREE.Group();
  parent.add(spin);
  const earth = sphere(radius, createEarthMaterial(sunDirection), 160, 112);
  spin.add(earth);
  const clouds: THREE.Mesh[] = [];
  if (options.clouds !== false) {
    const texture = makeCloudTexture();
    for (let i = 0; i < 2; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: i === 0 ? 0.58 : 0.24,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const cloud = sphere(radius * (1.008 + i * 0.005), material, 128, 96);
      cloud.rotation.y = i * 2.1;
      spin.add(cloud);
      clouds.push(cloud);
      applyTexture(material, TEXTURES.clouds, { srgb: true, repeat: true, anisotropy: 8 });
    }
  }
  if (options.atmosphere !== false) addAtmosphere(spin, radius, "#5fa8ff", 0.9);
  return { earth, clouds, spin };
}

function createEarthPhenomenonScene(plan: ScenePlan): BuiltScene {
  const group = new THREE.Group();
  const earthRadius = 1.5;
  const sunDirection = new THREE.Vector3(0.55, 0.34, 0.76).normalize();
  const tilt = new THREE.Group();
  tilt.rotation.z = THREE.MathUtils.degToRad(plan.axialTiltDeg ?? 23.4);
  group.add(tilt);

  const shell = addEarthShell(tilt, earthRadius, sunDirection);
  addSolarLighting(group, 2.4, 0.58);

  const location = plan.location ?? { lat: 0, lon: 0 };
  const localPosition = latLonToVector3(location.lat, location.lon, earthRadius * 1.012);
  shell.spin.rotation.y = START_THETA - Math.atan2(localPosition.x, localPosition.z);

  const markerColor = plan.accent ?? "#ffd07a";
  const marker = makeSurfaceMarker(shell.spin, localPosition, markerColor, 0.13);

  if (plan.layer) {
    const layerMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.NormalBlending,
    });
    const layer = sphere(earthRadius * 1.006, layerMaterial, 160, 112);
    shell.spin.add(layer);
    void loadTexture(gibsLayerUrl(plan.layer, plan.layerDate), { srgb: true, repeat: false, anisotropy: 8 }).then((texture) => {
      if (!texture || group.userData.disposed) return;
      layerMaterial.map = texture;
      layerMaterial.opacity = plan.variant === "ocean" || plan.variant === "climate" ? 0.42 : 0.6;
      layerMaterial.needsUpdate = true;
    });
  }

  const effects: Array<(dt: number, elapsed: number) => void> = [];

  if (plan.variant === "hurricane") {
    const spiralTexture = makeHurricaneTexture(2026);
    const spiral = mesh(
      new THREE.CircleGeometry(0.24, 64),
      new THREE.MeshBasicMaterial({
        map: spiralTexture,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    spiral.position.copy(localPosition.clone().multiplyScalar(1.006));
    spiral.lookAt(0, 0, 0);
    shell.spin.add(spiral);
    effects.push((dt) => {
      spiral.rotation.z += dt * 0.55;
    });
  }

  if (plan.variant === "earthquake") {
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i += 1) {
      const ring = mesh(
        new THREE.RingGeometry(0.04, 0.05, 48),
        new THREE.MeshBasicMaterial({
          color: markerColor,
          transparent: true,
          opacity: 0.45,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      ring.position.copy(localPosition.clone().multiplyScalar(1.008));
      ring.lookAt(0, 0, 0);
      shell.spin.add(ring);
      rings.push(ring);
    }
    effects.push((_dt, elapsed) => {
      rings.forEach((ring, index) => {
        const phase = ((elapsed * 0.42 + index / 3) % 1 + 1) % 1;
        ring.scale.setScalar(0.5 + phase * 3.2);
        (ring.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * 0.42;
      });
    });
  }

  if (plan.variant === "volcano" || plan.variant === "wildfire") {
    const heatColor = plan.variant === "volcano" ? "#ff7a2a" : "#ff9d4a";
    const glow = makeGlowSprite(heatColor, 0.65, 0.7);
    glow.position.copy(localPosition.clone().multiplyScalar(1.02));
    shell.spin.add(glow);
    effects.push((_dt, elapsed) => {
      glow.material.opacity = 0.45 + Math.sin(elapsed * 2.1) * 0.16;
      glow.scale.setScalar(0.58 + Math.sin(elapsed * 1.7) * 0.06);
    });
  }

  if (plan.variant === "glacier" || plan.variant === "sea-ice") {
    const iceGlow = makeGlowSprite("#d8f3ff", 0.9, 0.24);
    iceGlow.position.copy(localPosition.clone().multiplyScalar(1.02));
    shell.spin.add(iceGlow);
  }

  return {
    group,
    radius: plan.cameraDistance ?? 5.8,
    elevation: plan.orbitElevation ?? 0.24,
    update: (dt, elapsed) => {
      shell.spin.rotation.y += dt * 0.006;
      shell.earth.rotation.y += dt * 0.024;
      shell.clouds.forEach((cloud, index) => {
        cloud.rotation.y += dt * (0.026 + index * 0.008);
      });
      const pulse = 1 + Math.sin(elapsed * 1.8) * 0.12;
      marker.scale.setScalar(pulse);
      effects.forEach((effect) => effect(dt, elapsed));
    },
  };
}

function createAuroraScene(plan: ScenePlan): BuiltScene {
  const group = new THREE.Group();
  const earthRadius = 1.5;
  const sunDirection = new THREE.Vector3(0.62, 0.22, 0.75).normalize();
  const tilt = new THREE.Group();
  tilt.rotation.z = THREE.MathUtils.degToRad(plan.axialTiltDeg ?? 23.4);
  group.add(tilt);
  const shell = addEarthShell(tilt, earthRadius, sunDirection);
  addSolarLighting(group, 1.9, 0.5);

  const auroraTexture = makeAuroraOvalTexture();
  const bands: THREE.Mesh[] = [];
  const bandSpecs = [
    { radius: 1.565, start: 0.2, length: 0.2, opacity: 0.88 },
    { radius: 1.6, start: 0.24, length: 0.24, opacity: 0.4 },
    { radius: 1.565, start: Math.PI - 0.4, length: 0.2, opacity: 0.72 },
    { radius: 1.6, start: Math.PI - 0.44, length: 0.22, opacity: 0.3 },
  ];
  for (const spec of bandSpecs) {
    const material = new THREE.MeshBasicMaterial({
      map: auroraTexture,
      transparent: true,
      opacity: spec.opacity,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const band = new THREE.Mesh(
      new THREE.SphereGeometry(spec.radius, 160, 32, 0, TAU, spec.start, spec.length),
      material,
    );
    band.rotation.y = spec.radius * 10;
    tilt.add(band);
    bands.push(band);
  }

  return {
    group,
    radius: plan.cameraDistance ?? 6.1,
    elevation: plan.orbitElevation ?? 0.32,
    update: (dt, elapsed) => {
      shell.spin.rotation.y += dt * 0.014;
      shell.earth.rotation.y += dt * 0.01;
      shell.clouds.forEach((cloud, index) => {
        cloud.rotation.y += dt * (0.02 + index * 0.006);
      });
      auroraTexture.offset.x += dt * 0.006;
      bands.forEach((band, index) => {
        const target = (index === 1 || index === 3 ? 0.4 : 0.8) + Math.sin(elapsed * 0.75 + index) * 0.1;
        (band.material as THREE.MeshBasicMaterial).opacity = target;
      });
    },
  };
}

function createInnerCoreScene(plan: ScenePlan): BuiltScene {
  const group = new THREE.Group();

  const earthTextures = getEarthTextures();
  const surfaceMaterial = new THREE.MeshStandardMaterial({
    map: earthTextures.day,
    bumpMap: earthTextures.day,
    bumpScale: 0.04,
    roughness: 0.92,
    metalness: 0,
  });
  getEarthTextures((updated) => {
    surfaceMaterial.map = updated.day;
    surfaceMaterial.bumpMap = updated.day;
    surfaceMaterial.needsUpdate = true;
  });

  const missingQuarter = { phiStart: Math.PI / 2, phiLength: Math.PI * 1.5 };
  const layers = [
    { radius: 1.5, material: surfaceMaterial, crust: true },
    {
      radius: 1.42,
      material: new THREE.MeshStandardMaterial({
        color: "#7f3a22",
        roughness: 0.88,
        metalness: 0.02,
      }),
    },
    {
      radius: 0.9,
      material: new THREE.MeshStandardMaterial({
        color: "#ff7618",
        emissive: "#c23c00",
        emissiveIntensity: 0.85,
        roughness: 0.52,
        metalness: 0.05,
      }),
    },
    {
      radius: 0.43,
      material: new THREE.MeshStandardMaterial({
        color: "#fff0b8",
        emissive: "#ffc84a",
        emissiveIntensity: 1.6,
        roughness: 0.38,
        metalness: 0.2,
      }),
    },
  ];

  for (const layer of layers) {
    const geometry = new THREE.SphereGeometry(
      layer.radius,
      layer.crust ? 160 : 96,
      layer.crust ? 112 : 64,
      missingQuarter.phiStart,
      missingQuarter.phiLength,
    );
    const shell = mesh(geometry, layer.material);
    group.add(shell);
  }

  const capSpecs = [
    { inner: 1.42, outer: 1.505, color: "#4d5b42", emissive: 0.02 },
    { inner: 0.9, outer: 1.42, color: "#9a4328", emissive: 0.1 },
    { inner: 0.43, outer: 0.9, color: "#ff8a2a", emissive: 0.65 },
    { inner: 0, outer: 0.43, color: "#fff0b8", emissive: 1.2 },
  ];
  for (const cap of capSpecs) {
    const material = new THREE.MeshStandardMaterial({
      color: cap.color,
      emissive: cap.color,
      emissiveIntensity: cap.emissive,
      roughness: 0.62,
      side: THREE.DoubleSide,
    });
    const geometryA =
      cap.inner <= 0
        ? new THREE.CircleGeometry(cap.outer, 64, Math.PI / 2, Math.PI)
        : new THREE.RingGeometry(cap.inner, cap.outer, 64, 1, Math.PI / 2, Math.PI);
    const capA = mesh(geometryA, material);
    capA.position.z = 0.001;
    group.add(capA);

    const geometryB =
      cap.inner <= 0
        ? new THREE.CircleGeometry(cap.outer, 64, -Math.PI / 2, Math.PI)
        : new THREE.RingGeometry(cap.inner, cap.outer, 64, 1, -Math.PI / 2, Math.PI);
    const capB = mesh(geometryB, material.clone());
    capB.rotation.y = -Math.PI / 2;
    capB.position.x = 0.001;
    group.add(capB);
  }

  const coreGlow = makeGlowSprite("#ffc35c", 1.35, 0.34);
  coreGlow.position.set(0.12, 0.04, 0.12);
  group.add(coreGlow);
  addPointLight(group, "#ff8c33", 2.1, 5).position.set(0.1, 0, 0.2);
  const key = new THREE.DirectionalLight("#ffe2bd", 2.4);
  key.position.set(-4, 3.5, 5);
  group.add(key);
  group.add(new THREE.AmbientLight("#241d3c", 1.2));
  addAtmosphere(group, 1.52, "#6ba9ff", 0.16);

  return {
    group,
    radius: plan.cameraDistance ?? 4.9,
    elevation: plan.orbitElevation ?? 0.2,
    update: (_dt, elapsed) => {
      coreGlow.material.opacity = 0.3 + Math.sin(elapsed * 1.3) * 0.08;
      coreGlow.scale.setScalar(1.35 + Math.sin(elapsed * 1.5) * 0.06);
    },
  };
}

function createSolarEclipseScene(plan: ScenePlan): BuiltScene {
  const group = new THREE.Group();
  const sunX = -6.6;
  const moonX = -1.5;
  const earthX = 3.4;
  const earthRadius = 1.1;

  const sunMaterial = new THREE.MeshBasicMaterial({ map: makeSunTexture(), color: "#fff3c9" });
  const sun = sphere(2.0, sunMaterial, 96, 64);
  sun.position.x = sunX;
  group.add(sun);
  applyTexture(sunMaterial, TEXTURES.sun, { srgb: true, repeat: true }, (texture) => {
    sunMaterial.map = texture;
    sunMaterial.needsUpdate = true;
  });
  const sunGlow = makeGlowSprite("#ffb45c", 9.4, 0.72);
  sunGlow.position.x = sunX;
  group.add(sunGlow);
  addPointLight(group, "#ffd09a", 3.6, 22).position.set(sunX, 0, 0);

  const moonMaterial = new THREE.MeshStandardMaterial({ color: "#7d7669", roughness: 1, metalness: 0 });
  applyTextureToMaterial(moonMaterial, TEXTURES.moon);
  const moon = sphere(0.52, moonMaterial, 64, 48);
  moon.position.x = moonX;
  group.add(moon);

  const earthGroup = new THREE.Group();
  earthGroup.position.x = earthX;
  const earth = sphere(earthRadius, createEarthMaterial(new THREE.Vector3(-1, 0, 0)), 128, 96);
  earthGroup.add(earth);
  addAtmosphere(earthGroup, earthRadius, "#69a8ff", 0.82);
  group.add(earthGroup);

  const moonSurfaceX = moonX + 0.52;
  const earthSurfaceX = earthX - earthRadius;
  const coneHeight = earthSurfaceX - moonSurfaceX;
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: "#1b2233",
    transparent: true,
    opacity: 0.23,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.5, coneHeight, 48, 1, true), shadowMaterial);
  cone.rotation.z = -Math.PI / 2;
  cone.position.x = (moonSurfaceX + earthSurfaceX) / 2;
  group.add(cone);

  const penumbraMaterial = new THREE.MeshBasicMaterial({
    color: "#8798b8",
    transparent: true,
    opacity: 0.07,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const penumbra = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.72, coneHeight, 48, 1, true), penumbraMaterial);
  penumbra.rotation.z = -Math.PI / 2;
  penumbra.position.x = (moonSurfaceX + earthSurfaceX) / 2;
  group.add(penumbra);

  const umbra = mesh(
    new THREE.CircleGeometry(0.1, 48),
    new THREE.MeshBasicMaterial({
      color: "#05060a",
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  umbra.rotation.y = Math.PI / 2;
  umbra.position.set(earthX - earthRadius - 0.012, 0.03, 0.04);
  group.add(umbra);
  const umbraRing = mesh(
    new THREE.RingGeometry(0.1, 0.122, 48),
    new THREE.MeshBasicMaterial({
      color: "#ffc26e",
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  umbraRing.rotation.y = Math.PI / 2;
  umbraRing.position.copy(umbra.position);
  group.add(umbraRing);

  group.add(new THREE.AmbientLight("#33456e", 1.1));

  return {
    group,
    radius: plan.cameraDistance ?? 11.4,
    elevation: plan.orbitElevation ?? 0.28,
    update: (dt, elapsed) => {
      earth.rotation.y += dt * 0.05;
      moon.rotation.y += dt * 0.025;
      sunGlow.scale.setScalar(9.4 + Math.sin(elapsed * 0.45) * 0.16);
      umbraRing.scale.setScalar(1 + Math.sin(elapsed * 1.2) * 0.08);
    },
  };
}

function createLunarEclipseScene(plan: ScenePlan): BuiltScene {
  const group = new THREE.Group();
  const sunX = -6.2;
  const earthX = 0.1;
  const moonX = 4.6;
  const earthRadius = 1.05;

  const sunMaterial = new THREE.MeshBasicMaterial({ map: makeSunTexture(), color: "#fff0c0" });
  const sun = sphere(1.85, sunMaterial, 96, 64);
  sun.position.x = sunX;
  group.add(sun);
  applyTexture(sunMaterial, TEXTURES.sun, { srgb: true, repeat: true });
  const sunGlow = makeGlowSprite("#ffb35c", 8.6, 0.74);
  sunGlow.position.x = sunX;
  group.add(sunGlow);
  addPointLight(group, "#ffd39f", 3.2, 20).position.set(sunX, 0, 0);

  const earthGroup = new THREE.Group();
  earthGroup.position.x = earthX;
  const earth = sphere(earthRadius, createEarthMaterial(new THREE.Vector3(-1, 0, 0)), 128, 96);
  earthGroup.add(earth);
  addAtmosphere(earthGroup, earthRadius, "#6aa8ff", 0.72);
  group.add(earthGroup);

  const moonMaterial = new THREE.MeshStandardMaterial({
    color: "#b84931",
    emissive: "#5e170d",
    emissiveIntensity: 0.8,
    roughness: 0.92,
  });
  applyTextureToMaterial(moonMaterial, TEXTURES.moon);
  const moon = sphere(0.34, moonMaterial, 64, 48);
  moon.position.x = moonX;
  group.add(moon);
  const moonGlow = makeGlowSprite("#d35b3b", 1.5, 0.36);
  moonGlow.position.x = moonX;
  group.add(moonGlow);

  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: "#6a2a28",
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.66, 5.4, 48, 1, true), shadowMaterial);
  shadow.rotation.z = -Math.PI / 2;
  shadow.position.x = earthX + earthRadius + 2.7;
  group.add(shadow);

  const rimGlow = makeGlowSprite("#d35b3b", 2.2, 0.16);
  rimGlow.position.set(earthX + earthRadius * 0.92, 0.1, 0.2);
  group.add(rimGlow);

  group.add(new THREE.AmbientLight("#2b3c64", 1.1));

  return {
    group,
    radius: plan.cameraDistance ?? 11.0,
    elevation: plan.orbitElevation ?? 0.24,
    update: (dt, elapsed) => {
      earth.rotation.y += dt * 0.045;
      moon.rotation.y += dt * 0.012;
      moonGlow.scale.setScalar(1.5 + Math.sin(elapsed * 0.5) * 0.04);
      rimGlow.material.opacity = 0.13 + Math.sin(elapsed * 0.6) * 0.03;
    },
  };
}

function createSolarSystemScene(plan: ScenePlan): BuiltScene {
  const group = new THREE.Group();
  const sunMaterial = new THREE.MeshBasicMaterial({ map: makeSunTexture(), color: "#fff0c0" });
  const sun = sphere(1.05, sunMaterial, 96, 64);
  group.add(sun);
  applyTexture(sunMaterial, TEXTURES.sun, { srgb: true, repeat: true });
  const glow = makeGlowSprite("#ffc36d", 5.8, 0.68);
  group.add(glow);
  group.add(new THREE.AmbientLight("#3a3358", 0.7));
  addPointLight(group, "#ffd0a0", 3.4, 18);

  const planetData = [
    { id: "mercury", texture: TEXTURES.mercury, radius: 1.8, size: 0.075, speed: 0.72, atmosphere: undefined },
    { id: "venus", texture: TEXTURES.venus, radius: 2.35, size: 0.115, speed: 0.54, atmosphere: "#f3d9a4" },
    { id: "earth", texture: TEXTURES.earth, radius: 3.0, size: 0.125, speed: 0.42, atmosphere: "#5fa8ff" },
    { id: "mars", texture: TEXTURES.mars, radius: 3.7, size: 0.095, speed: 0.34, atmosphere: "#d9a071" },
    { id: "jupiter", texture: TEXTURES.jupiter, radius: 4.85, size: 0.34, speed: 0.24, atmosphere: "#d8b48a" },
    { id: "saturn", texture: TEXTURES.saturn, radius: 6.1, size: 0.29, speed: 0.17, atmosphere: "#e8d3a2", rings: true },
    { id: "uranus", texture: TEXTURES.uranus, radius: 7.2, size: 0.19, speed: 0.12, atmosphere: "#a8e0e6" },
    { id: "neptune", texture: TEXTURES.neptune, radius: 8.2, size: 0.18, speed: 0.09, atmosphere: "#5b7fe0" },
  ];
  const planets: Array<{ mesh: THREE.Mesh; radius: number; speed: number; phase: number; spin: number }> = [];
  const rng = createRng(9);
  for (const data of planetData) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 160; i += 1) {
      const angle = (i / 160) * TAU;
      points.push(new THREE.Vector3(Math.cos(angle) * data.radius, 0, Math.sin(angle) * data.radius));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: "#7d9ed1", transparent: true, opacity: 0.13 }),
    );
    group.add(line);

    const material = new THREE.MeshStandardMaterial({
      map: makeRockyTexture(hash(data.id), "#7c7468", "#b9ad9b", { craters: 30 }),
      roughness: 0.92,
      metalness: 0,
    });
    applyTextureToMaterial(material, data.texture);
    const planet = sphere(data.size, material, 48, 32);
    group.add(planet);
    if (data.atmosphere) addAtmosphere(planet, data.size, data.atmosphere, 0.3);
    if (data.rings) {
      const rings = makeRingBands(data.size * 1.35, data.size * 2.3, ["#eadfc9", "#c7b695", "#f4ecd9"]);
      rings.rotation.z = THREE.MathUtils.degToRad(26.7);
      planet.add(rings);
    }
    planets.push({
      mesh: planet,
      radius: data.radius,
      speed: data.speed,
      phase: rng() * TAU,
      spin: 0.05 + rng() * 0.08,
    });
  }

  return {
    group,
    radius: plan.cameraDistance ?? 13.5,
    elevation: plan.orbitElevation ?? 0.52,
    update: (dt, elapsed) => {
      sun.rotation.y += dt * 0.018;
      for (const planet of planets) {
        const angle = planet.phase + elapsed * planet.speed * 0.2;
        planet.mesh.position.set(Math.cos(angle) * planet.radius, 0, Math.sin(angle) * planet.radius);
        planet.mesh.rotation.y += dt * planet.spin;
      }
    },
  };
}

function createMeteorShowerScene(plan: ScenePlan): BuiltScene {
  const group = new THREE.Group();
  const earthRadius = 1.32;
  const earth = sphere(earthRadius, createEarthMaterial(new THREE.Vector3(0.4, 0.3, 0.8)), 128, 96);
  group.add(earth);
  addAtmosphere(group, earthRadius, "#5ba8ff", 0.7);
  addSolarLighting(group, 1.6, 0.9);

  const meteorCount = 110;
  const rng = createRng(2024);
  const positions = new Float32Array(meteorCount * 6);
  const speeds: number[] = [];
  const lengths: number[] = [];
  const phases: number[] = [];
  const directions: THREE.Vector3[] = [];
  const radiant = new THREE.Vector3(-3.4, 2.3, -1.8);
  for (let i = 0; i < meteorCount; i += 1) {
    directions.push(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize());
    speeds.push(0.8 + rng() * 2.4);
    lengths.push(0.3 + rng() * 0.9);
    phases.push(2 + rng() * 9);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: "#d7e7ff",
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  group.add(lines);
  const radiantGlow = makeGlowSprite("#9ecbff", 1.5, 0.28);
  radiantGlow.position.copy(radiant);
  group.add(radiantGlow);

  function resetMeteor(index: number, elapsed: number): void {
    const direction = directions[index];
    const distance = 4.2 + rng() * 3;
    const base = direction.clone().multiplyScalar(distance).add(radiant);
    const start = new THREE.Vector3(
      base.x + (rng() - 0.5) * 5,
      base.y + (rng() - 0.5) * 4,
      base.z + (rng() - 0.5) * 5,
    );
    const velocity = direction.clone().add(new THREE.Vector3(0, -0.25, 0)).normalize();
    const offset = ((elapsed * speeds[index] + phases[index]) % 6) / 6;
    const pos = start.clone().add(velocity.clone().multiplyScalar(offset * 3));
    const tail = pos.clone().sub(velocity.clone().multiplyScalar(lengths[index]));
    const blocked =
      pos.distanceTo(earth.position) < earthRadius + 0.35 ||
      tail.distanceTo(earth.position) < earthRadius + 0.35 ||
      makeSegmentIntersectsSphere(pos, tail, earth.position, earthRadius + 0.25);
    if (blocked) {
      positions[index * 6] = 0;
      positions[index * 6 + 1] = 0;
      positions[index * 6 + 2] = 0;
      positions[index * 6 + 3] = 0;
      positions[index * 6 + 4] = 0;
      positions[index * 6 + 5] = 0;
      return;
    }
    positions[index * 6] = pos.x;
    positions[index * 6 + 1] = pos.y;
    positions[index * 6 + 2] = pos.z;
    positions[index * 6 + 3] = tail.x;
    positions[index * 6 + 4] = tail.y;
    positions[index * 6 + 5] = tail.z;
  }

  for (let i = 0; i < meteorCount; i += 1) resetMeteor(i, 0);
  geometry.attributes.position.needsUpdate = true;

  return {
    group,
    radius: plan.cameraDistance ?? 5.4,
    elevation: plan.orbitElevation ?? 0.24,
    update: (dt, elapsed) => {
      earth.rotation.y += dt * 0.025;
      for (let i = 0; i < meteorCount; i += 1) resetMeteor(i, elapsed);
      geometry.attributes.position.needsUpdate = true;
    },
  };
}

function createExoplanetScene(plan: ScenePlan): BuiltScene {
  const group = new THREE.Group();
  const isTrappist = plan.bodyId === "exoplanet-trappist";

  if (isTrappist) {
    const starMaterial = new THREE.MeshBasicMaterial({ color: "#ff7a45" });
    const star = sphere(0.55, starMaterial, 64, 48);
    group.add(star);
    const starGlow = makeGlowSprite("#ff8a55", 3.4, 0.6);
    group.add(starGlow);
    addPointLight(group, "#ff9a6a", 3.2, 4.5);
    group.add(new THREE.AmbientLight("#2c2138", 1.2));

    const habitable = mesh(
      new THREE.RingGeometry(2.35, 3.15, 128),
      new THREE.MeshBasicMaterial({
        color: "#63e6b0",
        transparent: true,
        opacity: 0.07,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    habitable.rotation.x = Math.PI / 2;
    group.add(habitable);

    const planets: Array<{ mesh: THREE.Mesh; radius: number; speed: number; phase: number }> = [];
    const palette = ["#c7a98a", "#8fc9c2", "#5d9ccc", "#b98f78", "#7aa8c7", "#d0b28d", "#9b7f6a"];
    for (let i = 0; i < 7; i += 1) {
      const material = new THREE.MeshStandardMaterial({
        map: makePlanetTexture(700 + i, accentPalette(palette[i])),
        roughness: 0.74,
        metalness: 0.02,
      });
      const planet = sphere(0.075 + (i % 3) * 0.018, material, 48, 32);
      group.add(planet);
      if (i === 1 || i === 2 || i === 3) {
        addAtmosphere(planet, 0.075 + (i % 3) * 0.018, "#7fe3c4", 0.55);
      }
      const orbit = mesh(
        new THREE.RingGeometry(1.35 + i * 0.48 - 0.003, 1.35 + i * 0.48 + 0.003, 96),
        new THREE.MeshBasicMaterial({
          color: "#9ab4c8",
          transparent: true,
          opacity: 0.08,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      orbit.rotation.x = Math.PI / 2;
      group.add(orbit);
      planets.push({
        mesh: planet,
        radius: 1.35 + i * 0.48,
        speed: 0.38 / Math.sqrt(1 + i * 0.4),
        phase: (i / 7) * TAU,
      });
    }
    const dust = addStarDust(group, 260, 6.5, "#ffb48a", 73);
    (dust.material as THREE.PointsMaterial).opacity = 0.28;

    return {
      group,
      radius: plan.cameraDistance ?? 7.4,
      elevation: plan.orbitElevation ?? 0.32,
      update: (dt, elapsed) => {
        star.rotation.y += dt * 0.035;
        starGlow.material.opacity = 0.5 + Math.sin(elapsed * 0.8) * 0.08;
        planets.forEach((planet) => {
          const angle = planet.phase + elapsed * planet.speed * 0.5;
          planet.mesh.position.set(Math.cos(angle) * planet.radius, 0.02, Math.sin(angle) * planet.radius);
          planet.mesh.rotation.y += dt * 0.2;
        });
      },
    };
  }

  const planetSeed = plan.seed ?? 4001;
  const palette = ["#4a2c63", "#a971c9", "#e3a85f", "#3b7b8b", "#d6c7ef"];
  const planetMaterial = new THREE.MeshStandardMaterial({
    map: makePlanetTexture(planetSeed, palette),
    roughness: 0.72,
    metalness: 0.04,
  });
  const planet = sphere(1.28, planetMaterial, 128, 96);
  planet.position.x = 1.25;
  group.add(planet);
  addAtmosphere(group, 1.28, "#ca9cff", 0.7).position.x = 1.25;
  addSolarLighting(group, 2.4, 0.8);
  const star = makeGlowSprite("#ff9a5c", 2.6, 0.64);
  star.position.set(-2.7, 1.1, -1.4);
  group.add(star);
  const starCore = sphere(0.28, new THREE.MeshBasicMaterial({ color: "#ff8a55" }), 32, 24);
  starCore.position.copy(star.position);
  group.add(starCore);
  addPointLight(group, "#ff8a55", 2.8, 7).position.copy(star.position);

  const moonA = sphere(0.1, new THREE.MeshStandardMaterial({ color: "#b9a6c8", roughness: 1 }), 32, 24);
  const moonB = sphere(0.06, new THREE.MeshStandardMaterial({ color: "#d7c4a5", roughness: 1 }), 24, 18);
  group.add(moonA, moonB);
  addStarDust(group, 220, 6, "#d9a8ff", 41);

  return {
    group,
    radius: plan.cameraDistance ?? 6.8,
    elevation: plan.orbitElevation ?? 0.24,
    update: (dt, elapsed) => {
      planet.rotation.y += dt * 0.035;
      starCore.rotation.y += dt * 0.1;
      star.material.opacity = 0.56 + Math.sin(elapsed * 0.7) * 0.08;
      moonA.position.set(1.25 + Math.cos(elapsed * 0.35) * 2.3, 0.3, Math.sin(elapsed * 0.35) * 2.3);
      moonB.position.set(1.25 + Math.cos(-elapsed * 0.25 + 2) * 2.9, -0.2, Math.sin(-elapsed * 0.25 + 2) * 2.9);
    },
  };
}

function createDiscoveryScene(plan: ScenePlan): BuiltScene {
  if (plan.imageUrls?.length) return createDeepSpaceScene(plan);
  return createGenericOrbScene(plan);
}

function createGenericOrbScene(plan: ScenePlan): BuiltScene {
  const seed = plan.seed ?? 34;
  const group = new THREE.Group();
  const palette = accentPalette(plan.accent);
  const planet = sphere(
    1.18,
    new THREE.MeshStandardMaterial({ map: makePlanetTexture(seed, palette), roughness: 0.8, metalness: 0.05 }),
    128,
    96,
  );
  group.add(planet);
  addAtmosphere(group, 1.2, palette[2], 0.7);
  addSolarLighting(group, 2.8, 0.7);
  const moon = sphere(0.08, new THREE.MeshStandardMaterial({ color: palette[2], roughness: 1 }), 24, 18);
  group.add(moon);
  addStarDust(group, 240, 6, palette[2], seed);

  return {
    group,
    radius: plan.cameraDistance ?? 4.7,
    elevation: plan.orbitElevation ?? 0.18,
    update: (dt, elapsed) => {
      planet.rotation.y += dt * 0.03;
      moon.position.set(Math.cos(elapsed * 0.4) * 2.0, 0.2, Math.sin(elapsed * 0.4) * 2.0);
    },
  };
}

export function buildScene(plan: ScenePlan): BuiltScene {
  switch (plan.type) {
    case "earth":
      return createEarthScene(plan);
    case "solar-eclipse":
      return createSolarEclipseScene(plan);
    case "lunar-eclipse":
      return createLunarEclipseScene(plan);
    case "inner-core":
      return createInnerCoreScene(plan);
    case "sun":
      return createSunScene(plan);
    case "planet":
      return createPlanetScene(plan);
    case "aurora":
      return createAuroraScene(plan);
    case "earth-phenomenon":
      return createEarthPhenomenonScene(plan);
    case "deep-space":
      return createDeepSpaceScene(plan);
    case "spacecraft":
      return createSpacecraftScene(plan);
    case "solar-system":
      return createSolarSystemScene(plan);
    case "meteor-shower":
      return createMeteorShowerScene(plan);
    case "exoplanet":
      return createExoplanetScene(plan);
    case "discovery":
      return createDiscoveryScene(plan);
    case "generic-orb":
    default:
      return createGenericOrbScene(plan);
  }
}
