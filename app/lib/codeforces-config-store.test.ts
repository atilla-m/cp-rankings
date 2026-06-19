import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GET as getCodeforcesConfig,
  POST as postCodeforcesConfig,
} from "@/app/api/admin/codeforces-config/route";
import {
  readCodeforcesConfig,
  resetCodeforcesConfigStoreForTests,
  saveCodeforcesConfig,
  setCodeforcesConfigRedisClientForTests,
  type StoredCodeforcesConfig,
} from "./codeforces-config-store";

test("admin config can be saved and loaded", async () => {
  await withMockConfigRedis(async () => {
    const saveResponse = await postCodeforcesConfig(
      adminRequest({
        groupCode: "group-a",
        tour1ContestId: 111,
        tour2ContestId: 222,
      }),
    );
    const saveBody = (await saveResponse.json()) as {
      config: StoredCodeforcesConfig;
    };

    assert.equal(saveResponse.status, 200);
    assert.equal(saveBody.config.groupCode, "group-a");
    assert.equal(saveBody.config.tour1ContestId, 111);
    assert.equal(saveBody.config.tour2ContestId, 222);

    const loadResponse = await getCodeforcesConfig(adminRequest());
    const loadBody = (await loadResponse.json()) as {
      config: StoredCodeforcesConfig;
    };

    assert.equal(loadResponse.status, 200);
    assert.equal(loadBody.config.groupCode, "group-a");
    assert.equal(loadBody.config.tour1ContestId, 111);
    assert.equal(loadBody.config.tour2ContestId, 222);
  });
});

test("admin config requires valid admin password", async () => {
  await withMockConfigRedis(async () => {
    await saveCodeforcesConfig({
      groupCode: "group-a",
      tour1ContestId: 111,
      tour2ContestId: 222,
    });

    const missingPasswordResponse = await getCodeforcesConfig(
      unauthenticatedRequest(),
    );
    const missingPasswordBody = (await missingPasswordResponse.json()) as {
      error: string;
    };

    assert.equal(missingPasswordResponse.status, 400);
    assert.equal(missingPasswordBody.error, "Invalid admin password.");
    assert.doesNotMatch(JSON.stringify(missingPasswordBody), /group-a|111|222/);

    const invalidPasswordResponse = await getCodeforcesConfig(
      unauthenticatedRequest("wrong-secret"),
    );
    const invalidPasswordBody = (await invalidPasswordResponse.json()) as {
      error: string;
    };

    assert.equal(invalidPasswordResponse.status, 400);
    assert.equal(invalidPasswordBody.error, "Invalid admin password.");
    assert.doesNotMatch(JSON.stringify(invalidPasswordBody), /group-a|111|222/);

    const validPasswordResponse = await getCodeforcesConfig(adminRequest());
    const validPasswordBody = (await validPasswordResponse.json()) as {
      config: StoredCodeforcesConfig;
    };

    assert.equal(validPasswordResponse.status, 200);
    assert.equal(validPasswordBody.config.groupCode, "group-a");
    assert.equal(validPasswordBody.config.tour1ContestId, 111);
    assert.equal(validPasswordBody.config.tour2ContestId, 222);
  });
});

test("invalid contest ID is rejected", async () => {
  await withMockConfigRedis(async () => {
    const response = await postCodeforcesConfig(
      adminRequest({
        groupCode: "group-a",
        tour1ContestId: "not-a-number",
        tour2ContestId: 222,
      }),
    );
    const body = (await response.json()) as { error: string };

    assert.equal(response.status, 400);
    assert.equal(body.error, "Tour 1 contest ID must be a positive integer.");
  });
});

test("env defaults work if no saved config exists", async () => {
  await withMockConfigRedis(async () => {
    await withEnv(
      {
        CF_GROUP_CODE: "env-group",
        CF_CONTEST_1_ID: "333",
        CF_CONTEST_2_ID: "444",
      },
      async () => {
        const config = await readCodeforcesConfig();

        assert.equal(config.groupCode, "env-group");
        assert.equal(config.tour1ContestId, 333);
        assert.equal(config.tour2ContestId, 444);

        const response = await getCodeforcesConfig(adminRequest());
        const body = (await response.json()) as {
          config: StoredCodeforcesConfig;
        };

        assert.equal(response.status, 200);
        assert.equal(body.config.groupCode, "env-group");
        assert.equal(body.config.tour1ContestId, 333);
        assert.equal(body.config.tour2ContestId, 444);
      },
    );
  });
});

test("saved config wins over env defaults", async () => {
  await withMockConfigRedis(async () => {
    await saveCodeforcesConfig({
      groupCode: "saved-group",
      tour1ContestId: 111,
      tour2ContestId: 222,
    });

    await withEnv(
      {
        CF_GROUP_CODE: "env-group",
        CF_CONTEST_1_ID: "333",
        CF_CONTEST_2_ID: "444",
      },
      async () => {
        const config = await readCodeforcesConfig();

        assert.equal(config.groupCode, "saved-group");
        assert.equal(config.tour1ContestId, 111);
        assert.equal(config.tour2ContestId, 222);
      },
    );
  });
});

type EnvOverrides = Record<string, string | undefined>;

class MockConfigRedisClient {
  private readonly values = new Map<string, unknown>();

  async get(key: string) {
    assert.equal(key, "codeforces:config");

    return this.values.has(key) ? clone(this.values.get(key)) : null;
  }

  async set(key: string, value: StoredCodeforcesConfig) {
    assert.equal(key, "codeforces:config");
    this.values.set(key, clone(value));

    return "OK";
  }
}

async function withMockConfigRedis(callback: () => Promise<void>) {
  await withEnv(
    {
      ADMIN_PASSWORD: "admin-secret",
      NODE_ENV: "test",
      UPSTASH_REDIS_REST_TOKEN: "test-token",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    },
    async () => {
      resetCodeforcesConfigStoreForTests();
      setCodeforcesConfigRedisClientForTests(new MockConfigRedisClient());

      try {
        await callback();
      } finally {
        resetCodeforcesConfigStoreForTests();
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

    resetCodeforcesConfigStoreForTests();
  }
}

function adminRequest(body?: unknown) {
  return new Request("http://localhost/api/admin/codeforces-config", {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "x-admin-password": "admin-secret",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function unauthenticatedRequest(password?: string) {
  return new Request("http://localhost/api/admin/codeforces-config", {
    headers:
      password === undefined
        ? undefined
        : {
            "x-admin-password": password,
          },
  });
}

function clone<T>(value: T) {
  return JSON.parse(JSON.stringify(value)) as T;
}
