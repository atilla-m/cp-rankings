import { Redis } from "@upstash/redis";

const CODEFORCES_CONFIG_REDIS_KEY = "codeforces:config";

type CodeforcesConfigRedisClient = {
  get: (key: string) => Promise<unknown | null>;
  set: (key: string, value: StoredCodeforcesConfig) => Promise<unknown>;
};

let redisClient: CodeforcesConfigRedisClient | null = null;
let redisClientConfigKey: string | null = null;
let redisClientOverride: CodeforcesConfigRedisClient | null = null;

export type CodeforcesConfig = {
  groupCode: string;
  tour1ContestId: number | null;
  tour2ContestId: number | null;
};

export type CodeforcesFetchMode = "api" | "group-html" | "fixture-html";

export type CompleteCodeforcesConfig =
  | {
      groupCode: string;
      tour1ContestId: number;
      tour2ContestId: number;
      fetchMode: "api" | "group-html";
    }
  | {
      groupCode: string;
      tour1ContestId: number | null;
      tour2ContestId: number | null;
      fetchMode: "fixture-html";
    };

export type StoredCodeforcesConfig = CodeforcesConfig & {
  updatedAt: string;
};

export type SaveCodeforcesConfigInput = {
  groupCode?: unknown;
  tour1ContestId?: unknown;
  tour2ContestId?: unknown;
};

export async function readCodeforcesConfig() {
  const storedConfig = await getCodeforcesConfigStore().read();

  if (storedConfig === null) {
    return getCodeforcesEnvDefaults();
  }

  return parseStoredCodeforcesConfig(parseStoredConfig(storedConfig));
}

export async function saveCodeforcesConfig(input: SaveCodeforcesConfigInput) {
  const config = validateCodeforcesConfigInput(input);
  const storedConfig: StoredCodeforcesConfig = {
    ...config,
    updatedAt: new Date().toISOString(),
  };

  await getCodeforcesConfigStore().save(storedConfig);

  return storedConfig;
}

export function validateCodeforcesConfigInput(
  input: SaveCodeforcesConfigInput,
): CodeforcesConfig {
  return {
    groupCode:
      typeof input.groupCode === "string" ? input.groupCode.trim() : "",
    tour1ContestId: parseOptionalContestId(
      input.tour1ContestId,
      "Tour 1 contest ID",
    ),
    tour2ContestId: parseOptionalContestId(
      input.tour2ContestId,
      "Tour 2 contest ID",
    ),
  };
}

export function requireCompleteCodeforcesConfig(
  input: CodeforcesConfig,
): CompleteCodeforcesConfig {
  const fetchMode = readCodeforcesFetchMode();

  if (fetchMode === "fixture-html") {
    return {
      groupCode: input.groupCode,
      tour1ContestId: input.tour1ContestId,
      tour2ContestId: input.tour2ContestId,
      fetchMode,
    };
  }

  const tour1ContestId = requireContestId(
    input.tour1ContestId,
    "Tour 1 contest ID",
  );
  const tour2ContestId = requireContestId(
    input.tour2ContestId,
    "Tour 2 contest ID",
  );

  if (fetchMode === "group-html" && input.groupCode.length === 0) {
    throw new Error(
      "Codeforces group code is required when CF_FETCH_MODE=group-html.",
    );
  }

  return {
    groupCode: input.groupCode,
    tour1ContestId,
    tour2ContestId,
    fetchMode,
  };
}

export function getCodeforcesEnvDefaults(): StoredCodeforcesConfig {
  return {
    groupCode: process.env.CF_GROUP_CODE?.trim() ?? "",
    tour1ContestId: parseEnvContestId("CF_CONTEST_1_ID"),
    tour2ContestId: parseEnvContestId("CF_CONTEST_2_ID"),
    updatedAt: "",
  };
}

export function setCodeforcesConfigRedisClientForTests(
  client: CodeforcesConfigRedisClient | null,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Test Codeforces config Redis overrides are not available in production.",
    );
  }

  redisClientOverride = client;
}

export function resetCodeforcesConfigStoreForTests() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Test Codeforces config store reset is not available in production.",
    );
  }

  redisClient = null;
  redisClientConfigKey = null;
  redisClientOverride = null;
}

function getCodeforcesConfigStore() {
  const redisConfig = getRedisConfig();

  if (redisConfig) {
    return {
      read: () => getRedisClient(redisConfig).get(CODEFORCES_CONFIG_REDIS_KEY),
      save: (config: StoredCodeforcesConfig) =>
        getRedisClient(redisConfig).set(CODEFORCES_CONFIG_REDIS_KEY, config),
    };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Codeforces config storage error: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production.",
    );
  }

  return {
    read: readCodeforcesConfigFromFile,
    save: saveCodeforcesConfigToFile,
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
      "Codeforces config storage error: both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set, or neither.",
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
    }) as CodeforcesConfigRedisClient;
    redisClientConfigKey = configKey;
  }

  return redisClient;
}

async function readCodeforcesConfigFromFile() {
  const { readFile } = await import("node:fs/promises");

  try {
    const configText = await readFile(getCodeforcesConfigPath(), "utf-8");
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

async function saveCodeforcesConfigToFile(config: StoredCodeforcesConfig) {
  const { mkdir, writeFile } = await import("node:fs/promises");

  await mkdir(getDataDirectory(), { recursive: true });
  await writeFile(
    getCodeforcesConfigPath(),
    `${JSON.stringify(config, null, 2)}\n`,
  );
}

function parseStoredCodeforcesConfig(value: unknown): StoredCodeforcesConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Codeforces config is invalid.");
  }

  const config = value as Partial<StoredCodeforcesConfig>;
  const parsedConfig = validateCodeforcesConfigInput(config);

  if (typeof config.updatedAt !== "string") {
    throw new Error("Codeforces config is missing updatedAt.");
  }

  return {
    ...parsedConfig,
    updatedAt: config.updatedAt,
  };
}

function parseStoredConfig(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("Codeforces config is invalid JSON.");
  }
}

function parseOptionalContestId(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  if (!Number.isSafeInteger(numericValue) || numericValue <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return numericValue;
}

function parseEnvContestId(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isSafeInteger(numericValue) || numericValue <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return numericValue;
}

function requireContestId(value: number | null, label: string) {
  if (value === null) {
    throw new Error(`${label} is required and must be a positive integer.`);
  }

  return value;
}

export function readCodeforcesFetchMode(): CodeforcesFetchMode {
  const fetchMode = process.env.CF_FETCH_MODE?.trim().toLowerCase();

  if (fetchMode === "group-html" || fetchMode === "fixture-html") {
    return fetchMode;
  }

  return "api";
}

function getCodeforcesConfigPath() {
  return `${getDataDirectory()}/codeforces-config.json`;
}

function getDataDirectory() {
  return `${process.cwd()}/data`;
}
