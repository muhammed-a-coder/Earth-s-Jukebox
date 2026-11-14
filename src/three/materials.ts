import * as THREE from "three";
import { getEarthTextures, makeGlowTexture } from "./textures";

export function createEarthMaterial(sunDirection: THREE.Vector3): THREE.ShaderMaterial {
  const textures = getEarthTextures();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uDay: { value: textures.day },
      uNight: { value: textures.night },
      uSunDirection: { value: sunDirection.clone().normalize() },
      uAtmosphere: { value: new THREE.Color("#5c9dff") },
      uBumpStrength: { value: 2.6 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uDay;
      uniform sampler2D uNight;
      uniform vec3 uSunDirection;
      uniform vec3 uAtmosphere;
      uniform float uBumpStrength;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vWorldPos;

      float relief(vec2 uv) {
        vec3 sampleColor = texture2D(uDay, uv).rgb;
        return dot(sampleColor, vec3(0.299, 0.587, 0.114));
      }

      void main() {
        vec3 n = normalize(vNormalW);
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 sunDir = normalize(uSunDirection);

        // Use the real Blue Marble shaded relief as a bump source. Derive a
        // tangent frame from the sphere normal so mountains catch the light.
        vec3 up = abs(n.y) > 0.94 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
        vec3 tangent = normalize(cross(up, n));
        vec3 bitangent = normalize(cross(n, tangent));
        float texel = 0.0018;
        float hL = relief(vUv - vec2(texel, 0.0));
        float hR = relief(vUv + vec2(texel, 0.0));
        float hD = relief(vUv - vec2(0.0, texel));
        float hU = relief(vUv + vec2(0.0, texel));
        vec3 bumped = normalize(n + (tangent * (hR - hL) + bitangent * (hU - hD)) * uBumpStrength);

        float sunDot = dot(bumped, sunDir);
        float daylight = smoothstep(-0.14, 0.32, sunDot);

        vec3 day = texture2D(uDay, vUv).rgb;
        vec3 night = texture2D(uNight, vUv).rgb;
        night = night * vec3(1.0, 0.78, 0.48) * 1.55;

        float reliefLight = 1.0 + (hR + hL + hU + hD - relief(vUv) * 4.0) * 6.0;
        vec3 lit = day * (0.2 + 0.95 * clamp(sunDot, 0.0, 1.0)) * clamp(reliefLight, 0.82, 1.18);
        vec3 color = mix(night * 0.72, lit, daylight);

        float rim = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.0);
        color += uAtmosphere * rim * (0.18 + 0.55 * daylight);

        // Oceans are the blue-dominant parts of the real map.
        float ocean = smoothstep(0.035, 0.16, day.b - max(day.r, day.g));
        float spec = pow(max(dot(reflect(-sunDir, bumped), viewDir), 0.0), 42.0);
        color += vec3(1.0, 0.9, 0.7) * spec * (0.06 + ocean * 0.34) * daylight;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  getEarthTextures((updated) => {
    if (material.userData.disposed) return;
    material.uniforms.uDay.value = updated.day;
    material.uniforms.uNight.value = updated.night;
    material.needsUpdate = true;
  });

  return material;
}

export function createAtmosphereMaterial(color = "#5fa8ff", intensity = 0.85): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vWorldPos;
      void main() {
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vNormalW;
      varying vec3 vWorldPos;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float rim = pow(1.0 - abs(dot(normalize(vNormalW), viewDir)), 3.0);
        gl_FragColor = vec4(uColor, rim * uIntensity);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

export function addAtmosphere(
  parent: THREE.Object3D,
  radius: number,
  color = "#5fa8ff",
  intensity = 0.85,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.055, 64, 64),
    createAtmosphereMaterial(color, intensity),
  );
  mesh.renderOrder = 2;
  parent.add(mesh);
  return mesh;
}

export function makeGlowSprite(
  color: string,
  scale: number,
  opacity = 0.8,
  texture?: THREE.Texture,
): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture ?? makeGlowTexture(),
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }),
  );
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

export function makeRingBands(
  innerRadius: number,
  outerRadius: number,
  palette: string[] = ["#d8cdb8", "#b9aa91", "#efe6d1", "#8e826f"],
): THREE.Group {
  const group = new THREE.Group();
  const count = 42;
  for (let i = 0; i < count; i += 1) {
    const t0 = i / count;
    const t1 = (i + 1) / count;
    const widthScale = outerRadius - innerRadius;
    const r0 = innerRadius + t0 * widthScale;
    const r1 = innerRadius + t1 * widthScale;
    if (i % 7 === 0 || i % 11 === 0) continue;
    const geometry = new THREE.RingGeometry(r0, r1 + 0.008, 160, 1);
    const color = palette[i % palette.length];
    const material = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.22 + ((i * 37) % 50) / 100,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2;
    group.add(mesh);
  }
  return group;
}

export interface StarfieldOptions {
  count?: number;
  radius?: number;
  seed?: number;
}

export function createStarfield(options: StarfieldOptions = {}): THREE.Group {
  const { count = 3200, radius = 90, seed = 7 } = options;
  const group = new THREE.Group();
  let state = seed;
  const random = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };

  const positions: number[] = [];
  const colors: number[] = [];
  const sizes: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    const distance = radius * (0.6 + random() * 0.4);
    positions.push(
      Math.sin(phi) * Math.cos(theta) * distance,
      Math.cos(phi) * distance,
      Math.sin(phi) * Math.sin(theta) * distance,
    );
    const warmth = random();
    const color = new THREE.Color().setHSL(0.58 + warmth * 0.1, 0.18 + warmth * 0.22, 0.72 + random() * 0.24);
    colors.push(color.r, color.g, color.b);
    sizes.push(0.4 + random() * 1.3);
  }

  const glow = makeGlowTexture();
  const material = new THREE.PointsMaterial({
    size: 0.36,
    map: glow,
    transparent: true,
    opacity: 0.9,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const points = new THREE.Points(geometry, material);
  group.add(points);
  group.userData.rotationSpeed = 0.0022;
  return group;
}

export function addPointLight(
  parent: THREE.Object3D,
  color: string,
  intensity: number,
  distance = 0,
): THREE.PointLight {
  const light = new THREE.PointLight(color, intensity, distance, 2);
  parent.add(light);
  return light;
}
