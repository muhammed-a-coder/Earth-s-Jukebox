import type { NasaImage, SourceLink, Subject, SvsResult } from "../types";
import { TEXTURES } from "./body";

const NASA_SEARCH = "https://images-api.nasa.gov/search";
const NASA_SCIENCE_MEDIA = "https://science.nasa.gov/wp-json/wp/v2/media";
const NASA_TIMEOUT = 14_000;

interface NasaApiItem {
  data?: Array<{
    nasa_id?: string;
    title?: string;
    description?: string;
    description_508?: string;
    date_created?: string;
    center?: string;
    photographer?: string;
    secondary_creator?: string;
    media_type?: string;
  }>;
  links?: Array<{ href?: string; rel?: string }>;
}

export function cleanText(input: string | undefined, maxLength = 1200): string {
  if (!input) return "";
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

async function fetchWithTimeout(url: string, timeoutMs = NASA_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      mode: "cors",
      credentials: "omit",
    });
    if (!response.ok) throw new Error(`NASA returned ${response.status}`);
    return response;
  } finally {
    window.clearTimeout(timer);
  }
}

function largeImageUrl(href: string): string {
  return href.replace(/~(thumb|small|medium)\.(jpe?g|png|webp)$/i, "~large.$2");
}

function relevanceScore(item: NasaApiItem, query: string): number {
  const data = item.data?.[0];
  if (!data || !item.links?.[0]?.href) return -100;
  if (data.media_type && data.media_type !== "image") return -100;
  const title = (data.title ?? "").toLowerCase();
  const description = (data.description ?? "").toLowerCase();
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && !["the", "and", "from", "with", "of", "earth"].includes(term));
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += 7;
    if (description.includes(term)) score += 2;
  }
  if (data.center?.toUpperCase().includes("JPL")) score += 1;
  if (/artist|illustration|concept|rendering/i.test(title)) score -= 2;
  if (item.links[0].href.includes("~orig")) score += 1;
  return score;
}

const imageCache = new Map<string, Promise<NasaImage | null>>();

async function searchNasaImageUncached(query: string): Promise<NasaImage | null> {
  const url = `${NASA_SEARCH}?q=${encodeURIComponent(query)}&media_type=image&page_size=40`;
  const response = await fetchWithTimeout(url);
  const payload = (await response.json()) as { collection?: { items?: NasaApiItem[] } };
  const items = payload.collection?.items ?? [];
  if (!items.length) return null;
  const ranked = items
    .map((item) => ({ item, score: relevanceScore(item, query) }))
    .filter((entry) => entry.score > -100)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  const chosen = ranked[0].item;
  const data = chosen.data![0];
  const href = chosen.links![0].href!;
  const creditParts = [cleanText(data.photographer, 80), cleanText(data.secondary_creator, 80), cleanText(data.center, 80)].filter(Boolean);
  return {
    id: data.nasa_id ?? "",
    title: cleanText(data.title, 200) || query,
    description: cleanText(data.description_508 ?? data.description, 1600),
    url: largeImageUrl(href),
    thumbUrl: href,
    credit: creditParts.length ? creditParts.join(" / ") : "NASA",
    date: data.date_created ?? "",
    pageUrl: data.nasa_id ? `https://images.nasa.gov/details/${encodeURIComponent(data.nasa_id)}` : "https://images.nasa.gov/",
  };
}

export function searchNasaImage(query: string): Promise<NasaImage | null> {
  const key = query.toLowerCase().trim();
  const cached = imageCache.get(key);
  if (cached) return cached;
  const promise = searchNasaImageUncached(query).catch((error) => {
    console.warn("NASA Images search failed:", error);
    return null;
  });
  imageCache.set(key, promise);
  return promise;
}

interface ScienceMediaItem {
  id?: number;
  date?: string;
  link?: string;
  title?: { rendered?: string };
  caption?: { rendered?: string };
  source_url?: string;
  media_details?: {
    sizes?: Record<string, { source_url?: string; width?: number; height?: number } | undefined>;
  };
}

function scienceMediaImageUrl(item: ScienceMediaItem): string {
  const sizes = item.media_details?.sizes ?? {};
  for (const key of ["large", "medium_large", "full", "medium", "thumbnail"]) {
    const url = sizes[key]?.source_url;
    if (url && /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url)) return url;
  }
  const source = item.source_url ?? "";
  if (/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(source)) return source;
  return "";
}

