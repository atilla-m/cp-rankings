import assert from "node:assert/strict";
import { test } from "node:test";

import AdminPage from "@/app/admin/page";
import {
  resetCodeforcesConfigStoreForTests,
  saveCodeforcesConfig,
  setCodeforcesConfigRedisClientForTests,
  type StoredCodeforcesConfig,
} from "./codeforces-config-store";

test("/admin render does not read saved Codeforces config before verification", async () => {
  await withMockConfigRedis(async (redisClient) => {
    await saveCodeforcesConfig({
      groupCode: "secret-group",
      tour1ContestId: 111,
      tour2ContestId: 222,
    });

    redisClient.resetCalls();

    const element = AdminPage();
    const props = getReactElementProps(element);

    assert.equal(redisClient.getCalls, 0);
    assert.equal("initialCodeforcesConfig" in props, false);
    assert.doesNotMatch(JSON.stringify(props), /secret-group|111|222/);
  });
});

class MockConfigRedisClient {
  private readonly values = new Map<string, unknown>();
  getCalls = 0;

  async get(key: string) {
    assert.equal(key, "codeforces:config");
    this.getCalls += 1;

    return this.values.has(key) ? clone(this.values.get(key)) : null;
  }

  async set(key: string, value: StoredCodeforcesConfig) {
    assert.equal(key, "codeforces:config");
    this.values.set(key, clone(value));

    return "OK";
  }

  resetCalls() {
    this.getCalls = 0;
  }
}

async function withMockConfigRedis(
  callback: (redisClient: MockConfigRedisClient) => Promise<void>,
) {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const previousRedisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisClient = new MockConfigRedisClient();

  setEnv("NODE_ENV", "test");
  setEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
  setEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
  resetCodeforcesConfigStoreForTests();
  setCodeforcesConfigRedisClientForTests(redisClient);

  try {
    await callback(redisClient);
  } finally {
    restoreEnv("NODE_ENV", previousNodeEnv);
    restoreEnv("UPSTASH_REDIS_REST_TOKEN", previousRedisToken);
    restoreEnv("UPSTASH_REDIS_REST_URL", previousRedisUrl);
    resetCodeforcesConfigStoreForTests();
  }
}

function getReactElementProps(element: unknown): Record<string, unknown> {
  assert.equal(typeof element, "object");
  assert.notEqual(element, null);

  const props = (element as { props?: unknown }).props;

  assert.equal(typeof props, "object");
  assert.notEqual(props, null);

  return props as Record<string, unknown>;
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    setEnv(key, value);
  }
}

function setEnv(key: string, value: string) {
  process.env[key] = value;
}

function clone<T>(value: T) {
  return JSON.parse(JSON.stringify(value)) as T;
}
