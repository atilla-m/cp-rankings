import { Redis } from "@upstash/redis";
import {
  buildTourStandings,
  type RankedTourRow,
  type TourDisqualification,
  type TourId,
  type TourResult,
} from "@/app/lib/rankings";

const DEFAULT_QUALIFICATION_CUTOFF = 20;
const TOUR_STANDINGS_REDIS_KEYS: Record<TourId, string> = {
  "tour-1": "standings:tour-1",
  "tour-2": "standings:tour-2",
};
const LEGACY_PUBLISHED_STANDINGS_REDIS_KEY = "published-standings";

type SnapshotRedisClient = {
  get: (key: string) => Promise<unknown | null>;
  set: (key: string, value: PublishedTourStandingsSnapshot) => Promise<unknown>;
};

let redisClient: SnapshotRedisClient | null = null;
let redisClientConfigKey: string | null = null;
let redisClientOverride: SnapshotRedisClient | null = null;

export type StandingsSource = "manual" | "codeforces" | "legacy";

export type PublishedTourStandingsSnapshot = {
  tourId: TourId;
  rows: TourResult[];
  rankedRows: RankedTourRow[];
  qualificationCutoff: number;
  disqualifications: TourDisqualification[];
  source: StandingsSource;
  updatedAt: string;
};

export type SavePublishedTourStandingsInput = {
  tourId: TourId;
  rows: TourResult[];
  qualificationCutoff?: number;
  disqualifications?: TourDisqualification[];
  source: StandingsSource;
};

export type TourStandingsApiResponse =
  | {
      status: "empty";
      message: string;
      snapshot: null;
    }
  | {
      status: "published";
      snapshot: PublishedTourStandingsSnapshot;
    };

export async function getPublishedTourStandingsResponse(
  tourId: TourId,
): Promise<TourStandingsApiResponse> {
  const snapshot = await readPublishedTourStandings(tourId);

  if (!snapshot) {
    return {
      status: "empty",
      message: `${formatTourLabel(tourId)} standings have not been published yet.`,
      snapshot: null,
    };
  }

  return {
    status: "published",
    snapshot,
  };
}

export async function readPublishedTourStandings(tourId: TourId) {
  const validatedTourId = validateTourId(tourId);
  const store = getPublishedTourStandingsStore(validatedTourId);
  const storedSnapshot = await store.read();

  if (storedSnapshot !== null) {
    return parsePublishedTourStandingsSnapshot(
      parseStoredSnapshot(storedSnapshot),
      validatedTourId,
    );
  }

  const legacySnapshot = await store.readLegacy();

  if (legacySnapshot === null) {
    return null;
  }

  const migratedSnapshot = parseLegacyPublishedStandingsSnapshot(
    parseStoredSnapshot(legacySnapshot),
    validatedTourId,
  );

  if (migratedSnapshot === null) {
    return null;
  }

  await store.save(migratedSnapshot);

  return migratedSnapshot;
}

