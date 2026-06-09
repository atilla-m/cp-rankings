import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCombinedRankings } from "./rankings";

test("merges official tour results and fills missing scores with zero", () => {
  const rankings = buildCombinedRankings({
    qualifierLimit: 20,
    tour1: [
      { handle: "alpha", score: 700, penalty: 90, official: true },
      { handle: "unofficial_user", score: 1200, penalty: 1, official: false },
    ],
    tour2: [
      { handle: "beta", score: 500, penalty: 70, official: true },
      { handle: "alpha", score: 300, penalty: 30, official: true },
    ],
  });

  assert.deepEqual(
    rankings.map((participant) => participant.handle),
    ["alpha", "beta"],
  );

  assert.deepEqual(rankings[0], {
    rank: 1,
    handle: "alpha",
    tour1Score: 700,
    tour1Penalty: 90,
    tour2Score: 300,
    tour2Penalty: 30,
    totalScore: 1000,
    totalPenalty: 120,
    qualified: true,
    status: "Qualified",
  });

  assert.equal(rankings[1].tour1Score, 0);
  assert.equal(rankings[1].tour1Penalty, 0);
});

test("sorts by score, penalty, then handle", () => {
  const rankings = buildCombinedRankings({
    qualifierLimit: 20,
    tour1: [
      { handle: "zeta", score: 800, penalty: 40, official: true },
      { handle: "beta", score: 900, penalty: 90, official: true },
      { handle: "alpha", score: 900, penalty: 90, official: true },
      { handle: "gamma", score: 900, penalty: 80, official: true },
    ],
    tour2: [],
  });

  assert.deepEqual(
    rankings.map((participant) => participant.handle),
    ["gamma", "alpha", "beta", "zeta"],
  );
});

test("marks only the qualifier limit as qualified", () => {
  const rankings = buildCombinedRankings({
    qualifierLimit: 2,
    tour1: [
      { handle: "first", score: 300, penalty: 1, official: true },
      { handle: "second", score: 200, penalty: 1, official: true },
      { handle: "third", score: 100, penalty: 1, official: true },
    ],
    tour2: [],
  });

  assert.deepEqual(
    rankings.map((participant) => participant.status),
    ["Qualified", "Qualified", "Not qualified"],
  );
});
