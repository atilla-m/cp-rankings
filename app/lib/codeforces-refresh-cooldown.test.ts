import assert from "node:assert/strict";
import { test } from "node:test";

import { GET as getCodeforcesStandings } from "@/app/api/codeforces/standings/route";
import {
  acquireCodeforcesRefreshCooldown,
  resetCodeforcesRefreshCooldownForTest,
  setCodeforcesCooldownRedisClientForTests,
} from "./codeforces-refresh-cooldown";

test("Redis cooldown allows the first Codeforces refresh", async () => {
  await withMockRedisCooldown(async () => {
    await assert.doesNotReject(acquireCodeforcesRefreshCooldown(1_000));
  });
});

test("Redis cooldown blocks an immediate second refresh", async () => {
  await withMockRedisCooldown(async () => {
    await acquireCodeforcesRefreshCooldown(1_000);

    await assert.rejects(
      acquireCodeforcesRefreshCooldown(1_001),
      /Codeforces refresh is on cooldown\. Try again in 60 seconds\./,
    );
  });
});

test("Redis cooldown returns remaining seconds", async () => {
  await withMockRedisCooldown(async () => {
    await acquireCodeforcesRefreshCooldown(1_000);

    await assert.rejects(
      acquireCodeforcesRefreshCooldown(31_000),
      /Try again in 30 seconds\./,
    );
  });
});

test("Redis cooldown allows refreshes after the cooldown window", async () => {
  await withMockRedisCooldown(async () => {
    await acquireCodeforcesRefreshCooldown(1_000);
    await assert.doesNotReject(acquireCodeforcesRefreshCooldown(61_000));
  });
});

test("production without Redis config returns a clear cooldown config error", async () => {
  resetCodeforcesRefreshCooldownForTest();

  await withEnv(
    {
      NODE_ENV: "production",
      UPSTASH_REDIS_REST_TOKEN: undefined,
      UPSTASH_REDIS_REST_URL: undefined,
    },
    async () => {
      await assert.rejects(
        acquireCodeforcesRefreshCooldown(1_000),
        /UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production/,
      );
    },
  );
});

test("development fallback cooldown works without Redis", async () => {
  await withEnv(
    {
      NODE_ENV: "test",
      UPSTASH_REDIS_REST_TOKEN: undefined,
      UPSTASH_REDIS_REST_URL: undefined,
    },
    async () => {
      resetCodeforcesRefreshCooldownForTest();

      await assert.doesNotReject(acquireCodeforcesRefreshCooldown(1_000));
      await assert.rejects(
        acquireCodeforcesRefreshCooldown(1_001),
        /Codeforces refresh is on cooldown\. Try again in 60 seconds\./,
      );
    },
  );
});

