import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildFinalLeaderboard,
  validateFinalLeaderboardConfigInput,
  type FinalLeaderboardConfig,
} from "./final-leaderboard";

test("applies fixed decrease scoring", () => {
  const leaderboard = buildFinalLeaderboard(
    makeConfig({
      decreaseType: "fixed",
      decreaseValue: 50,
    }),
    makeParticipants("first", "second", "third"),
    [
      accepted("first", "A", "2026-06-21T10:01:00.000Z"),
      accepted("second", "A", "2026-06-21T10:02:00.000Z"),
      accepted("third", "A", "2026-06-21T10:03:00.000Z"),
    ],
  );

  assert.deepEqual(
    scoresByHandle(leaderboard, "A"),
    new Map([
      ["first", 500],
      ["second", 450],
      ["third", 400],
    ]),
  );
});

test("applies percentage decrease scoring", () => {
  const leaderboard = buildFinalLeaderboard(
    makeConfig({
      decreaseType: "percentage",
      decreaseValue: 10,
    }),
    makeParticipants("first", "second", "third"),
    [
      accepted("first", "A", "2026-06-21T10:01:00.000Z"),
      accepted("second", "A", "2026-06-21T10:02:00.000Z"),
      accepted("third", "A", "2026-06-21T10:03:00.000Z"),
    ],
  );

  assert.deepEqual(
    scoresByHandle(leaderboard, "A"),
    new Map([
      ["first", 500],
      ["second", 450],
      ["third", 405],
    ]),
  );
});

test("score does not go below minScore", () => {
  const leaderboard = buildFinalLeaderboard(
    makeConfig({
      decreaseType: "fixed",
      decreaseValue: 250,
      minScore: 100,
    }),
    makeParticipants("first", "second", "third", "fourth"),
    [
      accepted("first", "A", "2026-06-21T10:01:00.000Z"),
      accepted("second", "A", "2026-06-21T10:02:00.000Z"),
      accepted("third", "A", "2026-06-21T10:03:00.000Z"),
      accepted("fourth", "A", "2026-06-21T10:04:00.000Z"),
    ],
  );

  assert.deepEqual(
    scoresByHandle(leaderboard, "A"),
    new Map([
      ["first", 500],
      ["second", 250],
      ["third", 100],
      ["fourth", 100],
    ]),
  );
});

test("duplicate accepted submissions count once", () => {
  const leaderboard = buildFinalLeaderboard(
    makeConfig(),
    makeParticipants("alpha", "beta"),
    [
      accepted("alpha", "A", "2026-06-21T10:05:00.000Z"),
      accepted("alpha", "A", "2026-06-21T10:10:00.000Z"),
      accepted("beta", "A", "2026-06-21T10:06:00.000Z"),
    ],
  );

  const alpha = leaderboard.find((row) => row.handle === "alpha");
  const beta = leaderboard.find((row) => row.handle === "beta");

  assert.equal(alpha?.problemResults.A?.score, 500);
  assert.equal(alpha?.problemResults.A?.penaltyMinutes, 5);
  assert.equal(beta?.problemResults.A?.score, 450);
});

test("solveOrder is determined by acceptedAt ascending", () => {
  const leaderboard = buildFinalLeaderboard(
    makeConfig(),
    makeParticipants("alpha", "beta", "gamma"),
    [
      accepted("gamma", "A", "2026-06-21T10:30:00.000Z"),
      accepted("alpha", "A", "2026-06-21T10:10:00.000Z"),
      accepted("beta", "A", "2026-06-21T10:20:00.000Z"),
    ],
  );

  assert.equal(
    leaderboard.find((row) => row.handle === "alpha")?.problemResults.A
      ?.solveOrder,
    1,
  );
  assert.equal(
    leaderboard.find((row) => row.handle === "beta")?.problemResults.A
      ?.solveOrder,
    2,
  );
  assert.equal(
    leaderboard.find((row) => row.handle === "gamma")?.problemResults.A
      ?.solveOrder,
    3,
  );
});

test("calculates totalPenalty from contestStartTime", () => {
  const leaderboard = buildFinalLeaderboard(
    {
      contestStartTime: "2026-06-21T10:00:00.000Z",
      problems: [
        makeProblem({ id: "A" }),
        makeProblem({ id: "B" }),
      ],
    },
    makeParticipants("alpha"),
    [
      accepted("alpha", "A", "2026-06-21T10:12:00.000Z"),
      accepted("alpha", "B", "2026-06-21T10:35:00.000Z"),
    ],
  );

  assert.equal(leaderboard[0].totalPenalty, 47);
});

test("invalid contestStartTime safely produces zero penalty", () => {
  const leaderboard = buildFinalLeaderboard(
    {
      contestStartTime: "not-a-date",
      problems: [makeProblem({ id: "A" })],
    },
    makeParticipants("alpha"),
    [accepted("alpha", "A", "2026-06-21T10:12:00.000Z")],
  );

  assert.equal(leaderboard[0].totalPenalty, 0);
});

