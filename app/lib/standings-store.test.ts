import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { POST } from "@/app/api/admin/standings/route";
import { GET } from "@/app/api/standings/route";
import {
  getPublishedStandingsResponse,
  readPublishedStandings,
  resetStandingsStoreForTests,
  savePublishedStandings,
  setStandingsRedisClientForTests,
} from "./standings-store";

test("returns an empty state when no published standings exist", async () => {
  await withMockRedisStore(async () => {
    assert.deepEqual(await getPublishedStandingsResponse(), {
      status: "empty",
      message: "Standings have not been published yet.",
      snapshot: null,
    });
  });
});

test("saves published standings to Redis with combined rankings", async () => {
  await withMockRedisStore(async (redis) => {
    const snapshot = await savePublishedStandings({
      source: "manual",
      tour1: [{ handle: " tourist ", score: 500, penalty: 120, official: true }],
      tour2: [{ handle: "Benq", score: 400, penalty: 90, official: true }],
    });

    assert.equal(snapshot.source, "manual");
    assert.equal(typeof snapshot.updatedAt, "string");
    assert.equal(snapshot.tour1[0].handle, "tourist");
    assert.deepEqual(
      snapshot.combinedRankings.map((participant) => participant.handle),
      ["tourist", "Benq"],
    );

    const storedSnapshot = redis.peek("published-standings");

    assert.equal(storedSnapshot?.source, "manual");
    assert.deepEqual(
      storedSnapshot?.combinedRankings.map((participant) => participant.handle),
      ["tourist", "Benq"],
    );
  });
});

test("loads published standings from Redis", async () => {
  await withMockRedisStore(async (redis) => {
    redis.seed("published-standings", {
      source: "codeforces",
      updatedAt: "2026-06-10T00:00:00.000Z",
      tour1: [{ handle: "tourist", score: 500, penalty: 120, official: true }],
      tour2: [{ handle: "tourist", score: 300, penalty: 90, official: true }],
      combinedRankings: [],
    });

    const loaded = await readPublishedStandings();

    assert.equal(loaded?.source, "codeforces");
    assert.equal(loaded?.combinedRankings[0].totalScore, 800);
  });
});

test("production without Redis env returns a clear config error", async () => {
  resetStandingsStoreForTests();

  await withEnv(
    {
      NODE_ENV: "production",
      UPSTASH_REDIS_REST_TOKEN: undefined,
      UPSTASH_REDIS_REST_URL: undefined,
    },
    async () => {
      await assert.rejects(
        getPublishedStandingsResponse,
        /UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production/,
      );

      const response = await GET();
      const body = (await response.json()) as { error: string };

      assert.equal(response.status, 500);
      assert.match(
        body.error,
        /UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production/,
      );
    },
  );
});

test("development without Redis env can use local fallback storage", async () => {
  resetStandingsStoreForTests();

  await withEnv(
    {
      NODE_ENV: "development",
      UPSTASH_REDIS_REST_TOKEN: undefined,
      UPSTASH_REDIS_REST_URL: undefined,
    },
    async () => {
      await withPublishedStandingsFile(async () => {
        const saved = await savePublishedStandings({
          source: "manual",
          tour1: [
            { handle: "tourist", score: 500, penalty: 120, official: true },
          ],
          tour2: [
            { handle: "tourist", score: 300, penalty: 90, official: true },
          ],
        });
        const loaded = await readPublishedStandings();

        assert.deepEqual(loaded, saved);
        assert.equal(loaded?.combinedRankings[0].totalScore, 800);
      });
    },
  );
});

test("partial Redis env returns a clear config error", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      UPSTASH_REDIS_REST_TOKEN: undefined,
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    },
    async () => {
      await assert.rejects(
        getPublishedStandingsResponse,
        /both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set/,
      );
    },
  );
});

test("uses anonymous local fallback only outside production", async () => {
  await withEnv(
    {
      NODE_ENV: "test",
      UPSTASH_REDIS_REST_TOKEN: undefined,
      UPSTASH_REDIS_REST_URL: undefined,
    },
    async () => {
      await withPublishedStandingsFile(async () => {
        assert.deepEqual(await getPublishedStandingsResponse(), {
          status: "empty",
          message: "Standings have not been published yet.",
          snapshot: null,
        });
      });
    },
  );
});

test("Redis is used when Upstash env vars are configured", async () => {
  await withMockRedisStore(async (redis) => {
    await savePublishedStandings({
      source: "manual",
      tour1: [{ handle: "tourist", score: 500, penalty: 120, official: true }],
      tour2: [],
    });

    assert.notEqual(redis.peek("published-standings"), null);
  });
});

test("admin password is required to save published standings", async () => {
  await withPublishedStandingsFile(async () => {
    const previousPassword = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD = "secret";

    try {
      const response = await POST(
        new Request("http://localhost/api/admin/standings", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            source: "manual",
            tour1: [],
            tour2: [],
          }),
        }),
      );
      const body = (await response.json()) as { error: string };

      assert.equal(response.status, 400);
      assert.equal(body.error, "Invalid admin password.");
    } finally {
      if (previousPassword === undefined) {
        delete process.env.ADMIN_PASSWORD;
      } else {
        process.env.ADMIN_PASSWORD = previousPassword;
      }
    }
  });
});

type EnvOverrides = Record<string, string | undefined>;

type StoredSnapshot = Awaited<ReturnType<typeof savePublishedStandings>>;

class MockRedisClient {
  private readonly values = new Map<string, unknown>();

  async get(key: string) {
    return this.values.has(key) ? clone(this.values.get(key)) : null;
  }

  async set(key: string, value: StoredSnapshot) {
    this.values.set(key, clone(value));
    return "OK";
  }

  seed(key: string, value: StoredSnapshot) {
    this.values.set(key, clone(value));
  }

  peek(key: string) {
    return this.values.has(key)
      ? (clone(this.values.get(key)) as StoredSnapshot)
      : null;
  }
}

async function withMockRedisStore(
  callback: (redis: MockRedisClient) => Promise<void>,
) {
  const redis = new MockRedisClient();

  await withEnv(
    {
      NODE_ENV: "test",
      UPSTASH_REDIS_REST_TOKEN: "test-token",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    },
    async () => {
      resetStandingsStoreForTests();
      setStandingsRedisClientForTests(redis);

      try {
        await callback(redis);
      } finally {
        resetStandingsStoreForTests();
      }
    },
  );
}

async function withEnv(overrides: EnvOverrides, callback: () => Promise<void>) {
  const previousValues = new Map<string, string | undefined>();

  for (const key of Object.keys(overrides)) {
    previousValues.set(key, process.env[key]);

    const value = overrides[key];

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await callback();
  } finally {
    for (const [key, value] of previousValues) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    resetStandingsStoreForTests();
  }
}

async function withPublishedStandingsFile(callback: () => Promise<void>) {
  const snapshotPath = path.join("data", "published-standings.json");
  const previousSnapshot = await readExistingSnapshot(snapshotPath);

  await rm(snapshotPath, { force: true });

  try {
    await callback();
  } finally {
    if (previousSnapshot === null) {
      await rm(snapshotPath, { force: true });
    } else {
      await mkdir(path.dirname(snapshotPath), { recursive: true });
      await writeFile(snapshotPath, previousSnapshot);
    }
  }
}

async function readExistingSnapshot(snapshotPath: string) {
  try {
    return await readFile(snapshotPath);
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

function clone<T>(value: T) {
  return JSON.parse(JSON.stringify(value)) as T;
}
