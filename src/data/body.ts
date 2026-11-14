import type { ScenePlan, SourceLink, SubjectFact } from "../types";

/** Curated, CORS-enabled NASA 3D Resources base URLs. */
const NASA_TEXTURE = "https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/Images%20and%20Textures/";
const NASA_MODEL = "https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/";

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function nasaTexture(path: string): string {
  return `${NASA_TEXTURE}${encodePath(path)}`;
}

export function nasaModel(path: string): string {
  return `${NASA_MODEL}${encodePath(path)}`;
}

/** Wikimedia Commons serves NASA-derived maps with CORS enabled. */
export const WIKI = "https://upload.wikimedia.org/wikipedia/commons/";

export const TEXTURES = {
  sun: `${WIKI}c/cb/Solarsystemscope_texture_2k_sun.jpg`,
  mercury: `${WIKI}9/92/Solarsystemscope_texture_2k_mercury.jpg`,
  moon: `${WIKI}2/26/Solarsystemscope_texture_2k_moon.jpg`,
  uranus: `${WIKI}9/95/Solarsystemscope_texture_2k_uranus.jpg`,
  neptune: `${WIKI}1/1e/Solarsystemscope_texture_2k_neptune.jpg`,
  jupiter: `${WIKI}1/1e/Jupiter_Cylindrical_Map_-_Dec_2000_PIA07782.jpg`,
  saturn: `${WIKI}e/ea/Solarsystemscope_texture_2k_saturn.jpg`,
  venus: nasaTexture("Venus/Venus.jpg"),
  mars: nasaTexture("Mars/Mars.jpg"),
  pluto: nasaTexture("Pluto/Pluto.jpg"),
  earth: nasaTexture("Earth (A)/Earth (A).jpg"),
  clouds: `${WIKI}e/ed/Solarsystemscope_texture_2k_earth_clouds.jpg`,
  io: nasaTexture("Jupiter - Io (A)/Jupiter - Io (A).jpg"),
  europa: nasaTexture("Jupiter - Europa/Jupiter - Europa.jpg"),
  ganymede: nasaTexture("Jupiter - Ganymede/Jupiter - Ganymede.jpg"),
  callisto: nasaTexture("Jupiter - Callisto/Jupiter - Callisto.jpg"),
} as const;

