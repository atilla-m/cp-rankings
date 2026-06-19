import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { POST } from "@/app/api/admin/standings/route";
import { GET } from "@/app/api/standings/route";
import {
  getPublishedTourStandingsResponse,
  readPublishedTourStandings,
  resetStandingsStoreForTests,
  savePublishedTourStandings,
  setStandingsRedisClientForTests,
} from "./standings-store";

test("returns an empty state when no tour standings exist", async () => {
  await withMockRedisStore(async () => {
    assert.deepEqual(await getPublishedTourStandingsResponse("tour-1"), {
      status: "empty",
      message: "Tour 1 standings have not been published yet.",
      snapshot: null,
    });
  });
});

test("saves Tour 1 and Tour 2 standings to separate Redis keys", async () => {
  await withMockRedisStore(async (redis) => {
    const tour1 = await savePublishedTourStandings({
      tourId: "tour-1",
      source: "manual",
      rows: [{ handle: " tourist ", score: 500, penalty: 120, official: true }],
      qualificationCutoff: 30,
    });
    const tour2 = await savePublishedTourStandings({
      tourId: "tour-2",
      source: "codeforces",
      rows: [{ handle: "Benq", score: 400, penalty: 90, official: true }],
      qualificationCutoff: 10,
    });

    assert.equal(tour1.tourId, "tour-1");
    assert.equal(tour1.rows[0].handle, "tourist");
    assert.equal(tour1.qualificationCutoff, 30);
    assert.equal(tour2.tourId, "tour-2");
    assert.equal(tour2.qualificationCutoff, 10);

    assert.equal(redis.peek("standings:tour-1")?.tourId, "tour-1");
    assert.equal(redis.peek("standings:tour-2")?.tourId, "tour-2");
    assert.equal(redis.peek("published-standings"), null);
  });
});

test("loads published tour standings from Redis", async () => {
  await withMockRedisStore(async (redis) => {
    redis.seed("standings:tour-1", {
      tourId: "tour-1",
      source: "codeforces",
      updatedAt: "2026-06-10T00:00:00.000Z",
      rows: [{ handle: "tourist", score: 500, penalty: 120, official: true }],
      rankedRows: [],
      qualificationCutoff: 30,
      disqualifications: [],
    });

    const loaded = await readPublishedTourStandings("tour-1");

    assert.equal(loaded?.source, "codeforces");
    assert.equal(loaded?.qualificationCutoff, 30);
    assert.equal(loaded?.rankedRows[0].score, 500);
  });
});

test("existing tour key wins over legacy standings data", async () => {
  await withMockRedisStore(async (redis) => {
    redis.seed("standings:tour-1", {
      tourId: "tour-1",
      source: "manual",
      updatedAt: "2026-06-11T00:00:00.000Z",
      rows: [{ handle: "new-tourist", score: 900, penalty: 1, official: true }],
      rankedRows: [],
      qualificationCutoff: 5,
      disqualifications: [],
    });
    redis.seed("published-standings", {
      source: "codeforces",
      updatedAt: "2026-06-10T00:00:00.000Z",
      tour1: [{ handle: "legacy-tourist", score: 500, penalty: 120, official: true }],
      tour2: [{ handle: "legacy-tour2", score: 400, penalty: 90, official: true }],
      qualificationCutoff: 20,
    });

    const loaded = await readPublishedTourStandings("tour-1");

    assert.equal(loaded?.rows[0].handle, "new-tourist");
    assert.equal(loaded?.qualificationCutoff, 5);
    assert.equal(loaded?.source, "manual");
  });
});

test("missing Tour 1 key falls back to legacy tour1 and lazily migrates", async () => {
  await withMockRedisStore(async (redis) => {
    redis.seed("published-standings", {
      source: "codeforces",
      updatedAt: "2026-06-10T00:00:00.000Z",
      tour1: [{ handle: "legacy-tourist", score: 500, penalty: 120, official: true }],
      tour2: [{ handle: "legacy-tour2", score: 400, penalty: 90, official: true }],
      qualificationCutoff: 12,
    });

    const loaded = await readPublishedTourStandings("tour-1");

    assert.equal(loaded?.tourId, "tour-1");
    assert.equal(loaded?.rows[0].handle, "legacy-tourist");
    assert.equal(loaded?.rankedRows[0].status, "Qualified");
    assert.equal(loaded?.qualificationCutoff, 12);
    assert.equal(redis.peek("standings:tour-1")?.rows[0].handle, "legacy-tourist");
    assert.notEqual(redis.peek("published-standings"), null);
  });
});

