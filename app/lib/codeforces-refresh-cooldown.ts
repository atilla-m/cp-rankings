import { Redis } from "@upstash/redis";

const CODEFORCES_REFRESH_COOLDOWN_SECONDS = 60;
const CODEFORCES_REFRESH_COOLDOWN_MS =
  CODEFORCES_REFRESH_COOLDOWN_SECONDS * 1000;
const CODEFORCES_REFRESH_COOLDOWN_KEY = "codeforces-refresh-cooldown";

type CooldownRedisClient = {
  set: (
    key: string,
    value: string,
    options: { ex: number; nx: true },
  ) => Promise<unknown>;
  ttl: (key: string) => Promise<number>;
};

let redisClient: CooldownRedisClient | null = null;
let redisClientConfigKey: string | null = null;
let redisClientOverride: CooldownRedisClient | null = null;
let localCooldownExpiresAt = 0;

export async function acquireCodeforcesRefreshCooldown(now = Date.now()) {
  const store = getCodeforcesRefreshCooldownStore();
  const result = await store.acquire(now);

  if (result.allowed) {
    return;
  }

  throw new Error(
    `Codeforces refresh is on cooldown. Try again in ${result.remainingSeconds} seconds.`,
  );
}

export function setCodeforcesCooldownRedisClientForTests(
  client: CooldownRedisClient | null,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Test Redis overrides are not available in production.");
  }

  redisClientOverride = client;
}

export function resetCodeforcesRefreshCooldownForTest() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Test Codeforces cooldown reset is not available in production.",
    );
  }

  redisClient = null;
  redisClientConfigKey = null;
  redisClientOverride = null;
  localCooldownExpiresAt = 0;
}

function getCodeforcesRefreshCooldownStore() {
  const redisConfig = getRedisConfig();

  if (redisConfig) {
    return {
      acquire: (now: number) => acquireRedisCooldown(redisConfig, now),
    };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Codeforces cooldown configuration error: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production.",
    );
  }

  return {
    acquire: acquireLocalCooldown,
  };
}

async function acquireRedisCooldown(
  config: { url: string; token: string },
  now: number,
) {
  const redis = getRedisClient(config);
  const setResult = await redis.set(
    CODEFORCES_REFRESH_COOLDOWN_KEY,
    String(now),
    {
      ex: CODEFORCES_REFRESH_COOLDOWN_SECONDS,
      nx: true,
    },
  );

  if (setResult) {
    return { allowed: true as const };
  }

  const ttl = await redis.ttl(CODEFORCES_REFRESH_COOLDOWN_KEY);

  return {
    allowed: false as const,
    remainingSeconds: ttl > 0 ? ttl : CODEFORCES_REFRESH_COOLDOWN_SECONDS,
  };
}

async function acquireLocalCooldown(now: number) {
  if (now < localCooldownExpiresAt) {
    return {
      allowed: false as const,
      remainingSeconds: Math.ceil((localCooldownExpiresAt - now) / 1000),
    };
  }

  localCooldownExpiresAt = now + CODEFORCES_REFRESH_COOLDOWN_MS;

  return { allowed: true as const };
}

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim() ?? "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";

  if (url && token) {
    return { url, token };
  }

  if (url || token) {
    throw new Error(
      "Codeforces cooldown configuration error: both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set, or neither.",
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
    }) as CooldownRedisClient;
    redisClientConfigKey = configKey;
  }

  return redisClient;
}