test("sorts by score, penalty, then handle", () => {
  const leaderboard = buildFinalLeaderboard(
    makeConfig(),
    makeParticipants("zeta", "alpha", "beta", "gamma"),
    [
      accepted("zeta", "A", "2026-06-21T10:30:00.000Z"),
      accepted("alpha", "A", "2026-06-21T10:10:00.000Z"),
      accepted("beta", "A", "2026-06-21T10:10:00.000Z"),
    ],
  );

  assert.deepEqual(
    leaderboard.map((row) => row.handle),
    ["alpha", "beta", "zeta", "gamma"],
  );
});

test("validates final config", () => {
  assert.deepEqual(
    validateFinalLeaderboardConfigInput({
      contestStartTime: "2026-06-21T10:00:00.000Z",
      problems: [
        {
          id: " A ",
          name: " Problem A ",
          initialScore: "500",
          decreaseType: "fixed",
          decreaseValue: "50",
          minScore: "100",
        },
      ],
    }),
    {
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
  );

  assert.throws(
    () =>
      validateFinalLeaderboardConfigInput({
        problems: [
          makeProblem({ id: "A" }),
          makeProblem({ id: "a" }),
        ],
      }),
    /duplicated/,
  );
  assert.throws(
    () =>
      validateFinalLeaderboardConfigInput({
        problems: [makeProblem({ decreaseType: "percentage", decreaseValue: 101 })],
      }),
    /cannot exceed 100/,
  );
  assert.throws(
    () =>
      validateFinalLeaderboardConfigInput({
        problems: [makeProblem({ initialScore: 100, minScore: 200 })],
      }),
    /minScore cannot exceed initialScore/,
  );
});

test("rejects empty required final numeric fields", () => {
  assert.throws(
    () =>
      validateFinalLeaderboardConfigInput({
        problems: [makeRawProblem({ initialScore: "" })],
      }),
    /Problem A initial score is required/,
  );
  assert.throws(
    () =>
      validateFinalLeaderboardConfigInput({
        problems: [makeRawProblem({ initialScore: "   " })],
      }),
    /Problem A initial score is required/,
  );
  assert.throws(
    () =>
      validateFinalLeaderboardConfigInput({
        problems: [makeRawProblem({ decreaseValue: "" })],
      }),
    /Problem A decrease value is required/,
  );
  assert.throws(
    () =>
      validateFinalLeaderboardConfigInput({
        problems: [makeRawProblem({ minScore: "" })],
      }),
    /Problem A minimum score is required/,
  );
});

test("accepts explicit zero only where final numeric range rules allow it", () => {
  assert.deepEqual(
    validateFinalLeaderboardConfigInput({
      problems: [
        makeRawProblem({
          initialScore: "0",
          decreaseValue: "0",
          minScore: "0",
        }),
      ],
    }).problems[0],
    {
      id: "A",
      name: "Problem A",
      initialScore: 0,
      decreaseType: "fixed",
      decreaseValue: 0,
      minScore: 0,
    },
  );

  assert.throws(
    () =>
      validateFinalLeaderboardConfigInput({
        problems: [
          makeRawProblem({
            initialScore: "0",
            minScore: "1",
          }),
        ],
      }),
    /minScore cannot exceed initialScore/,
  );
});

test("valid numeric strings still pass final config validation", () => {
  const config = validateFinalLeaderboardConfigInput({
    problems: [
      makeRawProblem({
        initialScore: "750.5",
        decreaseValue: "12.5",
        minScore: "100.25",
      }),
    ],
  });

  assert.equal(config.problems[0].initialScore, 750.5);
  assert.equal(config.problems[0].decreaseValue, 12.5);
  assert.equal(config.problems[0].minScore, 100.25);
});

function makeConfig(
  overrides: Partial<FinalLeaderboardConfig["problems"][number]> = {},
): FinalLeaderboardConfig {
  return {
    contestStartTime: "2026-06-21T10:00:00.000Z",
    problems: [makeProblem(overrides)],
  };
}

function makeProblem(
  overrides: Partial<FinalLeaderboardConfig["problems"][number]> = {},
): FinalLeaderboardConfig["problems"][number] {
  return {
    id: "A",
    name: "Problem A",
    initialScore: 500,
    decreaseType: "fixed",
    decreaseValue: 50,
    minScore: 100,
    ...overrides,
  };
}

function makeRawProblem(overrides: Record<string, unknown> = {}) {
  return {
    id: "A",
    name: "Problem A",
    initialScore: 500,
    decreaseType: "fixed",
    decreaseValue: 50,
    minScore: 100,
    ...overrides,
  };
}

function makeParticipants(...handles: string[]) {
  return handles.map((handle) => ({ handle }));
}

function accepted(participantHandle: string, problemId: string, acceptedAt: string) {
  return {
    participantHandle,
    problemId,
    acceptedAt,
  };
}

function scoresByHandle(
  leaderboard: ReturnType<typeof buildFinalLeaderboard>,
  problemId: string,
) {
  return new Map(
    leaderboard.map((row) => [
      row.handle,
      row.problemResults[problemId]?.score ?? 0,
    ]),
  );
}
