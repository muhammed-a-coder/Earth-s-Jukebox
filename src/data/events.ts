import type { SubjectFact } from "../types";

export interface EclipseRecord {
  date: string;
  type: "Total" | "Annular" | "Hybrid" | "Partial" | "Penumbral";
  duration?: string;
  region: string;
}

/**
 * Solar eclipse dates and visibility from NASA's GSFC eclipse catalog
 * (eclipse.gsfc.nasa.gov/SEdecade, F. Espenak). Kept as small factual records
 * because the NASA eclipse host does not send CORS headers; the app links to
 * the live catalog and labels these values as a verified snapshot.
 */
export const SOLAR_ECLIPSES: EclipseRecord[] = [
  { date: "2021-06-10", type: "Annular", duration: "3m 51s", region: "north Canada, Greenland, Russia" },
  { date: "2021-12-04", type: "Total", duration: "1m 54s", region: "Antarctica" },
  { date: "2022-04-30", type: "Partial", region: "southeast Pacific, southern South America" },
  { date: "2022-10-25", type: "Partial", region: "Europe, northeast Africa, Middle East, west Asia" },
  { date: "2023-04-20", type: "Hybrid", duration: "1m 16s", region: "Indonesia, Australia, Papua New Guinea" },
  { date: "2023-10-14", type: "Annular", duration: "5m 17s", region: "western US, Central America, Colombia, Brazil" },
  { date: "2024-04-08", type: "Total", duration: "4m 28s", region: "Mexico, central US, eastern Canada" },
  { date: "2024-10-02", type: "Annular", duration: "7m 25s", region: "southern Chile, southern Argentina" },
  { date: "2025-03-29", type: "Partial", region: "northwest Africa, Europe, northwest Russia" },
  { date: "2025-09-21", type: "Partial", region: "south Pacific, New Zealand, Antarctica" },
  { date: "2026-02-17", type: "Annular", duration: "2m 20s", region: "Antarctica" },
  { date: "2026-08-12", type: "Total", duration: "2m 18s", region: "Arctic, Greenland, Iceland, Spain" },
  { date: "2027-02-06", type: "Annular", duration: "7m 51s", region: "Chile, Argentina, Atlantic Ocean" },
  { date: "2027-08-02", type: "Total", duration: "6m 23s", region: "Morocco, Spain, Algeria, Libya, Egypt, Saudi Arabia, Yemen, Somalia" },
  { date: "2028-01-26", type: "Annular", duration: "10m 27s", region: "Ecuador, Peru, Brazil, Suriname, Spain, Portugal" },
  { date: "2028-07-22", type: "Total", duration: "5m 10s", region: "Australia, New Zealand" },
  { date: "2029-01-14", type: "Partial", region: "North America, Central America" },
  { date: "2029-06-12", type: "Partial", region: "Arctic, Scandinavia, Alaska, northern Asia, northern Canada" },
  { date: "2029-07-11", type: "Partial", region: "southern Chile, southern Argentina" },
  { date: "2029-12-05", type: "Partial", region: "southern Argentina, southern Chile, Antarctica" },
  { date: "2030-06-01", type: "Annular", duration: "5m 21s", region: "Algeria, Tunisia, Greece, Turkey, Russia, northern China, Japan" },
  { date: "2030-11-25", type: "Total", duration: "3m 44s", region: "Botswana, South Africa, Australia" },
  { date: "2031-05-21", type: "Annular", duration: "5m 26s", region: "Angola, Congo, Zambia, Tanzania, southern India, Malaysia, Indonesia" },
  { date: "2031-11-14", type: "Hybrid", duration: "1m 8s", region: "Pacific Ocean, Panama" },
  { date: "2032-05-09", type: "Annular", duration: "0m 22s", region: "southern Atlantic Ocean" },
  { date: "2032-11-03", type: "Partial", region: "Asia" },
  { date: "2033-03-30", type: "Total", duration: "2m 37s", region: "eastern Russia, Alaska" },
  { date: "2033-09-23", type: "Partial", region: "southern South America, Antarctica" },
  { date: "2034-03-20", type: "Total", duration: "4m 09s", region: "Nigeria, Cameroon, Chad, Sudan, Egypt, Saudi Arabia, Iran, Afghanistan, Pakistan, India, China" },
  { date: "2034-09-12", type: "Annular", duration: "2m 58s", region: "Chile, Bolivia, Argentina, Paraguay, Brazil" },
  { date: "2035-03-09", type: "Annular", duration: "0m 48s", region: "New Zealand, Pacific Ocean" },
  { date: "2035-09-02", type: "Total", duration: "2m 54s", region: "China, Korea, Japan, Pacific Ocean" },
  { date: "2036-02-27", type: "Partial", region: "Antarctica, southern Australia, New Zealand" },
  { date: "2036-07-23", type: "Partial", region: "southern Atlantic Ocean" },
  { date: "2036-08-21", type: "Partial", region: "Alaska, Canada, Arctic, western Europe, northwest Africa" },
  { date: "2037-01-16", type: "Partial", region: "northern Africa, Europe, Middle East, west Asia" },
  { date: "2037-07-13", type: "Total", duration: "3m 58s", region: "Australia, New Zealand" },
  { date: "2038-01-05", type: "Annular", duration: "3m 18s", region: "Cuba, Dominican Republic, Côte d'Ivoire, Ghana, Niger, Chad, Egypt" },
  { date: "2038-07-02", type: "Annular", duration: "1m 00s", region: "Colombia, Venezuela, Mauritania, Morocco, Mali, Niger, Chad, Sudan, Ethiopia, Kenya" },
  { date: "2038-12-26", type: "Total", duration: "2m 18s", region: "Australia, New Zealand, southern Pacific Ocean" },
  { date: "2039-06-21", type: "Annular", duration: "4m 05s", region: "Alaska, northern Canada, Norway, Sweden, Finland, Estonia, Russia" },
  { date: "2039-12-15", type: "Total", duration: "1m 51s", region: "Antarctica" },
  { date: "2040-05-11", type: "Partial", region: "Australia, New Zealand, Antarctica" },
  { date: "2040-11-04", type: "Partial", region: "North America, Central America" },
];

