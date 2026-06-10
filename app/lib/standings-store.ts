import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Redis } from "@upstash/redis";
import {
  buildCombinedRankings,
  type RankedParticipant,
  type TourResult,
} from "@/app/lib/rankings";

const PUBLISHED_STANDINGS_PATH = path.join("data", "published-standings.json");
const PUBLISHED_STANDINGS_REDIS_KEY = "published-standings";
const DEFAULT_QUALIFICATION_CUTOFF = 20;

type SnapshotRedisClient = {
  get: (key: string) => Promise<unknown | null>;
  set: (key: string, value: PublishedStandingsSnapshot) => Promise<unknown>;
};

let redisClient: SnapshotRedisClient | null = null;
let redisClientConfigKey: string | null = null;
let redisClientOverride: SnapshotRedisClient | null = null;

export type StandingsSource = "manual" | "codeforces";

export type PublishedStandingsSnapshot = {
  tour1: TourResult[];
  tour2: TourResult[];
  combinedRankings: RankedParticipant[];
  qualificationCutoff: number;
  source: StandingsSource;
  updatedAt: string;
};

export type SavePublishedStandingsInput = {
  tour1: TourResult[];
  tour2: TourResult[];
  qualificationCutoff?: number;
  source: StandingsSource;
};

export type StandingsApiResponse =
  | {
      status: "empty";
      message: string;
      snapshot: null;
    }
  | {
      status: "published";
      snapshot: PublishedStandingsSnapshot;
    };

export async function getPublishedStandingsResponse(): Promise<StandingsApiResponse> {
  const snapshot = await readPublishedStandings();

  if (!snapshot) {
    return {
      status: "empty",
      message: "Standings have not been published yet.",
      snapshot: null,
    };
  }

  return {
    status: "published",
    snapshot,
  };
}

export async function readPublishedStandings() {
  const store = getPublishedStandingsStore();
  const storedSnapshot = await store.read();

  if (storedSnapshot === null) {
    return null;
  }

  return parsePublishedStandingsSnapshot(parseStoredSnapshot(storedSnapshot));
}

export async function savePublishedStandings(input: SavePublishedStandingsInput) {
  const tour1 = validateTourResults(input.tour1, "tour1");
  const tour2 = validateTourResults(input.tour2, "tour2");
  const qualificationCutoff = validateQualificationCutoff(
    input.qualificationCutoff,
  );
  const snapshot: PublishedStandingsSnapshot = {
    tour1,
    tour2,
    combinedRankings: buildCombinedRankings(tour1, tour2, qualificationCutoff),
    qualificationCutoff,
    source: validateSource(input.source),
    updatedAt: new Date().toISOString(),
  };

  await getPublishedStandingsStore().save(snapshot);

  return snapshot;
}

export function setStandingsRedisClientForTests(
  client: SnapshotRedisClient | null,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Test Redis overrides are not available in production.");
  }

  redisClientOverride = client;
}

export function resetStandingsStoreForTests() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Test standings store reset is not available in production.");
  }

  redisClient = null;
  redisClientConfigKey = null;
  redisClientOverride = null;
}

function getPublishedStandingsStore() {
  const redisConfig = getRedisConfig();

  if (redisConfig) {
    return {
      read: () => getRedisClient(redisConfig).get(PUBLISHED_STANDINGS_REDIS_KEY),
      save: (snapshot: PublishedStandingsSnapshot) =>
        getRedisClient(redisConfig).set(PUBLISHED_STANDINGS_REDIS_KEY, snapshot),
    };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Standings storage configuration error: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production.",
    );
  }

  return {
    read: readPublishedStandingsFromFile,
    save: savePublishedStandingsToFile,
  };
}

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim() ?? "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";

  if (url && token) {
    return { url, token };
  }

  if (url || token) {
    throw new Error(
      "Standings storage configuration error: both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set, or neither.",
    );
  }

  return null;
}

function getRedisClient(config: { url: string; token: string }) {
  if (redisClientOverride) {
    return redisClientOverride;
  }

  const configKey = `${config.url}\n${config.token}`;

  if (!redisClient || redisClientConfigKey !== configKey) {
    redisClient = new Redis({
      url: config.url,
      token: config.token,
    }) as SnapshotRedisClient;
    redisClientConfigKey = configKey;
  }

  return redisClient;
}

async function readPublishedStandingsFromFile() {
  try {
    const snapshotText = await readFile(getPublishedStandingsPath(), "utf-8");
    return JSON.parse(snapshotText) as unknown;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

async function savePublishedStandingsToFile(
  snapshot: PublishedStandingsSnapshot,
) {
  const snapshotPath = getPublishedStandingsPath();

  await mkdir(path.dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
}

function parsePublishedStandingsSnapshot(value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Published standings snapshot is invalid.");
  }

  const snapshot = value as Partial<PublishedStandingsSnapshot>;
  const tour1 = validateTourResults(snapshot.tour1, "tour1");
  const tour2 = validateTourResults(snapshot.tour2, "tour2");
  const qualificationCutoff = validateQualificationCutoff(
    snapshot.qualificationCutoff,
  );
  const source = validateSource(snapshot.source);

  if (typeof snapshot.updatedAt !== "string") {
    throw new Error("Published standings snapshot is missing updatedAt.");
  }

  return {
    tour1,
    tour2,
    combinedRankings: buildCombinedRankings(tour1, tour2, qualificationCutoff),
    qualificationCutoff,
    source,
    updatedAt: snapshot.updatedAt,
  };
}

function parseStoredSnapshot(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("Published standings snapshot is invalid JSON.");
  }
}

function validateSource(value: unknown): StandingsSource {
  if (value === "manual" || value === "codeforces") {
    return value;
  }

  throw new Error("Standings source must be manual or codeforces.");
}

function validateQualificationCutoff(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_QUALIFICATION_CUTOFF;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error("Qualification cutoff must be a positive integer.");
  }

  return value;
}

function validateTourResults(value: unknown, field: "tour1" | "tour2") {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }

  return value.map((row, index) => validateTourResult(row, field, index + 1));
}

function validateTourResult(
  row: unknown,
  field: "tour1" | "tour2",
  rowNumber: number,
) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`${field} row ${rowNumber} must be an object.`);
  }

  const result = row as Partial<TourResult>;

  if (typeof result.handle !== "string" || result.handle.trim().length === 0) {
    throw new Error(`${field} row ${rowNumber} handle is invalid.`);
  }

  if (!isValidScore(result.score)) {
    throw new Error(`${field} row ${rowNumber} score is invalid.`);
  }

  if (!isValidScore(result.penalty)) {
    throw new Error(`${field} row ${rowNumber} penalty is invalid.`);
  }

  if (typeof result.official !== "boolean") {
    throw new Error(`${field} row ${rowNumber} official is invalid.`);
  }

  return {
    handle: result.handle.trim(),
    score: result.score,
    penalty: result.penalty,
    official: result.official,
  };
}

function isValidScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function getPublishedStandingsPath() {
  return PUBLISHED_STANDINGS_PATH;
}
