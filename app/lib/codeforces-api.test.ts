import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCodeforcesApiUrl,
  codeforcesRowsToTourResults,
  createCodeforcesApiSignature,
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
