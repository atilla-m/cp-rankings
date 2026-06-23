import { Redis } from "@upstash/redis";
import {
  buildFinalLeaderboard,
  demoFinalAcceptedSubmissions,
  demoFinalParticipants,
  getDefaultFinalLeaderboardConfig,
  parseFinalAcceptedSubmissionsInput,
  parseFinalParticipantsInput,
  validateFinalLeaderboardConfigInput,
  type FinalLeaderboardConfig,
  type FinalLeaderboardRow,
} from "@/app/lib/final-leaderboard";

const FINAL_CONFIG_REDIS_KEY = "final:config";
const FINAL_LEADERBOARD_REDIS_KEY = "final:leaderboard";

type FinalRedisClient = {
  get: (key: string) => Promise<unknown | null>;
  set: (
    key: string,
    value: StoredFinalLeaderboardConfig | FinalLeaderboardSnapshot,
  ) => Promise<unknown>;
};

let redisClient: FinalRedisClient | null = null;
let redisClientConfigKey: string | null = null;
let redisClientOverride: FinalRedisClient | null = null;

export type StoredFinalLeaderboardConfig = FinalLeaderboardConfig & {
  updatedAt: string;
};

export type FinalLeaderboardSnapshot = {
  config: FinalLeaderboardConfig;
  rows: FinalLeaderboardRow[];
  source: "mock" | "manual" | "live";
  updatedAt: string;
};

export type FinalLeaderboardApiResponse =
  | {
      status: "empty";
      message: string;
      snapshot: null;
    }
  | {
      status: "published";
      snapshot: FinalLeaderboardSnapshot;
    };

export async function readFinalLeaderboardConfig() {
  const storedConfig = await getFinalLeaderboardStore().readConfig();

  if (storedConfig === null) {
    return {
      ...getDefaultFinalLeaderboardConfig(),
      updatedAt: "",
    };
  }

  return parseStoredFinalLeaderboardConfig(parseStoredValue(storedConfig));
}

export async function saveFinalLeaderboardConfig(input: unknown) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Final config payload is invalid.");
  }

  const config = validateFinalLeaderboardConfigInput(input);
  const storedConfig: StoredFinalLeaderboardConfig = {
    ...config,
    updatedAt: new Date().toISOString(),
  };
  const store = getFinalLeaderboardStore();

  await store.saveConfig(storedConfig);

  return {
    config: storedConfig,
  };
}

export async function publishManualFinalLeaderboardSnapshot(input: unknown) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Final leaderboard publish payload is invalid.");
  }

  const payload = input as {
    config?: unknown;
    participantsInput?: unknown;
    acceptedSubmissionsInput?: unknown;
  };
  const config = validateFinalLeaderboardConfigInput(payload.config ?? {});

  if (typeof payload.participantsInput !== "string") {
    throw new Error("Final participants input is required.");
  }

  if (typeof payload.acceptedSubmissionsInput !== "string") {
    throw new Error("Final accepted submissions input is required.");
  }

  const participants = parseFinalParticipantsInput(payload.participantsInput);
  const acceptedSubmissions = parseFinalAcceptedSubmissionsInput(
    payload.acceptedSubmissionsInput,
    config,
  );
  const snapshot: FinalLeaderboardSnapshot = {
    config,
    rows: buildFinalLeaderboard(config, participants, acceptedSubmissions),
    source: "manual",
    updatedAt: new Date().toISOString(),
  };

  await getFinalLeaderboardStore().saveLeaderboard(snapshot);

  return snapshot;
}

export async function readFinalLeaderboardSnapshot() {
  const snapshot = await getFinalLeaderboardStore().readLeaderboard();

  if (snapshot === null) {
    return null;
  }

  return parseFinalLeaderboardSnapshot(parseStoredValue(snapshot));
}

export async function getFinalLeaderboardResponse(): Promise<FinalLeaderboardApiResponse> {
  const snapshot = await readFinalLeaderboardSnapshot();

  if (!snapshot || snapshot.source === "mock") {
    return {
      status: "empty",
      message: "Final leaderboard has not started yet.",
      snapshot: null,
    };
  }

  return {
    status: "published",
    snapshot,
  };
}

export function buildDemoFinalLeaderboardSnapshot() {
  return buildMockFinalLeaderboardSnapshot({
    ...getDefaultFinalLeaderboardConfig(),
    updatedAt: "",
  });
}

export function setFinalLeaderboardRedisClientForTests(
  client: FinalRedisClient | null,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Test final leaderboard Redis overrides are not available in production.",
    );
  }

  redisClientOverride = client;
}

export function resetFinalLeaderboardStoreForTests() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Test final leaderboard store reset is not available in production.",
    );
  }

  redisClient = null;
  redisClientConfigKey = null;
  redisClientOverride = null;
}

function buildMockFinalLeaderboardSnapshot(
  config: StoredFinalLeaderboardConfig,
): FinalLeaderboardSnapshot {
  return {
    config: {
      contestStartTime: config.contestStartTime,
      problems: config.problems,
    },
    rows: buildFinalLeaderboard(
      config,
      demoFinalParticipants,
      demoFinalAcceptedSubmissions,
    ),
    source: "mock",
    updatedAt: new Date().toISOString(),
  };
}