export const LUNAR_ECLIPSES: EclipseRecord[] = [
  { date: "2024-03-25", type: "Penumbral", region: "the Americas" },
  { date: "2024-09-18", type: "Partial", region: "the Americas, Europe, Africa" },
  { date: "2025-03-14", type: "Total", duration: "1h 05m", region: "Pacific, the Americas, western Europe and Africa" },
  { date: "2025-09-07", type: "Total", duration: "1h 22m", region: "Europe, Africa, Asia, Australia" },
  { date: "2026-03-03", type: "Total", duration: "58m", region: "eastern Asia, Australia, Pacific, the Americas" },
  { date: "2026-08-28", type: "Partial", region: "eastern Pacific, the Americas, Europe, Africa" },
  { date: "2027-02-20", type: "Penumbral", region: "the Americas, Europe, Africa, Asia" },
  { date: "2027-07-18", type: "Penumbral", region: "eastern Africa, Asia, Australia, Pacific" },
  { date: "2027-08-17", type: "Penumbral", region: "Pacific, the Americas" },
  { date: "2028-01-12", type: "Partial", region: "the Americas, Europe, Africa" },
  { date: "2028-07-06", type: "Partial", region: "Europe, Africa, Asia, Australia" },
  { date: "2028-12-31", type: "Total", duration: "1h 06m", region: "Europe, Africa, Asia, Australia, Pacific" },
  { date: "2029-06-26", type: "Total", duration: "1h 42m", region: "the Americas, Europe, Africa, Middle East" },
  { date: "2029-12-20", type: "Total", duration: "54m", region: "the Americas, Europe, Africa, Asia" },
  { date: "2030-06-15", type: "Partial", region: "Europe, Africa, Asia, Australia" },
  { date: "2030-12-09", type: "Penumbral", region: "the Americas, Europe, Africa, Asia" },
  { date: "2031-05-07", type: "Penumbral", region: "the Americas, Europe, Africa" },
  { date: "2031-10-30", type: "Penumbral", region: "the Americas" },
  { date: "2032-04-25", type: "Total", duration: "1h 06m", region: "eastern Africa, Asia, Australia, Pacific" },
  { date: "2032-10-18", type: "Total", duration: "1h 03m", region: "Africa, Europe, Asia, Australia" },
];

