import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCombinedRankings } from "./rankings";

test("merges official tour results and fills missing scores with zero", () => {
  const rankings = buildCombinedRankings(
    [
      { handle: "alpha", score: 700, penalty: 90, official: true },
      { handle: "unofficial_user", score: 1200, penalty: 1, official: false },
    ],
    [
      { handle: "beta", score: 500, penalty: 70, official: true },
      { handle: "alpha", score: 300, penalty: 30, official: true },
    ],
  );

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
  const rankings = buildCombinedRankings(
    [
      { handle: "zeta", score: 800, penalty: 40, official: true },
      { handle: "beta", score: 900, penalty: 90, official: true },
      { handle: "alpha", score: 900, penalty: 90, official: true },
      { handle: "gamma", score: 900, penalty: 80, official: true },
    ],
    [],
  );

  assert.deepEqual(
    rankings.map((participant) => participant.handle),
    ["gamma", "alpha", "beta", "zeta"],
  );
});

test("defaults to a top 20 qualification cutoff", () => {
  const rankings = buildCombinedRankings(makeRankedTourResults(21), []);

  assert.equal(rankings.filter((participant) => participant.qualified).length, 20);
  assert.equal(rankings[19].status, "Qualified");
  assert.equal(rankings[20].status, "Not qualified");
});

test("cutoff 30 qualifies the top 30", () => {
  const rankings = buildCombinedRankings(makeRankedTourResults(31), [], 30);

  assert.equal(rankings.filter((participant) => participant.qualified).length, 30);
  assert.equal(rankings[29].status, "Qualified");
  assert.equal(rankings[30].status, "Not qualified");
});

test("cutoff 2 qualifies only the top 2", () => {
  const rankings = buildCombinedRankings(
    [
      { handle: "first", score: 300, penalty: 1, official: true },
      { handle: "second", score: 200, penalty: 1, official: true },
      { handle: "third", score: 100, penalty: 1, official: true },
    ],
    [],
    2,
  );

  assert.deepEqual(
    rankings.map((participant) => participant.status),
    ["Qualified", "Qualified", "Not qualified"],
  );
});

function makeRankedTourResults(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    handle: `participant${index + 1}`,
    score: count - index,
    penalty: index,
    official: true,
  }));
}