test("missing Tour 2 key falls back to legacy tour2 and lazily migrates", async () => {
  await withMockRedisStore(async (redis) => {
    redis.seed("published-standings", {
      source: "manual",
      updatedAt: "2026-06-10T00:00:00.000Z",
      tour1: [{ handle: "legacy-tour1", score: 500, penalty: 120, official: true }],
      tour2: [{ handle: "legacy-tour2", score: 400, penalty: 90, official: true }],
      qualificationCutoff: 8,
    });

    const loaded = await readPublishedTourStandings("tour-2");

    assert.equal(loaded?.tourId, "tour-2");
    assert.equal(loaded?.rows[0].handle, "legacy-tour2");
    assert.equal(loaded?.qualificationCutoff, 8);
    assert.equal(redis.peek("standings:tour-2")?.rows[0].handle, "legacy-tour2");
  });
});

test("legacy snapshot without qualificationCutoff defaults to top 20", async () => {
  await withMockRedisStore(async (redis) => {
    redis.seed("published-standings", {
      source: "manual",
      updatedAt: "2026-06-10T00:00:00.000Z",
      tour1: makeRankedTourResults(21),
      tour2: [],
    });

    const loaded = await readPublishedTourStandings("tour-1");

    assert.equal(loaded?.qualificationCutoff, 20);
    assert.equal(
      loaded?.rankedRows.filter((participant) => participant.qualified).length,
      20,
    );
  });
});

test("legacy fallback preserves source and updatedAt when available", async () => {
  await withMockRedisStore(async (redis) => {
    redis.seed("published-standings", {
      source: "codeforces",
      updatedAt: "2026-06-10T00:00:00.000Z",
      tour1: [{ handle: "legacy-tourist", score: 500, penalty: 120, official: true }],
      tour2: [],
    });

    const loaded = await readPublishedTourStandings("tour-1");

    assert.equal(loaded?.source, "codeforces");
    assert.equal(loaded?.updatedAt, "2026-06-10T00:00:00.000Z");
  });
});

test("legacy fallback uses legacy source when source is missing", async () => {
  await withMockRedisStore(async (redis) => {
    redis.seed("published-standings", {
      updatedAt: "2026-06-10T00:00:00.000Z",
      tour1: [{ handle: "legacy-tourist", score: 500, penalty: 120, official: true }],
      tour2: [],
    });

    const loaded = await readPublishedTourStandings("tour-1");

    assert.equal(loaded?.source, "legacy");
  });
});

test("snapshots without qualificationCutoff fall back to top 20", async () => {
  await withMockRedisStore(async (redis) => {
    redis.seed("standings:tour-1", {
      tourId: "tour-1",
      source: "manual",
      updatedAt: "2026-06-10T00:00:00.000Z",
      rows: makeRankedTourResults(21),
      rankedRows: [],
      disqualifications: [],
    });

    const loaded = await readPublishedTourStandings("tour-1");

    assert.equal(loaded?.qualificationCutoff, 20);
    assert.equal(
      loaded?.rankedRows.filter((participant) => participant.qualified).length,
      20,
    );
    assert.equal(loaded?.rankedRows[20].status, "Not qualified");
  });
});

test("snapshots without disqualifications default to none", async () => {
  await withMockRedisStore(async (redis) => {
    redis.seed("standings:tour-1", {
      tourId: "tour-1",
      source: "manual",
      updatedAt: "2026-06-10T00:00:00.000Z",
      rows: makeRankedTourResults(1),
      rankedRows: [],
      qualificationCutoff: 20,
    });

    const loaded = await readPublishedTourStandings("tour-1");

    assert.deepEqual(loaded?.disqualifications, []);
    assert.equal(loaded?.rankedRows[0].status, "Qualified");
  });
});

test("custom cutoff is applied", async () => {
  await withMockRedisStore(async () => {
    const snapshot = await savePublishedTourStandings({
      tourId: "tour-1",
      source: "manual",
      rows: makeRankedTourResults(3),
      qualificationCutoff: 2,
    });

    assert.equal(snapshot.qualificationCutoff, 2);
    assert.deepEqual(
      snapshot.rankedRows.map((participant) => participant.status),
      ["Qualified", "Qualified", "Not qualified"],
    );
  });
});