function getFinalLeaderboardStore() {
  const redisConfig = getRedisConfig();

  if (redisConfig) {
    const client = getRedisClient(redisConfig);

    return {
      readConfig: () => client.get(FINAL_CONFIG_REDIS_KEY),
      saveConfig: (config: StoredFinalLeaderboardConfig) =>
        client.set(FINAL_CONFIG_REDIS_KEY, config),
      readLeaderboard: () => client.get(FINAL_LEADERBOARD_REDIS_KEY),
      saveLeaderboard: (snapshot: FinalLeaderboardSnapshot) =>
        client.set(FINAL_LEADERBOARD_REDIS_KEY, snapshot),
    };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Final leaderboard storage error: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production.",
    );
  }

  return {
    readConfig: readFinalLeaderboardConfigFromFile,
    saveConfig: saveFinalLeaderboardConfigToFile,
    readLeaderboard: readFinalLeaderboardSnapshotFromFile,
    saveLeaderboard: saveFinalLeaderboardSnapshotToFile,
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
      "Final leaderboard storage error: both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set, or neither.",
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
    }) as FinalRedisClient;
    redisClientConfigKey = configKey;
  }

  return redisClient;
}

async function readFinalLeaderboardConfigFromFile() {
  const { readFile } = await import("node:fs/promises");

  try {
    const configText = await readFile(getFinalConfigPath(), "utf-8");
    return JSON.parse(configText) as unknown;
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

async function saveFinalLeaderboardConfigToFile(
  config: StoredFinalLeaderboardConfig,
) {
  const { mkdir, writeFile } = await import("node:fs/promises");

  await mkdir(getDataDirectory(), { recursive: true });
  await writeFile(getFinalConfigPath(), `${JSON.stringify(config, null, 2)}\n`);
}

async function readFinalLeaderboardSnapshotFromFile() {
  const { readFile } = await import("node:fs/promises");

  try {
    const snapshotText = await readFile(getFinalLeaderboardPath(), "utf-8");
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

async function saveFinalLeaderboardSnapshotToFile(
  snapshot: FinalLeaderboardSnapshot,
) {
  const { mkdir, writeFile } = await import("node:fs/promises");

  await mkdir(getDataDirectory(), { recursive: true });
  await writeFile(
    getFinalLeaderboardPath(),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );
}

function parseStoredFinalLeaderboardConfig(
  value: unknown,
): StoredFinalLeaderboardConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Final config is invalid.");
  }

  const config = value as Partial<StoredFinalLeaderboardConfig>;
  const parsedConfig = validateFinalLeaderboardConfigInput(config);

  if (typeof config.updatedAt !== "string") {
    throw new Error("Final config is missing updatedAt.");
  }

  return {
    ...parsedConfig,
    updatedAt: config.updatedAt,
  };
}

function parseFinalLeaderboardSnapshot(value: unknown): FinalLeaderboardSnapshot {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Final leaderboard snapshot is invalid.");
  }

  const snapshot = value as Partial<FinalLeaderboardSnapshot>;
  const config = validateFinalLeaderboardConfigInput(snapshot.config ?? {});

  if (!Array.isArray(snapshot.rows)) {
    throw new Error("Final leaderboard snapshot rows must be an array.");
  }

  if (
    snapshot.source !== "mock" &&
    snapshot.source !== "manual" &&
    snapshot.source !== "live"
  ) {
    throw new Error("Final leaderboard snapshot source is invalid.");
  }

  if (typeof snapshot.updatedAt !== "string") {
    throw new Error("Final leaderboard snapshot is missing updatedAt.");
  }

  return {
    config,
    rows: snapshot.rows.map(validateFinalLeaderboardRow),
    source: snapshot.source,
    updatedAt: snapshot.updatedAt,
  };
}

function validateFinalLeaderboardRow(row: unknown): FinalLeaderboardRow {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("Final leaderboard row must be an object.");
  }

  const leaderboardRow = row as Partial<FinalLeaderboardRow>;

  if (
    typeof leaderboardRow.rank !== "number" ||
    !Number.isSafeInteger(leaderboardRow.rank) ||
    leaderboardRow.rank < 1
  ) {
    throw new Error("Final leaderboard row rank is invalid.");
  }

  if (
    typeof leaderboardRow.handle !== "string" ||
    leaderboardRow.handle.trim().length === 0
  ) {
    throw new Error("Final leaderboard row handle is invalid.");
  }

  if (!isValidScore(leaderboardRow.totalScore)) {
    throw new Error("Final leaderboard row totalScore is invalid.");
  }

  if (!isValidScore(leaderboardRow.totalPenalty)) {
    throw new Error("Final leaderboard row totalPenalty is invalid.");
  }

  if (
    leaderboardRow.problemResults === null ||
    typeof leaderboardRow.problemResults !== "object" ||
    Array.isArray(leaderboardRow.problemResults)
  ) {
    throw new Error("Final leaderboard row problemResults is invalid.");
  }

  return {
    rank: leaderboardRow.rank,
    handle: leaderboardRow.handle.trim(),
    totalScore: leaderboardRow.totalScore,
    totalPenalty: leaderboardRow.totalPenalty,
    problemResults:
      leaderboardRow.problemResults as FinalLeaderboardRow["problemResults"],
  };
}

function isValidScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseStoredValue(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("Final leaderboard storage value is invalid JSON.");
  }
}

function getFinalConfigPath() {
  return `${getDataDirectory()}/final-config.json`;
}

function getFinalLeaderboardPath() {
  return `${getDataDirectory()}/final-leaderboard.json`;
}

function getDataDirectory() {
  return `${process.cwd()}/data`;
}
