import type { BodyRecord } from "../body";
import { EARTH_PHENOMENA } from "./earth";
import { METEOR_SHOWERS } from "./events";
import { MOONS } from "./moons";
import { PLANETS } from "./planets";
import { DEEP_SPACE } from "./deepspace";
import { SMALL_BODIES } from "./smallbodies";
import { SPACECRAFT } from "./spacecraft";

export const ALL_BODIES: BodyRecord[] = [
  ...PLANETS,
  ...MOONS,
  ...SMALL_BODIES,
  ...DEEP_SPACE,
  ...SPACECRAFT,
  ...EARTH_PHENOMENA,
  ...METEOR_SHOWERS,
];

export const BODY_INDEX: Record<string, BodyRecord> = Object.fromEntries(
  ALL_BODIES.map((record) => [record.id, record]),
);

export const DEFAULT_BODY = BODY_INDEX.earth;
