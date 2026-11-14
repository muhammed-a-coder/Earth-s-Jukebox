import type { Subject, SubjectFact } from "../types";
import { ALL_BODIES, BODY_INDEX, DEFAULT_BODY } from "./bodies";
import {
  getFullMoonFacts,
  getHurricaneSeasonFacts,
  getLunarEclipseFacts,
  getMeteorShowerFacts,
  getSolarEclipseFacts,
} from "./events";
import type { BodyRecord } from "./body";

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "of", "to", "in", "on", "at", "for",
  "with", "and", "or", "but", "what", "which", "who", "whom", "whose", "why", "how", "when", "where",
  "do", "does", "did", "can", "could", "would", "should", "will", "shall", "may", "might", "i", "you",
  "it", "its", "this", "that", "these", "those", "me", "my", "we", "our", "us", "about", "into", "from",
  "as", "by", "there", "their", "they", "he", "she", "his", "her", "them", "than", "then", "so", "if",
  "tell", "show", "explain", "please", "really", "very", "much", "many", "some", "any", "get", "got",
  "like", "have", "has", "had", "also", "just", "now", "see", "look", "picture", "image", "video",
  "tour", "visit", "explore", "learn", "more", "facts", "fact", "info", "information",
]);

interface IndexedAlias {
  record: BodyRecord;
  alias: string;
}

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u2018\u2019']s\b/g, "s")
    .replace(/[^a-z0-9*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(input: string): string[] {
  return [...new Set(normalize(input).split(" ").filter((word) => word.length > 1 && !STOP_WORDS.has(word)))];
}

const ALIAS_INDEX: IndexedAlias[] = ALL_BODIES.flatMap((record) =>
  record.aliases.map((alias) => ({ record, alias: normalize(alias) })),
).filter((entry) => entry.alias.length > 0);

// Long descriptive aliases should beat short generic ones when both match.
ALIAS_INDEX.sort((a, b) => b.alias.length - a.alias.length);

function aliasScore(query: string, alias: string): number {
  if (!alias) return 0;
  if (query === alias) return 1_000 + alias.length * 3;
  const padded = ` ${query} `;
  if (padded.includes(` ${alias} `)) return 400 + alias.length * 2;
  if (query.startsWith(`${alias} `) || query.endsWith(` ${alias}`)) return 300 + alias.length;
  return 0;
}

function tokenScore(record: BodyRecord, words: string[]): number {
  if (!words.length) return 0;
  const haystack = new Set(
    [record.title, ...record.aliases].flatMap((value) => normalize(value).split(" ")).filter(Boolean),
  );
  let matched = 0;
  for (const word of words) {
    if (haystack.has(word)) matched += 1;
  }
  if (matched === 0) return 0;
  return matched * 24 + (matched === words.length ? 30 : 0) + Math.min(record.title.length, 24) * 0.2;
}

interface Candidate {
  record: BodyRecord;
  score: number;
  exact: boolean;
}

function rank(query: string): Candidate[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  const words = tokens(query);
  const scores = new Map<string, Candidate>();
  const bump = (record: BodyRecord, score: number, exact = false) => {
    const current = scores.get(record.id);
    if (!current || score > current.score) {
      scores.set(record.id, { record, score, exact: exact || Boolean(current?.exact) });
    }
  };

  // Title and alias phrase matches carry the most weight.
  for (const record of ALL_BODIES) {
    const title = normalize(record.title);
    if (normalized === title) bump(record, 1_200 + title.length * 3, true);
    else if (` ${normalized} `.includes(` ${title} `)) bump(record, 500 + title.length, true);
  }
  for (const entry of ALIAS_INDEX) {
    const score = aliasScore(normalized, entry.alias);
    if (score > 0) bump(entry.record, score, score >= 1_000);
  }
  for (const record of ALL_BODIES) {
    const score = tokenScore(record, words);
    if (score > 0) bump(record, score);
  }

  return [...scores.values()].sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title));
}

function dynamicFactsFor(record: BodyRecord, now: Date): SubjectFact[] {
  switch (record.dynamicFacts) {
    case "solar-eclipse":
      return getSolarEclipseFacts(now);
    case "lunar-eclipse":
      return getLunarEclipseFacts(now);
    case "full-moon":
      return getFullMoonFacts(now);
    case "meteor-shower":
      return getMeteorShowerFacts(now);
    case "hurricane-season":
      return getHurricaneSeasonFacts(now);
    default:
      return [];
  }
}

function toSubject(
  record: BodyRecord,
  rawQuery: string,
  now: Date,
  options: { closestMatch?: boolean; matchNote?: string } = {},
): Subject {
  const facts = [...record.facts, ...dynamicFactsFor(record, now)];
  return {
    id: record.id,
    title: record.title,
    category: record.category,
    query: rawQuery,
    scene: record.scene,
    facts,
    briefing: record.briefing,
    sceneDescription: record.sceneDescription,
    suggestedQuestions: record.suggestedQuestions,
    nasaQuery: record.nasaQuery,
    svsQuery: record.svsQuery,
    horizonsTarget: record.horizonsTarget,
    links: record.links,
    context: record.context,
    closestMatch: options.closestMatch,
    matchNote: options.matchNote,
    sourceKind: options.closestMatch ? "closest-match" : "registry",
  };
}

function chooseClosest(rawQuery: string): { record: BodyRecord; note: string } {
  const candidates = rank(rawQuery);
  const best = candidates.find((candidate) => candidate.score >= 12) ?? null;
  if (best) {
    return {
      record: best.record,
      note: `No exact entry for "${rawQuery}", so the closest real NASA subject is ${best.record.title}.`,
    };
  }
  const words = tokens(rawQuery);
  const label = words.length ? words.join(" and ") : rawQuery;
  return {
    record: DEFAULT_BODY,
    note: `No NASA object in this library matches "${rawQuery}" directly. Showing Earth as the nearest real subject; the NASA image search still runs for your words, "${label}".`,
  };
}

export function resolveSubject(rawQuery: string, now: Date): Subject {
  const query = rawQuery.trim();
  if (!query) return toSubject(DEFAULT_BODY, rawQuery, now);

  const normalized = normalize(query);
  const direct = BODY_INDEX[normalized];
  if (direct) return toSubject(direct, query, now);

  const candidates = rank(query);
  const best = candidates[0];
  if (best && best.score >= 250) {
    return toSubject(best.record, query, now);
  }

  const closest = chooseClosest(query);
  return toSubject(closest.record, query, now, {
    closestMatch: true,
    matchNote: closest.note,
  });
}

export const SEARCH_SUGGESTIONS = [
  "Jupiter's Great Red Spot",
  "M87 black hole",
  "Europa",
  "Aurora over Iceland",
  "Perseverance rover",
  "Carina Nebula",
  "Earth's inner core",
  "Saturn's rings",
];