test("failed Codeforces route refresh activates Redis cooldown and blocks retry", async () => {
  await withMockRedisCooldown(async () => {
    await withCodeforcesRouteEnv({}, async () => {
      let fetchCount = 0;

      await withMockFetch(async () => {
        fetchCount += 1;

        return new Response(
          JSON.stringify({
            status: "FAILED",
            comment: "contestId: Contest with id 697487 not found",
          }),
          {
            status: 400,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }, async () => {
        const firstResponse = await getCodeforcesStandings(adminRequest());
        const firstBody = (await firstResponse.json()) as { error: string };

        assert.equal(firstResponse.status, 500);
        assert.match(
          firstBody.error,
          /contestId: Contest with id 697487 not found/,
        );
        assert.equal(fetchCount, 1);

        const secondResponse = await getCodeforcesStandings(adminRequest());
        const secondBody = (await secondResponse.json()) as { error: string };

        assert.equal(secondResponse.status, 500);
        assert.match(secondBody.error, /Codeforces refresh is on cooldown/);
        assert.equal(fetchCount, 1);
      });
    });
  });
});

test("only CF_API_KEY set returns config error without external fetch", async () => {
  await withCodeforcesRouteEnv({ apiKey: "key" }, async () => {
    let fetchCount = 0;

    await withMockFetch(async () => {
      fetchCount += 1;
      return codeforcesFailureResponse();
    }, async () => {
      const response = await getCodeforcesStandings(adminRequest());
      const body = (await response.json()) as { error: string };

      assert.equal(response.status, 500);
      assert.equal(
        body.error,
        "Codeforces API configuration error: both CF_API_KEY and CF_API_SECRET must be set, or neither.",
      );
      assert.equal(fetchCount, 0);
    });
  });
});

test("only CF_API_SECRET set returns config error without external fetch", async () => {
  await withCodeforcesRouteEnv({ apiSecret: "secret" }, async () => {
    let fetchCount = 0;

    await withMockFetch(async () => {
      fetchCount += 1;
      return codeforcesFailureResponse();
    }, async () => {
      const response = await getCodeforcesStandings(adminRequest());
      const body = (await response.json()) as { error: string };

      assert.equal(response.status, 500);
      assert.equal(
        body.error,
        "Codeforces API configuration error: both CF_API_KEY and CF_API_SECRET must be set, or neither.",
      );
      assert.equal(fetchCount, 0);
    });
  });
});

test("CF_AS_MANAGER=true without credentials returns config error without external fetch", async () => {
  await withCodeforcesRouteEnv({ asManager: "true" }, async () => {
    let fetchCount = 0;

    await withMockFetch(async () => {
      fetchCount += 1;
      return codeforcesFailureResponse();
    }, async () => {
      const response = await getCodeforcesStandings(adminRequest());
      const body = (await response.json()) as { error: string };

      assert.equal(response.status, 500);
      assert.equal(
        body.error,
        "Codeforces API configuration error: CF_AS_MANAGER=true requires both CF_API_KEY and CF_API_SECRET.",
      );
      assert.equal(fetchCount, 0);
    });
  });
});

test("anonymous Codeforces refresh is allowed without credentials when manager mode is off", async () => {
  await withMockRedisCooldown(async () => {
    await withCodeforcesRouteEnv({}, async () => {
      const requestedUrls: string[] = [];

      await withMockFetch(async (input) => {
        requestedUrls.push(String(input));
        return codeforcesFailureResponse();
      }, async () => {
        await getCodeforcesStandings(adminRequest());
      });

      assert.equal(requestedUrls.length, 1);
      const publicUrl = new URL(requestedUrls[0]);
      assert.equal(publicUrl.searchParams.has("apiKey"), false);
      assert.equal(publicUrl.searchParams.has("apiSig"), false);
      assert.equal(publicUrl.searchParams.has("asManager"), false);
    });
  });
});

test("full credentials with CF_AS_MANAGER=true call manager signed request first", async () => {
  await withMockRedisCooldown(async () => {
    await withCodeforcesRouteEnv(
      {
        apiKey: "key",
        apiSecret: "secret",
        asManager: "true",
      },
      async () => {
        const requestedUrls: string[] = [];

        await withMockFetch(async (input) => {
          requestedUrls.push(String(input));
          return codeforcesFailureResponse();
        }, async () => {
          await getCodeforcesStandings(adminRequest());
        });

        assert.equal(requestedUrls.length, 1);
        const managerUrl = new URL(requestedUrls[0]);
        assert.equal(managerUrl.searchParams.get("apiKey"), "key");
        assert.equal(managerUrl.searchParams.has("apiSig"), true);
        assert.equal(managerUrl.searchParams.get("asManager"), "true");
      },
    );
  });
});

function adminRequest() {
  return new Request("http://localhost/api/codeforces/standings", {
    headers: {
      "x-admin-password": "admin-secret",
    },
  });
}

type CodeforcesRouteEnvOptions = {
  apiKey?: string;
  apiSecret?: string;
  asManager?: string;
};

type EnvOverrides = Record<string, string | undefined>;

class MockCooldownRedisClient {
  private expiresAt = 0;
  private lastAttemptAt = 0;

  async set(
    key: string,
    value: string,
    options: { ex: number; nx: true },
  ) {
    assert.equal(key, "codeforces-refresh-cooldown");
    assert.equal(options.nx, true);
    assert.equal(options.ex, 60);

    const now = Number(value);
    this.lastAttemptAt = now;

    if (Number.isNaN(now)) {
      throw new Error("Cooldown timestamp must be numeric.");
    }

    if (now < this.expiresAt) {
      return null;
    }

    this.expiresAt = now + options.ex * 1000;

    return "OK";
  }

  async ttl(key: string) {
    assert.equal(key, "codeforces-refresh-cooldown");

    if (this.expiresAt <= this.lastAttemptAt) {
      return -2;
    }

    return Math.ceil((this.expiresAt - this.lastAttemptAt) / 1000);
  }
}

async function withMockRedisCooldown(callback: () => Promise<void>) {
  await withEnv(
    {
      NODE_ENV: "test",
      UPSTASH_REDIS_REST_TOKEN: "test-token",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    },
    async () => {
      resetCodeforcesRefreshCooldownForTest();
      setCodeforcesCooldownRedisClientForTests(new MockCooldownRedisClient());

      try {
        await callback();
      } finally {
        resetCodeforcesRefreshCooldownForTest();
      }
    },
  );
}

async function withCodeforcesRouteEnv(
  options: CodeforcesRouteEnvOptions,
  callback: () => Promise<void>,
) {
  const previousAdminPassword = process.env.ADMIN_PASSWORD;
  const previousContest1Id = process.env.CF_CONTEST_1_ID;
  const previousContest2Id = process.env.CF_CONTEST_2_ID;
  const previousApiKey = process.env.CF_API_KEY;
  const previousApiSecret = process.env.CF_API_SECRET;
  const previousAsManager = process.env.CF_AS_MANAGER;

  process.env.ADMIN_PASSWORD = "admin-secret";
  process.env.CF_CONTEST_1_ID = "697487";
  process.env.CF_CONTEST_2_ID = "697488";
  applyOptionalEnv("CF_API_KEY", options.apiKey);
  applyOptionalEnv("CF_API_SECRET", options.apiSecret);
  applyOptionalEnv("CF_AS_MANAGER", options.asManager);

  try {
    await callback();
  } finally {
    restoreEnv("ADMIN_PASSWORD", previousAdminPassword);
    restoreEnv("CF_CONTEST_1_ID", previousContest1Id);
    restoreEnv("CF_CONTEST_2_ID", previousContest2Id);
    restoreEnv("CF_API_KEY", previousApiKey);
    restoreEnv("CF_API_SECRET", previousApiSecret);
    restoreEnv("CF_AS_MANAGER", previousAsManager);
    resetCodeforcesRefreshCooldownForTest();
  }
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

    resetCodeforcesRefreshCooldownForTest();
  }
}

async function withMockFetch(
  mockFetch: typeof fetch,
  callback: () => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function applyOptionalEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function codeforcesFailureResponse() {
  return new Response(
    JSON.stringify({
      status: "FAILED",
      comment: "contestId: Contest with id 697487 not found",
    }),
    {
      status: 400,
      headers: {
        "content-type": "application/json",
      },
    },
  );
}
