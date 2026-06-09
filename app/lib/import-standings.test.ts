import assert from "node:assert/strict";
import { test } from "node:test";

import { parseStandingsImport } from "./import-standings";

test("parses valid JSON standings", () => {
  const standings = parseStandingsImport(`
    [
      { "handle": " tourist ", "score": 500, "penalty": 120 },
      { "handle": "Benq", "score": 400, "penalty": 90 }
    ]
  `);

  assert.deepEqual(standings, [
    { handle: "tourist", score: 500, penalty: 120, official: true },
    { handle: "Benq", score: 400, penalty: 90, official: true },
  ]);
});

test("parses valid CSV standings", () => {
  const standings = parseStandingsImport(`
handle,score,penalty
tourist,500,120
Benq,400,90
  `);

  assert.deepEqual(standings, [
    { handle: "tourist", score: 500, penalty: 120, official: true },
    { handle: "Benq", score: 400, penalty: 90, official: true },
  ]);
});

test("preserves JSON official false rows", () => {
  const standings = parseStandingsImport(
    JSON.stringify([
      { handle: "tourist", score: 500, penalty: 120, official: false },
    ]),
  );

  assert.deepEqual(standings, [
    { handle: "tourist", score: 500, penalty: 120, official: false },
  ]);
});

test("defaults JSON rows without official to true", () => {
  const standings = parseStandingsImport(
    JSON.stringify([{ handle: "tourist", score: 500, penalty: 120 }]),
  );

  assert.deepEqual(standings, [
    { handle: "tourist", score: 500, penalty: 120, official: true },
  ]);
});

test("defaults CSV rows without official to true", () => {
  const standings = parseStandingsImport(`
handle,score,penalty
tourist,500,120
  `);

  assert.deepEqual(standings, [
    { handle: "tourist", score: 500, penalty: 120, official: true },
  ]);
});

test("preserves CSV official false column values", () => {
  const standings = parseStandingsImport(`
handle,score,penalty,official
tourist,500,120,false
Benq,400,90,yes
  `);

  assert.deepEqual(standings, [
    { handle: "tourist", score: 500, penalty: 120, official: false },
    { handle: "Benq", score: 400, penalty: 90, official: true },
  ]);
});

test("rejects empty input", () => {
  assert.throws(
    () => parseStandingsImport("  \n  "),
    /Standings input is empty\./,
  );
});

test("rejects missing handle", () => {
  assert.throws(
    () =>
      parseStandingsImport(
        JSON.stringify([{ score: 500, penalty: 120 }]),
      ),
    /Row 1: handle must be a non-empty string\./,
  );
});

test("rejects invalid score", () => {
  assert.throws(
    () =>
      parseStandingsImport(`
handle,score,penalty
tourist,not-a-score,120
      `),
    /Row 2: score must be a finite non-negative number\./,
  );
});

test("rejects invalid penalty", () => {
  assert.throws(
    () =>
      parseStandingsImport(
        JSON.stringify([{ handle: "tourist", score: 500, penalty: -1 }]),
      ),
    /Row 1: penalty must be a finite non-negative number\./,
  );
});