export const MAJOR_METEOR_SHOWERS = [
  { name: "Quadrantids", peak: "01-03", parent: "asteroid 2003 EH1" },
  { name: "Lyrids", peak: "04-22", parent: "comet Thatcher" },
  { name: "Eta Aquariids", peak: "05-06", parent: "comet Halley" },
  { name: "Perseids", peak: "08-12", parent: "comet Swift-Tuttle" },
  { name: "Orionids", peak: "10-21", parent: "comet Halley" },
  { name: "Leonids", peak: "11-17", parent: "comet Tempel-Tuttle" },
  { name: "Geminids", peak: "12-14", parent: "asteroid 3200 Phaethon" },
  { name: "Ursids", peak: "12-22", parent: "comet 8P/Tuttle" },
];

const DAY_MS = 86_400_000;
const SYNODIC_MONTH = 29.530588853;
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14);

export function formatDate(date: Date, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(date);
}

export function parseEventDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function dateOnly(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function describeEclipse(eclipse: EclipseRecord): string {
  const date = formatDate(parseEventDate(eclipse.date));
  const duration = eclipse.duration ? `, ${eclipse.duration}` : "";
  return `${date} — ${eclipse.type.toLowerCase()}${duration}; visible across ${eclipse.region}`;
}

export function getSolarEclipseFacts(now: Date): SubjectFact[] {
  const today = dateOnly(now);
  const lastTotal = [...SOLAR_ECLIPSES]
    .reverse()
    .find((e) => e.type === "Total" && dateOnly(parseEventDate(e.date)) < today);
  const nextTotal = SOLAR_ECLIPSES.find(
    (e) => e.type === "Total" && dateOnly(parseEventDate(e.date)) >= today,
  );
  const nextAny = SOLAR_ECLIPSES.find((e) => dateOnly(parseEventDate(e.date)) >= today);
  return [
    { label: "Last total solar eclipse", value: lastTotal ? describeEclipse(lastTotal) : "Check NASA's eclipse catalog" },
    { label: "Next total solar eclipse", value: nextTotal ? describeEclipse(nextTotal) : "Check NASA's eclipse catalog" },
    { label: "Next solar eclipse of any kind", value: nextAny ? describeEclipse(nextAny) : "Check NASA's eclipse catalog" },
    {
      label: "Why it happens",
      value: "The Moon passes directly between the Sun and Earth, and its narrow shadow races across Earth's surface.",
    },
    {
      label: "Safety",
      value: "Never look directly at a partial eclipse without certified eclipse glasses. Only the brief total phase is safe to view with unaided eyes, and only from inside the path of totality.",
    },
  ];
}

export function getLunarEclipseFacts(now: Date): SubjectFact[] {
  const today = dateOnly(now);
  const lastTotal = [...LUNAR_ECLIPSES]
    .reverse()
    .find((e) => e.type === "Total" && dateOnly(parseEventDate(e.date)) < today);
  const nextTotal = LUNAR_ECLIPSES.find(
    (e) => e.type === "Total" && dateOnly(parseEventDate(e.date)) >= today,
  );
  const nextAny = LUNAR_ECLIPSES.find((e) => dateOnly(parseEventDate(e.date)) >= today);
  return [
    { label: "Last total lunar eclipse", value: lastTotal ? describeEclipse(lastTotal) : "Check NASA's eclipse catalog" },
    { label: "Next total lunar eclipse", value: nextTotal ? describeEclipse(nextTotal) : "Check NASA's eclipse catalog" },
    { label: "Next lunar eclipse of any kind", value: nextAny ? describeEclipse(nextAny) : "Check NASA's eclipse catalog" },
    {
      label: "Why the Moon turns red",
      value: "Earth blocks direct sunlight, but its atmosphere bends red-orange light into the shadow. That light paints the Moon copper or blood red.",
    },
    { label: "Safety", value: "Lunar eclipses are completely safe to watch with the naked eye, binoculars, or a telescope." },
  ];
}

export function getNextFullMoon(now: Date): { last: Date; next: Date } {
  const daysSinceEpoch = (now.getTime() - NEW_MOON_EPOCH) / DAY_MS;
  const fullOffset = SYNODIC_MONTH / 2;
  const lastCycle = Math.floor((daysSinceEpoch - fullOffset) / SYNODIC_MONTH);
  const last = new Date(NEW_MOON_EPOCH + (lastCycle * SYNODIC_MONTH + fullOffset) * DAY_MS);
  const next = new Date(last.getTime() + SYNODIC_MONTH * DAY_MS);
  return { last, next };
}

export function getFullMoonFacts(now: Date): SubjectFact[] {
  const { last, next } = getNextFullMoon(now);
  return [
    { label: "Next full moon", value: `${formatDate(next)} (approximately, UTC)` },
    { label: "Previous full moon", value: `${formatDate(last)} (approximately, UTC)` },
    { label: "Cycle", value: "A full moon arrives about every 29.53 days." },
    { label: "Why we see a full face", value: "The Sun lights the whole Earth-facing side of the Moon, so its bright disk is completely illuminated." },
  ];
}

function dateForYear(monthDay: string, year: number): Date {
  const [month, day] = monthDay.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function getMeteorShowerFacts(now: Date): SubjectFact[] {
  const year = now.getUTCFullYear();
  const candidates = MAJOR_METEOR_SHOWERS.flatMap((shower) => [
    { ...shower, when: dateForYear(shower.peak, year - 1) },
    { ...shower, when: dateForYear(shower.peak, year) },
    { ...shower, when: dateForYear(shower.peak, year + 1) },
  ]).sort((a, b) => a.when.getTime() - b.when.getTime());
  const next = candidates.find((s) => s.when.getTime() > now.getTime());
  const last = [...candidates].reverse().find((s) => s.when.getTime() <= now.getTime());
  return [
    { label: "Next major shower", value: next ? `${next.name} — peaks around ${formatDate(next.when)}. Its parent is ${next.parent}.` : "Check the International Meteor Organization." },
    { label: "Last major shower", value: last ? `${last.name} — peaked around ${formatDate(last.when)}.` : "Check the International Meteor Organization." },
    { label: "Best way to watch", value: "Find a dark sky, let your eyes adapt for 20 minutes, lie back, and look away from the radiant. No telescope is needed." },
    { label: "What you are seeing", value: "Tiny grains of comet or asteroid dust hit the atmosphere at tens of kilometers per second and burn up as glowing streaks." },
  ];
}

export function getHurricaneSeasonFacts(now: Date): SubjectFact[] {
  const year = now.getUTCFullYear();
  const seasonStartThisYear = Date.UTC(year, 5, 1);
  const seasonEndThisYear = Date.UTC(year, 11, 1);
  const inSeason = now.getTime() >= seasonStartThisYear && now.getTime() < seasonEndThisYear;
  const beforeSeason = now.getTime() < seasonStartThisYear;
  const lastStart = new Date(
    inSeason ? seasonStartThisYear : beforeSeason ? Date.UTC(year - 1, 5, 1) : seasonStartThisYear,
  );
  const nextStart = new Date(
    inSeason || !beforeSeason ? Date.UTC(year + 1, 5, 1) : seasonStartThisYear,
  );
  return [
    { label: "Atlantic season", value: "June 1 to November 30 each year." },
    { label: "Last season began", value: formatDate(lastStart) },
    { label: "Next season begins", value: formatDate(nextStart) },
    { label: "Peak activity", value: "Most Atlantic storms form between mid-August and late October, with a peak around September 10." },
    {
      label: "Current status",
      value: inSeason
        ? "The Atlantic season is active. Check the National Hurricane Center for live storms."
        : "The Atlantic season is outside its official dates. Tropical cyclones can still form in other ocean basins.",
    },
  ];
}
