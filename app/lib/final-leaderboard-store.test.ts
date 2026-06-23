import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import FinalPage from "../final/page";
import {
  getFinalLeaderboardResponse,
  publishManualFinalLeaderboardSnapshot,
  resetFinalLeaderboardStoreForTests,
  saveFinalLeaderboardConfig,
  setFinalLeaderboardRedisClientForTests,
  type FinalLeaderboardSnapshot,
  type StoredFinalLeaderboardConfig,
} from "./final-leaderboard-store";

test("returns empty response when final leaderboard has not started", async () => {
  await withMockRedisStore(async () => {
    assert.deepEqual(await getFinalLeaderboardResponse(), {
      status: "empty",
      message: "Final leaderboard has not started yet.",
      snapshot: null,
    });
  });
});

test("saves final config without publishing final leaderboard", async () => {
  await withMockRedisStore(async (redis) => {
    const result = await saveFinalLeaderboardConfig({
      contestStartTime: "2026-06-21T10:00:00.000Z",
      problems: [
        {
          id: "A",
          name: "Problem A",
          initialScore: 500,
          decreaseType: "fixed",
          decreaseValue: 50,
          minScore: 100,
        },
      ],
    });

    assert.equal(result.config.problems[0].id, "A");
    assert.equal(
      (redis.peek("final:config") as StoredFinalLeaderboardConfig | null)
        ?.problems[0].id,
      "A",
    );
    assert.equal(redis.peek("final:leaderboard"), null);
    assert.equal((await getFinalLeaderboardResponse()).status, "empty");
  });
});

test("publishes manual final leaderboard snapshot to Redis key", async () => {
  await withMockRedisStore(async (redis) => {
    const snapshot = await publishManualFinalLeaderboardSnapshot({
      config: {
        contestStartTime: "2026-06-21T10:00:00.000Z",
        problems: [
          {
            id: "A",
            name: "Problem A",
            initialScore: 500,
            decreaseType: "fixed",
            decreaseValue: 50,
            minScore: 100,
          },
        ],
      },
      participantsInput: `handle
tooourist
Ekber_Ekber`,
      acceptedSubmissionsInput: `handle,problemId,acceptedAt
tooourist,A,2026-06-21T10:10:00Z
Ekber_Ekber,A,2026-06-21T10:15:00Z`,
    });

    assert.equal(snapshot.source, "manual");
    assert.deepEqual(
      snapshot.rows.map((row) => row.handle),
      ["tooourist", "Ekber_Ekber"],
    );
    assert.equal(
      (redis.peek("final:leaderboard") as FinalLeaderboardSnapshot | null)
        ?.source,
      "manual",
    );
  });
});

test("published final leaderboard can be read from final page", async () => {
  await withMockRedisStore(async () => {
    await publishManualFinalLeaderboardSnapshot({
      config: {
        contestStartTime: "2026-06-21T10:00:00.000Z",
        problems: [
          {
            id: "A",
            name: "Problem A",
            initialScore: 500,
            decreaseType: "fixed",
            decreaseValue: 50,
            minScore: 100,
          },
        ],
      },
      participantsInput: `handle
tooourist`,
      acceptedSubmissionsInput: `handle,problemId,acceptedAt
tooourist,A,2026-06-21T10:10:00Z`,
    });

    const markup = renderToStaticMarkup(await FinalPage());

    assert.match(markup, /tooourist/);
    assert.match(markup, /Manual/);
    assert.doesNotMatch(markup, /Final leaderboard has not started yet/);
  });
});

type EnvOverrides = Record<string, string | undefined>;

type StoredValue = StoredFinalLeaderboardConfig | FinalLeaderboardSnapshot;

class MockRedisClient {
  private readonly values = new Map<string, unknown>();

  async get(key: string) {
    return this.values.has(key) ? clone(this.values.get(key)) : null;
  }

  async set(key: string, value: StoredValue) {
    this.values.set(key, clone(value));
    return "OK";
  }

  peek(key: string) {
    return this.values.has(key)
      ? (clone(this.values.get(key)) as StoredValue)
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
      resetFinalLeaderboardStoreForTests();
      setFinalLeaderboardRedisClientForTests(redis);

      try {
        await callback(redis);
      } finally {
        resetFinalLeaderboardStoreForTests();
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

    resetFinalLeaderboardStoreForTests();
  }
}

function clone<T>(value: T) {
  return JSON.parse(JSON.stringify(value)) as T;
}