export async function savePublishedTourStandings(
  input: SavePublishedTourStandingsInput,
) {
  const tourId = validateTourId(input.tourId);
  const rows = validateTourResults(input.rows, "rows");
  const qualificationCutoff = validateQualificationCutoff(
    input.qualificationCutoff,
  );
  const disqualifications = validateDisqualifications(input.disqualifications);
  const snapshot: PublishedTourStandingsSnapshot = {
    tourId,
    rows,
    rankedRows: buildTourStandings({
      rows,
      qualificationCutoff,
      disqualifications,
    }),
    qualificationCutoff,
    disqualifications,
    source: validateSource(input.source),
    updatedAt: new Date().toISOString(),
  };

  await getPublishedTourStandingsStore(tourId).save(snapshot);

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

function getPublishedTourStandingsStore(tourId: TourId) {
  const redisConfig = getRedisConfig();

  if (redisConfig) {
    return {
      read: () =>
        getRedisClient(redisConfig).get(TOUR_STANDINGS_REDIS_KEYS[tourId]),
      readLegacy: () =>
        getRedisClient(redisConfig).get(LEGACY_PUBLISHED_STANDINGS_REDIS_KEY),
      save: (snapshot: PublishedTourStandingsSnapshot) =>
        getRedisClient(redisConfig).set(
          TOUR_STANDINGS_REDIS_KEYS[tourId],
          snapshot,
        ),
    };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Standings storage configuration error: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production.",
    );
  }

  return {
    read: () => readPublishedTourStandingsFromFile(tourId),
    readLegacy: readLegacyPublishedStandingsFromFile,
    save: (snapshot: PublishedTourStandingsSnapshot) =>
      savePublishedTourStandingsToFile(tourId, snapshot),
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

async function readPublishedTourStandingsFromFile(tourId: TourId) {
  const { readFile } = await import("node:fs/promises");

  try {
    const snapshotText = await readFile(getTourStandingsPath(tourId), "utf-8");
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

async function readLegacyPublishedStandingsFromFile() {
  const { readFile } = await import("node:fs/promises");

  try {
    const snapshotText = await readFile(getLegacyStandingsPath(), "utf-8");
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

async function savePublishedTourStandingsToFile(
  tourId: TourId,
  snapshot: PublishedTourStandingsSnapshot,
) {
  const { mkdir, writeFile } = await import("node:fs/promises");

  await mkdir(getDataDirectory(), { recursive: true });
  await writeFile(
    getTourStandingsPath(tourId),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );
}

function parsePublishedTourStandingsSnapshot(value: unknown, tourId: TourId) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Published standings snapshot is invalid.");
  }

  const snapshot = value as Partial<PublishedTourStandingsSnapshot>;
  const rows = validateTourResults(snapshot.rows, "rows");
  const qualificationCutoff = validateQualificationCutoff(
    snapshot.qualificationCutoff,
  );
  const disqualifications = validateDisqualifications(
    snapshot.disqualifications,
  );
  const source = validateSource(snapshot.source);

  if (snapshot.tourId !== undefined && snapshot.tourId !== tourId) {
    throw new Error("Published standings snapshot tourId does not match key.");
  }

  if (typeof snapshot.updatedAt !== "string") {
    throw new Error("Published standings snapshot is missing updatedAt.");
  }

  return {
    tourId,
    rows,
    rankedRows: buildTourStandings({
      rows,
      qualificationCutoff,
      disqualifications,
    }),
    qualificationCutoff,
    disqualifications,
    source,
    updatedAt: snapshot.updatedAt,
  };
}

function parseLegacyPublishedStandingsSnapshot(value: unknown, tourId: TourId) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Legacy published standings snapshot is invalid.");
  }

  const snapshot = value as {
    tour1?: unknown;
    tour2?: unknown;
    qualificationCutoff?: unknown;
    disqualifications?: unknown;
    source?: unknown;
    updatedAt?: unknown;
  };
  const rawRows = tourId === "tour-1" ? snapshot.tour1 : snapshot.tour2;

  if (rawRows === undefined) {
    return null;
  }

  const rows = validateTourResults(
    rawRows,
    tourId === "tour-1" ? "tour1" : "tour2",
  );

  if (rows.length === 0) {
    return null;
  }

  const qualificationCutoff = validateQualificationCutoff(
    snapshot.qualificationCutoff,
  );
  const disqualifications = validateDisqualifications(
    snapshot.disqualifications,
  );
  const source = parseLegacySource(snapshot.source);
  const updatedAt =
    typeof snapshot.updatedAt === "string"
      ? snapshot.updatedAt
      : new Date().toISOString();

  return {
    tourId,
    rows,
    rankedRows: buildTourStandings({
      rows,
      qualificationCutoff,
      disqualifications,
    }),
    qualificationCutoff,
    disqualifications,
    source,
    updatedAt,
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

function validateTourId(value: unknown): TourId {
  if (value === "tour-1" || value === "tour-2") {
    return value;
  }

  throw new Error("tourId must be tour-1 or tour-2.");
}

function validateSource(value: unknown): StandingsSource {
  if (value === "manual" || value === "codeforces" || value === "legacy") {
    return value;
  }

  throw new Error("Standings source must be manual, codeforces, or legacy.");
}

function parseLegacySource(value: unknown): StandingsSource {
  if (value === "manual" || value === "codeforces") {
    return value;
  }

  return "legacy";
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

function validateDisqualifications(value: unknown) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("disqualifications must be an array.");
  }

  const disqualifications: TourDisqualification[] = [];
  const seenHandles = new Set<string>();

  for (const [index, entry] of value.entries()) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`disqualifications row ${index + 1} must be an object.`);
    }

    const disqualification = entry as Partial<TourDisqualification>;

    if (
      typeof disqualification.handle !== "string" ||
      disqualification.handle.trim().length === 0
    ) {
      throw new Error(`disqualifications row ${index + 1} handle is invalid.`);
    }

    if (
      disqualification.reason !== undefined &&
      typeof disqualification.reason !== "string"
    ) {
      throw new Error(`disqualifications row ${index + 1} reason is invalid.`);
    }

    const handle = disqualification.handle.trim();
    const normalizedHandle = handle.toLowerCase();

    if (seenHandles.has(normalizedHandle)) {
      continue;
    }

    seenHandles.add(normalizedHandle);
    disqualifications.push({
      handle,
      ...(disqualification.reason?.trim()
        ? { reason: disqualification.reason.trim() }
        : {}),
    });
  }

  return disqualifications;
}

function validateTourResults(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }

  return value.map((row, index) => validateTourResult(row, field, index + 1));
}

function validateTourResult(row: unknown, field: string, rowNumber: number) {
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

function formatTourLabel(tourId: TourId) {
  return tourId === "tour-1" ? "Tour 1" : "Tour 2";
}

function getTourStandingsPath(tourId: TourId) {
  return `${getDataDirectory()}/standings-${tourId}.json`;
}

function getLegacyStandingsPath() {
  return `${getDataDirectory()}/published-standings.json`;
}

function getDataDirectory() {
  return `${process.cwd()}/data`;
}
