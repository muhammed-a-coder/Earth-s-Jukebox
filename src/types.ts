export type SceneType =
  | "earth"
  | "solar-eclipse"
  | "lunar-eclipse"
  | "inner-core"
  | "sun"
  | "planet"
  | "aurora"
  | "earth-phenomenon"
  | "deep-space"
  | "spacecraft"
  | "solar-system"
  | "meteor-shower"
  | "exoplanet"
  | "discovery"
  | "generic-orb";

export interface SceneMoon {
  id: string;
  name: string;
  radiusKm: number;
  distanceKm: number;
  textureUrl?: string;
  /** Real NASA/JPL image used for a moon with no equirectangular map. */
  imageUrl?: string;
  color?: string;
  note?: string;
}

export interface GeoLocation {
  lat: number;
  lon: number;
}

export interface ScenePlan {
  type: SceneType;
  seed?: number;
  accent?: string;
  cameraDistance?: number;
  orbitElevation?: number;
  label?: string;
  /** Registry id resolved by the scene factory. */
  bodyId?: string;
  /** Optional override for the equirectangular surface texture. */
  textureUrl?: string;
  bumpUrl?: string;
  modelUrl?: string;
  /** Real NASA imagery, back layer first, for billboards and fallbacks. */
  imageUrls?: string[];
  moons?: SceneMoon[];
  /** Total confirmed moons, used for honest labels while only majors are modelled. */
  moonCount?: number;
  rings?: boolean;
  axialTiltDeg?: number;
  rotationHours?: number;
  atmosphereColor?: string;
  location?: GeoLocation;
  /** NASA GIBS layer used for an Earth phenomenon. */
  layer?: string;
  layerDate?: string;
  variant?: string;
}

export interface SubjectFact {
  label: string;
  value: string;
}

export interface SourceLink {
  label: string;
  url: string;
  note?: string;
}

export interface Subject {
  id: string;
  title: string;
  category: string;
  query: string;
  scene: ScenePlan;
  facts: SubjectFact[];
  briefing: string;
  sceneDescription: string;
  suggestedQuestions: string[];
  nasaQuery: string;
  svsQuery?: string;
  horizonsTarget?: string;
  links?: SourceLink[];
  /** Extra context used by the local chat fallback and AI grounding. */
  context?: string[];
  /** True when the query did not name a catalogued object and we chose the nearest real subject. */
  closestMatch?: boolean;
  matchNote?: string;
  sourceKind?: "registry" | "nasa-discovery" | "closest-match";
}

export interface NasaImage {
  id: string;
  title: string;
  description: string;
  url: string;
  thumbUrl: string;
  credit: string;
  date: string;
  pageUrl: string;
}

export interface ScienceImage {
  id: string;
  title: string;
  description: string;
  url: string;
  thumbUrl: string;
  credit: string;
  date: string;
  pageUrl: string;
}

export interface SvsResult {
  title: string;
  url: string;
  description: string;
  date: string;
}

export interface ImageState {
  status: "loading" | "ready" | "error";
  image: NasaImage | null;
  error?: string;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  source?: "nasa" | "ai" | "fallback";
  pending?: boolean;
}

export type AiStatus = "idle" | "unsupported" | "loading" | "ready" | "error";

export interface AiState {
  status: AiStatus;
  progress: number;
  message: string;
  error?: string;
  modelLabel?: string;
}
