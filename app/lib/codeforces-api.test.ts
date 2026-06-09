import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCodeforcesApiUrl,
  codeforcesRowsToTourResults,
  createCodeforcesApiSignature,
  fetchContestStandings,
  type CodeforcesRanklistRow,
} from "./codeforces-api";

test("generates deterministic Codeforces API signatures", () => {
  const apiSig = createCodeforcesApiSignature({
    apiSecret: "secret",
    methodName: "contest.standings",
    randomPrefix: "abc123",
    params: {
      contestId: 1,
      showUnofficial: false,
      time: 1700000000,
      apiKey: "key",
    },
  });

  assert.equal(
    apiSig,
    "abc123048fa1d0da6c8395cbc8f2366286b755fd69b7e774842590bd8695f72e58c60b376086d5991ae929c510aee43c7c807b7ae7446e6758bbb3e4d066ece02684b4",
  );
});

test("builds signed Codeforces API URLs with sorted parameters", () => {
  const url = buildCodeforcesApiUrl({
    apiKey: "key",
    apiSecret: "secret",
    methodName: "contest.standings",
    randomPrefix: "abc123",
    time: 1700000000,
    params: {
      showUnofficial: false,
      contestId: 1,
    },
  });

  assert.equal(
    url,
    "https://codeforces.com/api/contest.standings?apiKey=key&apiSig=abc123048fa1d0da6c8395cbc8f2366286b755fd69b7e774842590bd8695f72e58c60b376086d5991ae929c510aee43c7c807b7ae7446e6758bbb3e4d066ece02684b4&contestId=1&showUnofficial=false&time=1700000000",
  );
});

test("converts Codeforces ranklist rows to internal tour results", () => {
  const rows: CodeforcesRanklistRow[] = [
    {
      party: {
        members: [{ handle: " tourist " }],
        participantType: "CONTESTANT",
      },
      points: 500,
      penalty: 120,
    },
    {
      party: {
        members: [{ handle: "Benq" }],
        participantType: "CONTESTANT",
      },
      points: 400,
      penalty: 90,
    },
  ];

  assert.deepEqual(codeforcesRowsToTourResults(rows), [
    { handle: "tourist", score: 500, penalty: 120, official: true },
    { handle: "Benq", score: 400, penalty: 90, official: true },
  ]);
});

test("filters unofficial, virtual, practice, manager, and ghost rows", () => {
  const rows: CodeforcesRanklistRow[] = [
    makeRow("contestant", "CONTESTANT"),
    makeRow("out", "OUT_OF_COMPETITION"),
    makeRow("virtual", "VIRTUAL"),
    makeRow("practice", "PRACTICE"),
    makeRow("manager", "MANAGER"),
    {
      party: {
        ghost: true,
        members: [{ handle: "ghost" }],
        participantType: "CONTESTANT",
      },
      points: 100,
      penalty: 1,
    },
  ];

  assert.deepEqual(codeforcesRowsToTourResults(rows), [
    { handle: "contestant", score: 100, penalty: 1, official: true },
  ]);
});

test("manager mode uses signed asManager request first", async () => {
  const requestedUrls: string[] = [];

  await withMockFetch(async (input) => {
    requestedUrls.push(String(input));

    return codeforcesResponse({
      status: "OK",
      result: {
        rows: [makeRow("tourist", "CONTESTANT")],
      },
    });
  }, async () => {
    const standings = await fetchContestStandings(697487, {
      asManager: true,
      credentials: {
        apiKey: "key",
        apiSecret: "secret",
      },
    });

    assert.deepEqual(standings, [
      { handle: "tourist", score: 100, penalty: 1, official: true },
    ]);
  });

  assert.equal(requestedUrls.length, 1);

  const managerUrl = new URL(requestedUrls[0]);
  assert.equal(managerUrl.searchParams.get("contestId"), "697487");
  assert.equal(managerUrl.searchParams.get("showUnofficial"), "false");
  assert.equal(managerUrl.searchParams.get("apiKey"), "key");
  assert.equal(managerUrl.searchParams.has("apiSig"), true);
  assert.equal(managerUrl.searchParams.get("asManager"), "true");
});

test("non-manager mode tries public request first", async () => {
  const requestedUrls: string[] = [];

  await withMockFetch(async (input) => {
    requestedUrls.push(String(input));

    return codeforcesResponse({
      status: "OK",
      result: {
        rows: [makeRow("tourist", "CONTESTANT")],
      },
    });
  }, async () => {
    await fetchContestStandings(697487, {
      asManager: false,
      credentials: {
        apiKey: "key",
        apiSecret: "secret",
      },
    });
  });

  assert.equal(requestedUrls.length, 1);

  const publicUrl = new URL(requestedUrls[0]);
  assert.equal(publicUrl.searchParams.get("contestId"), "697487");
  assert.equal(publicUrl.searchParams.get("showUnofficial"), "false");
  assert.equal(publicUrl.searchParams.has("apiKey"), false);
  assert.equal(publicUrl.searchParams.has("apiSig"), false);
  assert.equal(publicUrl.searchParams.has("asManager"), false);
});

test("non-manager mode falls back to signed request after public failure", async () => {
  const requestedUrls: string[] = [];

  await withMockFetch(async (input) => {
    requestedUrls.push(String(input));

    if (requestedUrls.length === 1) {
      return codeforcesResponse({
        status: "FAILED",
        comment: "Contest with id 697487 not found",
      });
    }

    return codeforcesResponse({
      status: "OK",
      result: {
        rows: [makeRow("tourist", "CONTESTANT")],
      },
    });
  }, async () => {
    await fetchContestStandings(697487, {
      asManager: false,
      credentials: {
        apiKey: "key",
        apiSecret: "secret",
      },
    });
  });

  assert.equal(requestedUrls.length, 2);

  const signedUrl = new URL(requestedUrls[1]);
  assert.equal(signedUrl.searchParams.get("apiKey"), "key");
  assert.equal(signedUrl.searchParams.has("apiSig"), true);
  assert.equal(signedUrl.searchParams.has("asManager"), false);
});

test("surfaces Codeforces API comments when standings fail", async () => {
  await withMockFetch(
    async () =>
      codeforcesResponse({
        status: "FAILED",
        comment: "Contest with id 697487 not found",
      }),
    async () => {
      await assert.rejects(
        () => fetchContestStandings(697487),
        /Contest with id 697487 not found/,
      );
    },
  );
});

test("surfaces Codeforces comments from HTTP error responses", async () => {
  await withMockFetch(
    async () =>
      codeforcesResponse(
        {
          status: "FAILED",
          comment: "contestId: Contest with id 697487 not found",
        },
        400,
      ),
    async () => {
      await assert.rejects(
        () => fetchContestStandings(697487),
        /contestId: Contest with id 697487 not found/,
      );
    },
  );
});

function makeRow(handle: string, participantType: string): CodeforcesRanklistRow {
  return {
    party: {
      members: [{ handle }],
      participantType,
    },
    points: 100,
    penalty: 1,
  };
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

function codeforcesResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}