/** Verified NASA Science / NASA SVS imagery on the CORS-enabled assets host. */
export const IMAGERY = {
  carina:
    "https://assets.science.nasa.gov/dynamicimage/assets/science/cds/svs/a030000/a031100/a031186/eta-carina-cliffs_00468.png?w=1280&h=720&fit=clip",
  carinaWide:
    "https://assets.science.nasa.gov/dynamicimage/assets/science/cds/svs/a030000/a031100/a031186/eta-carina-cliffs_00468.png?w=1920&h=1080&fit=clip",
  orion:
    "https://assets.science.nasa.gov/dynamicimage/assets/science/cds/svs/a030000/a030900/a030947/orion_nebula-hst-9000x9000_searchweb.png",
  crab:
    "https://assets.science.nasa.gov/dynamicimage/assets/science/cds/svs/a030000/a030400/a030485/hs-2005-37-a-full_tif_searchweb.png",
  pillars:
    "https://assets.science.nasa.gov/dynamicimage/assets/science/cds/apod/apod/2015/january/hs-2015-01m16pillarsHST.jpg?w=982&h=1024&fit=clip",
  eagle:
    "https://assets.science.nasa.gov/dynamicimage/assets/science/cds/svs/a030000/a030900/a030960/STScI-H-M16wide_1x-1920x1080-00001_searchweb.png",
  andromeda:
    "https://assets.science.nasa.gov/dynamicimage/assets/science/cds/apod/apod/2026/november/Andromeda_closeupCruz4096.jpg?w=1280&h=906&fit=clip",
  sombrero:
    "https://assets.science.nasa.gov/dynamicimage/assets/science/cds/svs/a030000/a030900/a030995/STScI-H-Sombrero_combined-1920x1080_print.jpg",
  whirlpool:
    "https://assets.science.nasa.gov/dynamicimage/assets/science/missions/hubble/galaxies/spiral/M51_2.jpg?w=1280&h=888&fit=clip",
  m87:
    "https://assets.science.nasa.gov/content/dam/science/cds/apod/apod/2019/april/M87bh_EHT_2629.jpg",
  sgrA:
    "https://assets.science.nasa.gov/content/dam/science/cds/apod/apod/2024/april/SagAstarB_EHT_2000.jpg",
  deepField:
    "https://assets.science.nasa.gov/dynamicimage/assets/science/missions/webb/science/2022/07/STScI-01G8H15R2PGEXQD7TYYBFJ3FT4.png?w=1003&h=1024&fit=clip",
  horsehead:
    "https://assets.science.nasa.gov/dynamicimage/assets/science/cds/svs/a030000/a031200/a031283/STScI-01HWDBRBH7R86C2M8N7KQAZ8JR-horsehead-MIRI.png?w=1024&h=1024&fit=clip",
  ring:
    "https://assets.science.nasa.gov/dynamicimage/assets/science/cds/apod/apod/2013/june/m57_hst1280.jpg?w=1024&h=1024&fit=clip",
  pleiades:
    "https://assets.science.nasa.gov/dynamicimage/assets/science/cds/svs/a010000/a014900/a014928/Pleiades_members_gal_4K_searchweb.png",
  milkyWay:
    "https://assets.science.nasa.gov/dynamicimage/assets/science/astro/universe/quick-reads/how-big-is-our-galaxy/MilkyWay_size.png?w=1024&h=576&fit=clip",
  triangulum:
    "https://assets.science.nasa.gov/dynamicimage/assets/science/cds/apod/apod/2019/february/heic1901aTriangulum.jpg?w=1280&h=720&fit=clip",
  triton:
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a6/Triton_moon_mosaic_Voyager_2_%28large%29.jpg/1280px-Triton_moon_mosaic_Voyager_2_%28large%29.jpg",
  charon:
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2e/Charon_in_True_Color_-_High-Res.jpg/1280px-Charon_in_True_Color_-_High-Res.jpg",
  phobos:
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b9/Phobos_PIA10369.jpg/1280px-Phobos_PIA10369.jpg",
  deimosMap:
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/72/Deimos_map_by_Askaniy.png/1280px-Deimos_map_by_Askaniy.png",
  bennu:
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8d/Bennu_mosaic_OSIRIS-REx_%28square%29.png/1280px-Bennu_mosaic_OSIRIS-REx_%28square%29.png",
  comet67p:
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/81/Comet_67P_on_19_September_2014_NavCam_mosaic.jpg/1280px-Comet_67P_on_19_September_2014_NavCam_mosaic.jpg",
  halley:
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/75/Comet_Halley_ARC-1986-AC86-0720-4~orig.jpg/1280px-Comet_Halley_ARC-1986-AC86-0720-4~orig.jpg",
  psyche:
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0e/Psyche_asteroid_eso.jpg/1280px-Psyche_asteroid_eso.jpg",
  vesta:
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3f/Large_Asteroid_Vesta.png/1280px-Large_Asteroid_Vesta.png",
  ceres:
    "https://upload.wikimedia.org/wikipedia/commons/f/f6/PIA19633-Ceres-DwarfPlanet-Dawn-3rdMapOrbit-HAMO-image3-20150818.jpg",
  titan:
    "https://assets.science.nasa.gov/dynamicimage/assets/science/cds/apod/apod/2026/may/PIA21923_fig1SeeingTitan2400.jpg?w=993&h=1024&fit=clip",
  enceladus:
    "https://assets.science.nasa.gov/dynamicimage/assets/science/cds/svs/a010000/a014700/a014772/PIA11688_Enceladus_Plumes_Wide_print.jpg?w=1024&h=633&fit=clip",
} as const;

const imagesSearch = (query: string) => `https://images.nasa.gov/search?q=${encodeURIComponent(query)}`;

export function nasaImagesLink(query: string): SourceLink {
  return { label: "NASA Image and Video Library", url: imagesSearch(query), note: "Live photographs and captions." };
}

export function scienceLink(query: string): SourceLink {
  return { label: "NASA Science", url: `https://science.nasa.gov/?s=${encodeURIComponent(query)}` };
}

export type DynamicFacts = "solar-eclipse" | "lunar-eclipse" | "full-moon" | "meteor-shower" | "hurricane-season";

export interface BodyRecord {
  id: string;
  title: string;
  category: string;
  aliases: string[];
  facts: SubjectFact[];
  briefing: string;
  sceneDescription: string;
  suggestedQuestions: string[];
  scene: ScenePlan;
  nasaQuery: string;
  svsQuery?: string;
  horizonsTarget?: string;
  links?: SourceLink[];
  context?: string[];
  dynamicFacts?: DynamicFacts;
}

export type BodyRegistry = Record<string, BodyRecord>;
