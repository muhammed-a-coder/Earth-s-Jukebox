import * as THREE from "three";

export type Rng = () => number;

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  const context = element.getContext("2d");
  if (!context) throw new Error("Canvas is not available");
  return [element, context];
}

function toTexture(
  element: HTMLCanvasElement,
  options: { srgb?: boolean; repeat?: boolean; anisotropy?: number } = {},
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = options.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (options.repeat !== false) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
  }
  texture.anisotropy = options.anisotropy ?? 4;
  texture.needsUpdate = true;
  return texture;
}

const GIBS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

function gibsUrl(layer: string, width = 2048, height = 1024): string {
  return `${GIBS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=${layer}&STYLES=&FORMAT=image/jpeg&SRS=EPSG:4326&BBOX=-180,-90,180,90&WIDTH=${width}&HEIGHT=${height}`;
}

/** Transparent NASA GIBS overlay for an Earth phenomenon, optionally for a date. */
export function gibsLayerUrl(layer: string, date?: string, width = 2048, height = 1024): string {
  const time = date ? `&TIME=${encodeURIComponent(date)}` : "";
  return `${GIBS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=${layer}&STYLES=&FORMAT=image/png&TRANSPARENT=TRUE&SRS=EPSG:4326&BBOX=-180,-90,180,90&WIDTH=${width}&HEIGHT=${height}${time}`;
}

export interface EarthTextureSet {
  day: THREE.Texture;
  night: THREE.Texture;
}

let earthTextureSet: EarthTextureSet | null = null;
let earthTextureLoading: Promise<EarthTextureSet> | null = null;

