import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTourStandings } from "./rankings";

test("builds official tour standings and filters unofficial rows", () => {
  const rankings = buildTourStandings({
    rows: [
      { handle: " alpha ", score: 700, penalty: 90, official: true },
      { handle: "unofficial_user", score: 1200, penalty: 1, official: false },
      { handle: "beta", score: 500, penalty: 70, official: true },
    ],
  });

  assert.deepEqual(
    rankings.map((participant) => participant.handle),
    ["alpha", "beta"],
  );

  assert.deepEqual(rankings[0], {
    rank: 1,
    handle: "alpha",
    score: 700,
    penalty: 90,
    qualified: true,
    disqualified: false,
    status: "Qualified",
  });
});

test("sorts by score, penalty, then handle", () => {
  const rankings = buildTourStandings({
    rows: [
      { handle: "zeta", score: 800, penalty: 40, official: true },
      { handle: "beta", score: 900, penalty: 90, official: true },
      { handle: "alpha", score: 900, penalty: 90, official: true },
      { handle: "gamma", score: 900, penalty: 80, official: true },
    ],
  });

  assert.deepEqual(
    rankings.map((participant) => participant.handle),
    ["gamma", "alpha", "beta", "zeta"],
  );
});

test("defaults to a top 20 qualification cutoff", () => {
  const rankings = buildTourStandings({ rows: makeRankedTourResults(21) });

  assert.equal(rankings.filter((participant) => participant.qualified).length, 20);
  assert.equal(rankings[19].status, "Qualified");
  assert.equal(rankings[20].status, "Not qualified");
});

test("custom cutoff qualifies contestants within that rank", () => {
  const rankings = buildTourStandings({
    rows: makeRankedTourResults(31),
    qualificationCutoff: 30,
  });

  assert.equal(rankings.filter((participant) => participant.qualified).length, 30);
  assert.equal(rankings[29].status, "Qualified");
  assert.equal(rankings[30].status, "Not qualified");
});

test("disqualified contestant does not qualify and remains visible", () => {
  const rankings = buildTourStandings({
    rows: [
      { handle: "first", score: 300, penalty: 1, official: true },
      { handle: "second", score: 200, penalty: 1, official: true },
      { handle: "third", score: 100, penalty: 1, official: true },
    ],
    qualificationCutoff: 2,
    disqualifications: [{ handle: "second", reason: "Rule violation" }],
  });

  assert.deepEqual(
    rankings.map((participant) => participant.handle),
    ["first", "second", "third"],
  );
  assert.deepEqual(
    rankings.map((participant) => participant.status),
    ["Qualified", "Disqualified", "Not qualified"],
  );
  assert.equal(rankings.filter((participant) => participant.qualified).length, 1);
  assert.equal(rankings[1].disqualificationReason, "Rule violation");
});

test("duplicate handle appears only once", () => {
  const rankings = buildTourStandings({
    rows: [
      { handle: "tourist", score: 500, penalty: 100, official: true },
      { handle: "tourist", score: 500, penalty: 100, official: true },
    ],
  });

  assert.deepEqual(
    rankings.map((participant) => participant.handle),
    ["tourist"],
  );
});

test("duplicate with better score wins", () => {
  const rankings = buildTourStandings({
    rows: [
      { handle: "tourist", score: 400, penalty: 10, official: true },
      { handle: "tourist", score: 500, penalty: 100, official: true },
    ],
  });

  assert.equal(rankings.length, 1);
  assert.equal(rankings[0].score, 500);
  assert.equal(rankings[0].penalty, 100);
});

test("duplicate with same score and lower penalty wins", () => {
  const rankings = buildTourStandings({
    rows: [
      { handle: "tourist", score: 500, penalty: 100, official: true },
      { handle: "tourist", score: 500, penalty: 80, official: true },
    ],
  });

  assert.equal(rankings.length, 1);
  assert.equal(rankings[0].score, 500);
  assert.equal(rankings[0].penalty, 80);
});

test("duplicate casing and spacing is treated as same contestant", () => {
  const rankings = buildTourStandings({
    rows: [
      { handle: " tourist ", score: 500, penalty: 100, official: true },
      { handle: "Tourist", score: 500, penalty: 100, official: true },
    ],
  });

  assert.deepEqual(rankings, [
    {
      rank: 1,
      handle: "tourist",
      score: 500,
      penalty: 100,
      qualified: true,
      disqualified: false,
      status: "Qualified",
    },
  ]);
});

test("duplicates do not consume multiple qualification slots", () => {
  const rankings = buildTourStandings({
    rows: [
      { handle: "first", score: 300, penalty: 1, official: true },
      { handle: "first", score: 300, penalty: 1, official: true },
      { handle: "second", score: 200, penalty: 1, official: true },
    ],
    qualificationCutoff: 2,
  });

  assert.deepEqual(
    rankings.map((participant) => participant.handle),
    ["first", "second"],
  );
  assert.equal(rankings.filter((participant) => participant.qualified).length, 2);
});

function makeRankedTourResults(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    handle: `participant${index + 1}`,
    score: count - index,
    penalty: index,
    official: true,
  }));
}