function scienceMediaScore(item: ScienceMediaItem, query: string): number {
  const title = cleanText(item.title?.rendered, 220).toLowerCase();
  const caption = cleanText(item.caption?.rendered, 600).toLowerCase();
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && !["the", "and", "from", "with", "nasa", "photo", "image"].includes(term));
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += 6;
    if (caption.includes(term)) score += 2;
  }
  if (/artist|illustration|concept|rendering|diagram|chart|logo|poster|infographic|graphic|icon/i.test(title)) {
    score -= 5;
  }
  if (item.media_details?.sizes?.large?.source_url) score += 1;
  return score;
}

const scienceImageCache = new Map<string, Promise<NasaImage | null>>();

async function searchScienceImageUncached(query: string): Promise<NasaImage | null> {
  const params = new URLSearchParams({
    search: query,
    per_page: "20",
    media_type: "image",
    _fields: "id,date,link,title,caption,source_url,media_details",
  });
  const response = await fetch(`${NASA_SCIENCE_MEDIA}?${params.toString()}`, {
    headers: { Accept: "application/json" },
    mode: "cors",
    credentials: "omit",
  });
  if (!response.ok) throw new Error(`NASA Science returned ${response.status}`);
  const items = (await response.json()) as ScienceMediaItem[];
  if (!Array.isArray(items) || !items.length) return null;
  const ranked = items
    .map((item) => ({ item, score: scienceMediaScore(item, query), url: scienceMediaImageUrl(item) }))
    .filter((entry) => Boolean(entry.url))
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  const { item, url } = ranked[0];
  const title = cleanText(item.title?.rendered, 200) || query;
  return {
    id: item.id ? `science-${item.id}` : `science-${query}`,
    title,
    description: cleanText(item.caption?.rendered, 1600),
    url,
    thumbUrl: url,
    credit: "NASA Science",
    date: item.date ?? "",
    pageUrl: item.link ?? "https://science.nasa.gov/",
  };
}

/**
 * NASA Science's WordPress media library is CORS-enabled and covers missions,
 * spacecraft and phenomena that are missing from the older Images API.
 */
export function searchScienceImage(query: string): Promise<NasaImage | null> {
  const key = query.toLowerCase().trim();
  const cached = scienceImageCache.get(key);
  if (cached) return cached;
  const promise = searchScienceImageUncached(query).catch((error) => {
    console.warn("NASA Science image search failed:", error);
    return null;
  });
  scienceImageCache.set(key, promise);
  return promise;
}

const svsCache = new Map<string, Promise<SvsResult | null>>();

interface SvsApiResponse {
  results?: Array<{
    id?: number;
    url?: string;
    result_type?: string;
    release_date?: string;
    title?: string;
    description?: string;
  }>;
}

/**
 * NASA SVS does not consistently expose CORS headers. We try the live search
 * API, then quietly fall back to a source link if the browser is blocked.
 */
export function searchNasaSvs(query: string): Promise<SvsResult | null> {
  const key = query.toLowerCase().trim();
  const cached = svsCache.get(key);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const response = await fetchWithTimeout(
        `https://svs.gsfc.nasa.gov/api/search/?search=${encodeURIComponent(query)}`,
        7_000,
      );
      const payload = (await response.json()) as SvsApiResponse;
      const hit = (payload.results ?? []).find((result) => result.title && result.result_type !== "Page");
      if (!hit?.title) return null;
      return {
        title: cleanText(hit.title, 200),
        url: hit.url ?? (hit.id ? `https://svs.gsfc.nasa.gov/${hit.id}/` : "https://svs.gsfc.nasa.gov/"),
        description: cleanText(hit.description, 320),
        date: hit.release_date ?? "",
      };
    } catch {
      return null;
    }
  })();
  svsCache.set(key, promise);
  return promise;
}

export interface JplTelemetry {
  distance: string;
  date: string;
}

/**
 * Best-effort live distance from JPL Horizons. The public Horizons endpoint
 * does not send Access-Control-Allow-Origin, so this usually falls back
 * silently; the panel always links to the live tool.
 */