function makeEarthFallback(): EarthTextureSet {
  const rng = createRng(1987);
  const [dayCanvas, day] = canvas(1024, 512);
  const ocean = day.createLinearGradient(0, 0, 0, 512);
  ocean.addColorStop(0, "#0a2d4f");
  ocean.addColorStop(0.45, "#0f4c78");
  ocean.addColorStop(0.55, "#0b3e67");
  ocean.addColorStop(1, "#082844");
  day.fillStyle = ocean;
  day.fillRect(0, 0, 1024, 512);

  // Soft turquoise eddies make the fallback feel like a living ocean.
  for (let i = 0; i < 90; i += 1) {
    const x = rng() * 1024;
    const y = rng() * 512;
    const radius = 8 + rng() * 60;
    const gradient = day.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(60, 150, 170, ${0.04 + rng() * 0.08})`);
    gradient.addColorStop(1, "rgba(10, 60, 90, 0)");
    day.fillStyle = gradient;
    day.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Stylised landmasses, not geography. Replaced by live NASA imagery on load.
  const land = [
    [145, 130, 150, 85],
    [230, 240, 90, 120],
    [380, 130, 160, 70],
    [520, 190, 75, 95],
    [600, 95, 130, 60],
    [740, 215, 140, 90],
    [860, 160, 70, 55],
    [90, 320, 100, 60],
    [320, 345, 70, 45],
    [800, 360, 90, 40],
  ];
  for (const [x, y, w, h] of land) {
    const gradient = day.createRadialGradient(x, y, 4, x, y, Math.max(w, h));
    gradient.addColorStop(0, "rgba(84, 112, 72, 0.95)");
    gradient.addColorStop(0.6, "rgba(62, 92, 58, 0.9)");
    gradient.addColorStop(1, "rgba(40, 70, 55, 0)");
    day.fillStyle = gradient;
    day.beginPath();
    day.ellipse(x, y, w, h, rng() * Math.PI, 0, Math.PI * 2);
    day.fill();
    for (let i = 0; i < 7; i += 1) {
      const px = x + (rng() - 0.5) * w * 1.6;
      const py = y + (rng() - 0.5) * h * 1.6;
      day.fillStyle = `rgba(${100 + rng() * 25}, ${120 + rng() * 25}, ${75 + rng() * 20}, ${0.12 + rng() * 0.12})`;
      day.beginPath();
      day.ellipse(px, py, 8 + rng() * 24, 6 + rng() * 18, rng() * Math.PI, 0, Math.PI * 2);
      day.fill();
    }
  }
  day.fillStyle = "rgba(225, 240, 248, 0.8)";
  day.fillRect(0, 0, 1024, 18);
  day.fillRect(0, 492, 1024, 20);

  const [nightCanvas, night] = canvas(1024, 512);
  night.fillStyle = "#01030a";
  night.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 900; i += 1) {
    const x = rng() * 1024;
    const y = 70 + rng() * 370;
    const light = rng();
    night.fillStyle = `rgba(255, ${160 + light * 70}, ${70 + light * 100}, ${0.2 + rng() * 0.8})`;
    const size = light > 0.92 ? 2.2 : 0.8;
    night.fillRect(x, y, size, size);
  }
  const dayTexture = toTexture(dayCanvas, { anisotropy: 8 });
  const nightTexture = toTexture(nightCanvas, { anisotropy: 8 });
  dayTexture.userData.shared = true;
  nightTexture.userData.shared = true;
  return { day: dayTexture, night: nightTexture };
}

export function getEarthTextures(onUpdate?: (textures: EarthTextureSet) => void): EarthTextureSet {
  if (!earthTextureLoading) {
    earthTextureSet = makeEarthFallback();
    earthTextureSet.day.userData.shared = true;
    earthTextureSet.night.userData.shared = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const load = (url: string, fallback: THREE.Texture, srgb: boolean) =>
      new Promise<THREE.Texture>((resolve) => {
        loader.load(
          url,
          (texture) => {
            texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            texture.anisotropy = 8;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.userData.shared = true;
            fallback.dispose();
            resolve(texture);
          },
          undefined,
          () => resolve(fallback),
        );
      });
    earthTextureLoading = Promise.all([
      load(gibsUrl("BlueMarble_ShadedRelief_Bathymetry"), earthTextureSet.day, true),
      load(gibsUrl("VIIRS_CityLights_2012"), earthTextureSet.night, true),
    ]).then(([day, night]) => {
      earthTextureSet = { day, night };
      return earthTextureSet;
    });
  }

  // Register the listener even when the fallback was already returned once;
  // otherwise the first Earth material keeps the procedural texture forever.
  if (onUpdate) void earthTextureLoading.then((textures) => onUpdate(textures));
  return earthTextureSet!;
}

export function makeGlowTexture(color = "rgba(255,255,255,1)"): THREE.CanvasTexture {
  const [element, ctx] = canvas(256, 256);
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.16, "rgba(255,255,255,0.82)");
  gradient.addColorStop(0.42, "rgba(255,255,255,0.22)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  return toTexture(element, { repeat: false });
}

export function makeGasGiantTexture(
  seed: number,
  palette: string[],
  options: { spot?: boolean; spotColor?: string } = {},
): THREE.CanvasTexture {
  const rng = createRng(seed);
  const width = 1024;
  const height = 512;
  const [element, ctx] = canvas(width, height);
  const colors = palette.length ? palette : ["#d8c3a5", "#b98b62", "#eadbc4", "#8f6248"];
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, width, height);

  let y = 0;
  while (y < height) {
    const bandHeight = 10 + rng() * 46;
    const color = colors[Math.floor(rng() * colors.length)];
    ctx.globalAlpha = 0.4 + rng() * 0.55;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= width; x += 16) {
      const wobble = Math.sin(x * 0.015 + y * 0.02) * 3 + (rng() - 0.5) * 4;
      ctx.lineTo(x, y + wobble);
    }
    ctx.lineTo(width, y + bandHeight);
    for (let x = width; x >= 0; x -= 16) {
      const wobble = Math.sin(x * 0.011 + y * 0.03) * 3 + (rng() - 0.5) * 5;
      ctx.lineTo(x, y + bandHeight + wobble);
    }
    ctx.closePath();
    ctx.fill();
    y += bandHeight;
  }

  ctx.globalAlpha = 0.32;
  for (let i = 0; i < 280; i += 1) {
    const x = rng() * width;
    const streaks = 1 + rng() * 3;
    const shade = colors[Math.floor(rng() * colors.length)];
    ctx.strokeStyle = shade;
    ctx.lineWidth = 1 + rng() * 5;
    ctx.beginPath();
    for (let s = 0; s <= streaks; s += 1) {
      const sy = rng() * height;
      ctx.moveTo(x, sy);
      ctx.bezierCurveTo(x + 40, sy - 8, x + 80, sy + 8, x + 140 + rng() * 160, sy + (rng() - 0.5) * 12);
    }
    ctx.stroke();
  }

  if (options.spot) {
    const cx = width * 0.68;
    const cy = height * 0.63;
    const spotColor = options.spotColor ?? "#9e3e2d";
    const gradient = ctx.createRadialGradient(cx, cy, 4, cx, cy, 95);
    gradient.addColorStop(0, spotColor);
    gradient.addColorStop(0.45, "rgba(151, 65, 45, 0.92)");
    gradient.addColorStop(0.8, "rgba(110, 65, 50, 0.4)");
    gradient.addColorStop(1, "rgba(90, 60, 50, 0)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 100, 64, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "rgba(255, 210, 176, 0.6)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, 38 + i * 16, 22 + i * 10, -0.08, 0, Math.PI * 1.55);
      ctx.stroke();
    }
  }

  // Soft polar darkening.
  const polar = ctx.createLinearGradient(0, 0, 0, height);
  polar.addColorStop(0, "rgba(35, 48, 62, 0.5)");
  polar.addColorStop(0.15, "rgba(35, 48, 62, 0)");
  polar.addColorStop(0.85, "rgba(25, 35, 50, 0)");
  polar.addColorStop(1, "rgba(25, 35, 50, 0.55)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = polar;
  ctx.fillRect(0, 0, width, height);

  return toTexture(element, { anisotropy: 8 });
}

export function makeRockyTexture(
  seed: number,
  base: string,
  accent: string,
  options: { craters?: number; icy?: boolean } = {},
): THREE.CanvasTexture {
  const rng = createRng(seed);
  const [element, ctx] = canvas(1024, 512);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1024, 512);

  for (let i = 0; i < 2200; i += 1) {
    const x = rng() * 1024;
    const y = rng() * 512;
    const r = 1 + rng() * 9;
    ctx.globalAlpha = 0.04 + rng() * 0.14;
    ctx.fillStyle = rng() > 0.5 ? accent : "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const craters = options.craters ?? 90;
  for (let i = 0; i < craters; i += 1) {
    const x = rng() * 1024;
    const y = 30 + rng() * 452;
    const r = 3 + rng() * 24;
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = "rgba(20, 20, 25, 0.65)";
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.55 + rng() * 0.3), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "rgba(255, 240, 220, 0.7)";
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.03, r * 0.65, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }

  const poles = ctx.createLinearGradient(0, 0, 0, 512);
  poles.addColorStop(0, options.icy ? "rgba(235,245,255,0.85)" : "rgba(235,245,255,0.22)");
  poles.addColorStop(0.12, "rgba(235,245,255,0)");
  poles.addColorStop(0.88, "rgba(235,245,255,0)");
  poles.addColorStop(1, options.icy ? "rgba(235,245,255,0.8)" : "rgba(235,245,255,0.2)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = poles;
  ctx.fillRect(0, 0, 1024, 512);

  return toTexture(element, { anisotropy: 8 });
}

export function makeSunTexture(): THREE.CanvasTexture {
  const rng = createRng(440);
  const [element, ctx] = canvas(1024, 512);
  const base = ctx.createLinearGradient(0, 0, 0, 512);
  base.addColorStop(0, "#ffdf8a");
  base.addColorStop(0.5, "#ffb347");
  base.addColorStop(1, "#ff8a2a");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1024, 512);

  for (let i = 0; i < 900; i += 1) {
    const x = rng() * 1024;
    const y = rng() * 512;
    const radius = 2 + rng() * 26;
    const bright = rng();
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, bright > 0.5 ? "rgba(255,255,220,0.34)" : "rgba(180,54,10,0.29)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  return toTexture(element, { anisotropy: 8 });
}

export function makeAuroraTexture(): THREE.CanvasTexture {
  const rng = createRng(1969);
  const [element, ctx] = canvas(512, 512);
  ctx.clearRect(0, 0, 512, 512);
  const gradient = ctx.createLinearGradient(0, 512, 0, 0);
  gradient.addColorStop(0, "rgba(80,255,170,0.85)");
  gradient.addColorStop(0.35, "rgba(46,220,160,0.55)");
  gradient.addColorStop(0.72, "rgba(80,190,255,0.22)");
  gradient.addColorStop(1, "rgba(130,160,255,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, 512);
  for (let x = 0; x <= 512; x += 8) {
    const y = 60 + Math.sin(x * 0.035 + rng() * 0.4) * 28 + Math.sin(x * 0.011) * 40 + rng() * 16;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(512, 512);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 80; i += 1) {
    const x = rng() * 512;
    const y = 20 + rng() * 400;
    const h = 30 + rng() * 200;
    const glow = ctx.createLinearGradient(x, y, x, y + h);
    glow.addColorStop(0, "rgba(120,255,210,0)");
    glow.addColorStop(0.4, "rgba(90,255,190,0.2)");
    glow.addColorStop(1, "rgba(40,160,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, 2 + rng() * 5, h);
  }
  return toTexture(element, { repeat: false });
}

export function makeHurricaneTexture(seed = 42): THREE.CanvasTexture {
  const rng = createRng(seed);
  const size = 1024;
  const [element, ctx] = canvas(size, size);
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  ctx.translate(cx, cy);
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  for (let arm = 0; arm < 18; arm += 1) {
    const offset = (arm / 18) * Math.PI * 2 + rng() * 0.3;
    ctx.beginPath();
    for (let step = 0; step < 160; step += 1) {
      const t = step / 160;
      const radius = 35 + t * 465;
      const angle = offset + t * 4.3 + Math.sin(t * 18 + arm) * 0.09;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * 0.92;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(232, 244, 255, ${0.07 + rng() * 0.1})`;
    ctx.lineWidth = 3 + rng() * 16;
    ctx.stroke();
  }

  for (let i = 0; i < 1400; i += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = 50 + Math.pow(rng(), 0.6) * 470;
    const x = Math.cos(angle) * radius + (rng() - 0.5) * 34;
    const y = Math.sin(angle) * radius * 0.92 + (rng() - 0.5) * 34;
    const r = 1 + rng() * 10;
    const alpha = 0.025 + rng() * 0.12;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `rgba(245,250,255,${alpha})`);
    gradient.addColorStop(1, "rgba(245,250,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Clear out a calm eye.
  ctx.globalCompositeOperation = "destination-out";
  const eye = ctx.createRadialGradient(0, 0, 4, 0, 0, 64);
  eye.addColorStop(0, "rgba(0,0,0,0.95)");
  eye.addColorStop(0.55, "rgba(0,0,0,0.7)");
  eye.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = eye;
  ctx.beginPath();
  ctx.arc(0, 0, 64, 0, Math.PI * 2);
  ctx.fill();

  const texture = toTexture(element, { repeat: false });
  return texture;
}

export function makePlanetTexture(seed: number, palette: string[], cloudy = true): THREE.CanvasTexture {
  const rng = createRng(seed);
  const [element, ctx] = canvas(1024, 512);
  ctx.fillStyle = palette[0] ?? "#6a5acd";
  ctx.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 120; i += 1) {
    const x = rng() * 1024;
    const y = rng() * 512;
    const r = 20 + rng() * 120;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, palette[1 + Math.floor(rng() * Math.max(1, palette.length - 1))] ?? "#a78bfa");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.18 + rng() * 0.25;
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  if (cloudy) {
    for (let i = 0; i < 70; i += 1) {
      ctx.globalAlpha = 0.06 + rng() * 0.15;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(rng() * 1024, rng() * 512, 20 + rng() * 90, 5 + rng() * 14, rng() * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return toTexture(element, { anisotropy: 8 });
}

export function makeGradientTexture(inner: string, outer: string, size = 256): THREE.CanvasTexture {
  const [element, ctx] = canvas(size, size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.45, outer);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return toTexture(element, { repeat: false });
}

export function makeNebulaTexture(seed: number): THREE.CanvasTexture {
  const rng = createRng(seed);
  const [element, ctx] = canvas(512, 512);
  ctx.clearRect(0, 0, 512, 512);
  for (let i = 0; i < 70; i += 1) {
    const x = 100 + rng() * 312;
    const y = 100 + rng() * 312;
    const r = 30 + rng() * 150;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    const hue = rng() > 0.5 ? "255,160,210" : "120,190,255";
    gradient.addColorStop(0, `rgba(${hue},0.13)`);
    gradient.addColorStop(0.4, `rgba(${hue},0.06)`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 450; i += 1) {
    ctx.fillStyle = `rgba(255,255,255,${0.2 + rng() * 0.8})`;
    ctx.fillRect(rng() * 512, rng() * 512, 0.7 + rng() * 1.8, 0.7 + rng() * 1.8);
  }
  return toTexture(element, { repeat: false });
}

/**
 * Soft cloud alpha map for the Earth cloud shell. The surface underneath is
 * real NASA imagery; this only supplies the moving cloud veil.
 */
export function makeCloudTexture(seed = 2026): THREE.CanvasTexture {
  const rng = createRng(seed);
  const width = 1024;
  const height = 512;
  const [element, ctx] = canvas(width, height);
  ctx.clearRect(0, 0, width, height);

  // Broad tropical and mid-latitude cloud belts.
  for (let i = 0; i < 340; i += 1) {
    const belt = rng();
    let y: number;
    if (belt < 0.42) y = 120 + rng() * 120;
    else if (belt < 0.72) y = 250 + rng() * 100;
    else y = 40 + rng() * 120;
    const x = rng() * width;
    const radiusX = 10 + rng() * 64;
    const radiusY = 4 + rng() * 18;
    const alpha = 0.05 + rng() * 0.22;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radiusX);
    g.addColorStop(0, `rgba(255,255,255,${alpha})`);
    g.addColorStop(0.5, `rgba(255,255,255,${alpha * 0.55})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, radiusY / radiusX);
    ctx.beginPath();
    ctx.arc(0, 0, radiusX, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // A few long wisps and tropical storm spirals.
  for (let i = 0; i < 26; i += 1) {
    const cx = rng() * width;
    const cy = 80 + rng() * 350;
    const arms = 3 + Math.floor(rng() * 4);
    ctx.strokeStyle = `rgba(255,255,255,${0.08 + rng() * 0.12})`;
    ctx.lineWidth = 0.7 + rng() * 2.4;
    for (let arm = 0; arm < arms; arm += 1) {
      ctx.beginPath();
      for (let step = 0; step < 60; step += 1) {
        const t = step / 60;
        const angle = (arm / arms) * Math.PI * 2 + t * 4.5;
        const radius = 2 + t * (12 + rng() * 26);
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius * 0.6;
        if (step === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  const texture = toTexture(element, { anisotropy: 8 });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** A luminous auroral oval that hugs the curvature of a sphere. */
export function makeAuroraOvalTexture(seed = 1987): THREE.CanvasTexture {
  const rng = createRng(seed);
  const width = 2048;
  const height = 256;
  const [element, ctx] = canvas(width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = "lighter";

  const hues = [
    [80, 255, 178],
    [56, 232, 168],
    [92, 210, 255],
    [150, 140, 255],
  ];
  for (let i = 0; i < 900; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    const h = 18 + rng() * 150;
    const w = 1 + rng() * 4;
    const color = hues[Math.floor(rng() * hues.length)];
    const alpha = 0.025 + rng() * 0.11;
    const gradient = ctx.createLinearGradient(x, y, x, y + h);
    gradient.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},0)`);
    gradient.addColorStop(0.35, `rgba(${color[0]},${color[1]},${color[2]},${alpha})`);
    gradient.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, h);
  }

  // A soft continuous ribbon so the oval reads as one linked glow.
  const ribbon = ctx.createLinearGradient(0, 0, 0, height);
  ribbon.addColorStop(0, "rgba(80,255,180,0)");
  ribbon.addColorStop(0.38, "rgba(96,255,188,0.14)");
  ribbon.addColorStop(0.62, "rgba(80,220,255,0.11)");
  ribbon.addColorStop(1, "rgba(110,150,255,0)");
  ctx.fillStyle = ribbon;
  ctx.fillRect(0, 0, width, height);

  return toTexture(element, { anisotropy: 8 });
}

export function makeVolcanoTexture(seed: number): THREE.CanvasTexture {
  const rng = createRng(seed);
  const [element, ctx] = canvas(1024, 512);
  const base = ctx.createLinearGradient(0, 0, 0, 512);
  base.addColorStop(0, "#2b2624");
  base.addColorStop(0.5, "#3a2d28");
  base.addColorStop(1, "#1e1a19");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1024, 512);

  for (let i = 0; i < 2400; i += 1) {
    const x = rng() * 1024;
    const y = rng() * 512;
    const r = 1 + rng() * 10;
    ctx.globalAlpha = 0.03 + rng() * 0.1;
    ctx.fillStyle = rng() > 0.5 ? "#7a5c49" : "#141010";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lava lakes.
  for (let i = 0; i < 8; i += 1) {
    const x = rng() * 1024;
    const y = 100 + rng() * 300;
    const radius = 8 + rng() * 28;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, "rgba(255,242,180,0.95)");
    gradient.addColorStop(0.35, "rgba(255,132,30,0.9)");
    gradient.addColorStop(0.7, "rgba(177,46,8,0.6)");
    gradient.addColorStop(1, "rgba(60,18,4,0)");
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Branching, glowing fissures.
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 34; i += 1) {
    let x = rng() * 1024;
    let y = 40 + rng() * 432;
    const segments = 4 + Math.floor(rng() * 7);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < segments; s += 1) {
      x += (rng() - 0.5) * 90;
      y += (rng() - 0.55) * 55;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(255, ${100 + rng() * 70}, 28, ${0.28 + rng() * 0.45})`;
    ctx.lineWidth = 0.8 + rng() * 3.4;
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 226, 160, ${0.15 + rng() * 0.28})`;
    ctx.lineWidth = 0.5 + rng() * 1.2;
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";

  return toTexture(element, { anisotropy: 8 });
}