test("disqualified contestant does not qualify but remains visible", async () => {
  await withMockRedisStore(async () => {
    const snapshot = await savePublishedTourStandings({
      tourId: "tour-1",
      source: "manual",
      rows: makeRankedTourResults(3),
      qualificationCutoff: 3,
      disqualifications: [{ handle: "participant2", reason: "No show" }],
    });

    assert.deepEqual(
      snapshot.rankedRows.map((participant) => participant.handle),
      ["participant1", "participant2", "participant3"],
    );
    assert.equal(snapshot.rankedRows[1].qualified, false);
    assert.equal(snapshot.rankedRows[1].status, "Disqualified");
    assert.equal(snapshot.rankedRows[1].disqualificationReason, "No show");
    assert.deepEqual(snapshot.disqualifications, [
      { handle: "participant2", reason: "No show" },
    ]);
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
        () => getPublishedTourStandingsResponse("tour-1"),
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
      await withPublishedStandingsFiles(async () => {
        const saved = await savePublishedTourStandings({
          tourId: "tour-1",
          source: "manual",
          rows: [
            { handle: "tourist", score: 500, penalty: 120, official: true },
          ],
        });
        const loaded = await readPublishedTourStandings("tour-1");

        assert.deepEqual(loaded, saved);
        assert.equal(loaded?.rankedRows[0].score, 500);
      });
    },
  );
});

test("development local fallback migrates legacy published standings file", async () => {
  resetStandingsStoreForTests();

  await withEnv(
    {
      NODE_ENV: "development",
      UPSTASH_REDIS_REST_TOKEN: undefined,
      UPSTASH_REDIS_REST_URL: undefined,
    },
    async () => {
      await withPublishedStandingsFiles(async () => {
        const legacyPath = path.join("data", "published-standings.json");
        const migratedPath = path.join("data", "standings-tour-1.json");

        await mkdir(path.dirname(legacyPath), { recursive: true });
        await writeFile(
          legacyPath,
          `${JSON.stringify({
            source: "manual",
            updatedAt: "2026-06-10T00:00:00.000Z",
            tour1: [
              {
                handle: "legacy-tourist",
                score: 500,
                penalty: 120,
                official: true,
              },
            ],
            tour2: [],
          })}\n`,
        );

        const response = await getPublishedTourStandingsResponse("tour-1");
        const migratedSnapshot = JSON.parse(
          await readFile(migratedPath, "utf-8"),
        ) as { rows: Array<{ handle: string }> };

        assert.equal(response.status, "published");
        assert.equal(response.snapshot.rows[0].handle, "legacy-tourist");
        assert.equal(migratedSnapshot.rows[0].handle, "legacy-tourist");
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
        () => getPublishedTourStandingsResponse("tour-1"),
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
      await withPublishedStandingsFiles(async () => {
        assert.deepEqual(await getPublishedTourStandingsResponse("tour-1"), {
          status: "empty",
          message: "Tour 1 standings have not been published yet.",
          snapshot: null,
        });
      });
    },
  );
});

test("Redis is used when Upstash env vars are configured", async () => {
  await withMockRedisStore(async (redis) => {
    await savePublishedTourStandings({
      tourId: "tour-1",
      source: "manual",
      rows: [{ handle: "tourist", score: 500, penalty: 120, official: true }],
    });

    assert.notEqual(redis.peek("standings:tour-1"), null);
  });
});

test("admin password is required to save published standings", async () => {
  await withPublishedStandingsFiles(async () => {
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
            tourId: "tour-1",
            source: "manual",
            rows: [],
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

type StoredSnapshot = Awaited<ReturnType<typeof savePublishedTourStandings>>;

class MockRedisClient {
  private readonly values = new Map<string, unknown>();

  async get(key: string) {
    return this.values.has(key) ? clone(this.values.get(key)) : null;
  }

  async set(key: string, value: StoredSnapshot) {
    this.values.set(key, clone(value));
    return "OK";
  }

  seed(key: string, value: unknown) {
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

async function withPublishedStandingsFiles(callback: () => Promise<void>) {
  const snapshotPaths = [
    path.join("data", "standings-tour-1.json"),
    path.join("data", "standings-tour-2.json"),
    path.join("data", "published-standings.json"),
  ];
  const previousSnapshots = new Map<string, Buffer | null>();

  for (const snapshotPath of snapshotPaths) {
    previousSnapshots.set(snapshotPath, await readExistingSnapshot(snapshotPath));
    await rm(snapshotPath, { force: true });
  }

  try {
    await callback();
  } finally {
    for (const snapshotPath of snapshotPaths) {
      const previousSnapshot = previousSnapshots.get(snapshotPath) ?? null;

      if (previousSnapshot === null) {
        await rm(snapshotPath, { force: true });
      } else {
        await mkdir(path.dirname(snapshotPath), { recursive: true });
        await writeFile(snapshotPath, previousSnapshot);
      }
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

function makeRankedTourResults(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    handle: `participant${index + 1}`,
    score: count - index,
    penalty: index,
    official: true,
  }));
}