export async function fetchJplTelemetry(target: string): Promise<JplTelemetry | null> {
  try {
    const now = new Date();
    const start = now.toISOString().slice(0, 10);
    const stop = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
    const params = new URLSearchParams({
      format: "json",
      COMMAND: `'${target}'`,
      OBJ_DATA: "'NO'",
      MAKE_EPHEM: "'YES'",
      EPHEM_TYPE: "'OBSERVER'",
      CENTER: "'500@399'",
      START_TIME: `'${start}'`,
      STOP_TIME: `'${stop}'`,
      STEP_SIZE: "'1d'",
      QUANTITIES: "'20'",
    });
    const response = await fetchWithTimeout(`https://ssd.jpl.nasa.gov/api/horizons.api?${params}`, 6_500);
    const payload = (await response.json()) as { result?: string };
    const block = payload.result?.split("$$SOE")[1]?.split("$$EOE")[0]?.trim();
    if (!block) return null;
    const line = block.split("\n")[0];
    const tokens = line.trim().split(/\s+/);
    const numeric = tokens.filter((token) => /^-?\d+(\.\d+)?$/.test(token));
    if (numeric.length < 2) return null;
    const distanceAu = Number(numeric[numeric.length - 2]);
    if (!Number.isFinite(distanceAu) || distanceAu <= 0) return null;
    return {
      distance: `${(distanceAu * 149.5978707).toFixed(1)} million kilometers from Earth`,
      date: start,
    };
  } catch {
    return null;
  }
}

function gibsPanoramaUrl(layer: string, date?: string): string {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: layer,
    STYLES: "",
    FORMAT: "image/jpeg",
    TRANSPARENT: "FALSE",
    HEIGHT: "512",
    WIDTH: "1024",
    CRS: "EPSG:4326",
    BBOX: "-90,-180,90,180",
  });
  if (date) params.set("TIME", date);
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params.toString()}`;
}

/**
 * A guaranteed real-NASA image for the panel. It prefers the subject's own
 * texture or NASA image, then a live GIBS layer, then a bundled NASA asset.
 * The panel therefore never falls back to a drawing or an empty box.
 */
export function fallbackImageForSubject(subject: Subject): NasaImage {
  const scene = subject.scene;
  const earthLike =
    scene.type === "earth" ||
    scene.type === "earth-phenomenon" ||
    scene.type === "aurora" ||
    scene.type === "inner-core" ||
    scene.bodyId === "earth";
  let url = "";
  if (scene.layer) url = gibsPanoramaUrl(scene.layer, scene.layerDate);
  if (!url && scene.imageUrls?.length) url = scene.imageUrls.find(Boolean) ?? "";
  if (!url && scene.textureUrl) url = scene.textureUrl;
  if (!url && scene.bodyId) url = (TEXTURES as Record<string, string>)[scene.bodyId] ?? "";
  if (!url) url = earthLike ? "/nasa-fallback-earth.jpg" : "/nasa-fallback-space.jpg";
  return {
    id: `scene-${subject.id}`,
    title: `${subject.title} — NASA imagery`,
    description: subject.sceneDescription,
    url,
    thumbUrl: url,
    credit: "NASA",
    date: "",
    pageUrl: subject.links?.[0]?.url ?? "https://images.nasa.gov/",
  };
}

export function buildSources(subject: Subject): SourceLink[] {
  const sources: SourceLink[] = [
    {
      label: "NASA Image and Video Library",
      url: `https://images.nasa.gov/search?q=${encodeURIComponent(subject.nasaQuery)}`,
      note: "Photographs and descriptions are fetched live in your browser.",
    },
  ];
  if (subject.svsQuery) {
    sources.push({
      label: "NASA Scientific Visualization Studio",
      url: `https://svs.gsfc.nasa.gov/search/?search=${encodeURIComponent(subject.svsQuery)}`,
      note: "Visualizations from NASA Goddard's SVS.",
    });
  }
  if (subject.horizonsTarget) {
    sources.push({
      label: "NASA/JPL Horizons",
      url: "https://ssd.jpl.nasa.gov/horizons/app.html",
      note: "Live positions and orbits from Solar System Dynamics.",
    });
  }
  if (["solar-eclipse", "lunar-eclipse"].includes(subject.id)) {
    sources.push({
      label: "NASA eclipse catalog",
      url: "https://eclipse.gsfc.nasa.gov/eclipse.html",
      note: "The live source for eclipse dates and paths.",
    });
  }
  for (const link of subject.links ?? []) {
    const baseUrl = link.url.split("#")[0];
    const duplicate = sources.some(
      (source) =>
        source.url.split("#")[0] === baseUrl ||
        source.label.toLowerCase() === link.label.toLowerCase(),
    );
    if (!duplicate) sources.push(link);
  }
  return sources;
}
