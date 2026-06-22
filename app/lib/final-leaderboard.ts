export type FinalDecreaseType = "fixed" | "percentage";

export type FinalProblemScoringRule = {
  decreaseType: FinalDecreaseType;
  decreaseValue: number;
  minScore: number;
};

export type FinalProblem = FinalProblemScoringRule & {
  id: string;
  name: string;
  initialScore: number;
};

export type FinalParticipant = {
  handle: string;
};

export type FinalAcceptedSubmission = {
  participantHandle: string;
  problemId: string;
  acceptedAt: string;
};

export type FinalProblemResult = {
  problemId: string;
  acceptedAt: string;
  solveOrder: number;
  score: number;
  penaltyMinutes: number;
};

export type FinalLeaderboardRow = {
  rank: number;
  handle: string;
  totalScore: number;
  totalPenalty: number;
  problemResults: Record<string, FinalProblemResult | null>;
};

export type FinalLeaderboardConfig = {
  contestStartTime?: string | null;
  problems: FinalProblem[];
};

export type SaveFinalLeaderboardConfigInput = {
  contestStartTime?: unknown;
  problems?: unknown;
};

const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

export const demoFinalParticipants: FinalParticipant[] = [
  { handle: "tourist" },
  { handle: "Benq" },
  { handle: "Petr" },
  { handle: "rng_58" },
];

export const demoFinalAcceptedSubmissions: FinalAcceptedSubmission[] = [
  {
    participantHandle: "tourist",
    problemId: "A",
    acceptedAt: "2026-06-21T10:12:00.000Z",
  },
  {
    participantHandle: "Benq",
    problemId: "A",
    acceptedAt: "2026-06-21T10:18:00.000Z",
  },
  {
    participantHandle: "Petr",
    problemId: "B",
    acceptedAt: "2026-06-21T10:28:00.000Z",
  },
  {
    participantHandle: "tourist",
    problemId: "B",
    acceptedAt: "2026-06-21T10:35:00.000Z",
  },
  {
    participantHandle: "Benq",
    problemId: "C",
    acceptedAt: "2026-06-21T10:46:00.000Z",
  },
  {
    participantHandle: "rng_58",
    problemId: "A",
    acceptedAt: "2026-06-21T10:55:00.000Z",
  },
];

export function buildFinalLeaderboard(
  config: FinalLeaderboardConfig,
  participants: FinalParticipant[],
  acceptedSubmissions: FinalAcceptedSubmission[],
): FinalLeaderboardRow[] {
  const problems = deduplicateProblems(config.problems);
  const participantByKey = new Map(
    deduplicateParticipants(participants).map((participant) => [
      normalizeHandle(participant.handle),
      participant,
    ]),
  );
  const firstAcceptedByParticipantAndProblem = getFirstAcceptedSubmissions(
    acceptedSubmissions,
    participantByKey,
    problems,
  );
  const contestStartMs = parseTime(config.contestStartTime);
  const rowByHandle = new Map<string, Omit<FinalLeaderboardRow, "rank">>();

  for (const participant of participantByKey.values()) {
    rowByHandle.set(normalizeHandle(participant.handle), {
      handle: participant.handle.trim(),
      totalScore: 0,
      totalPenalty: 0,
      problemResults: Object.fromEntries(
        problems.map((problem) => [problem.id, null]),
      ),
    });
  }

  for (const problem of problems) {
    const solves = Array.from(firstAcceptedByParticipantAndProblem.values())
      .filter((submission) => submission.problemId === problem.id)
      .sort((a, b) => {
        const acceptedAtDiff =
          getAcceptedTime(a.acceptedAt) - getAcceptedTime(b.acceptedAt);

        if (acceptedAtDiff !== 0) {
          return acceptedAtDiff;
        }

        return collator.compare(a.participantHandle, b.participantHandle);
      });

    solves.forEach((submission, index) => {
      const participantKey = normalizeHandle(submission.participantHandle);
      const row = rowByHandle.get(participantKey);

      if (!row) {
        return;
      }

      const solveOrder = index + 1;
      const acceptedAtMs = getAcceptedTime(submission.acceptedAt);
      const score = calculateProblemScore(problem, solveOrder);
      const penaltyMinutes =
        contestStartMs === null
          ? 0
          : Math.max(0, Math.floor((acceptedAtMs - contestStartMs) / 60000));

      row.problemResults[problem.id] = {
        problemId: problem.id,
        acceptedAt: submission.acceptedAt,
        solveOrder,
        score,
        penaltyMinutes,
      };
      row.totalScore = roundScore(row.totalScore + score);
      row.totalPenalty += penaltyMinutes;
    });
  }

  return Array.from(rowByHandle.values())
    .sort((a, b) => {
      if (a.totalScore !== b.totalScore) {
        return b.totalScore - a.totalScore;
      }

      if (a.totalPenalty !== b.totalPenalty) {
        return a.totalPenalty - b.totalPenalty;
      }

      return collator.compare(a.handle, b.handle);
    })
    .map((row, index) => ({
      rank: index + 1,
      ...row,
    }));
}

export function validateFinalLeaderboardConfigInput(
  input: SaveFinalLeaderboardConfigInput,
): FinalLeaderboardConfig {
  const contestStartTime = validateContestStartTime(input.contestStartTime);

  if (!Array.isArray(input.problems)) {
    throw new Error("Final problems must be an array.");
  }

  const seenProblemIds = new Set<string>();
  const problems = input.problems.map((entry, index) => {
    const problem = validateProblem(entry, index + 1);
    const normalizedId = problem.id.toLowerCase();

    if (seenProblemIds.has(normalizedId)) {
      throw new Error(`Final problem ${index + 1} id is duplicated.`);
    }

    seenProblemIds.add(normalizedId);
    return problem;
  });

  if (problems.length === 0) {
    throw new Error("At least one final problem is required.");
  }

  return {
    contestStartTime,
    problems,
  };
}

export function getDefaultFinalLeaderboardConfig(): FinalLeaderboardConfig {
  return {
    contestStartTime: "2026-06-21T10:00:00.000Z",
    problems: [
      {
        id: "A",
        name: "Opening Sprint",
        initialScore: 500,
        decreaseType: "fixed",
        decreaseValue: 50,
        minScore: 100,
      },
      {
        id: "B",
        name: "Dynamic Descent",
        initialScore: 500,
        decreaseType: "percentage",
        decreaseValue: 10,
        minScore: 100,
      },
      {
        id: "C",
        name: "Last Stand",
        initialScore: 750,
        decreaseType: "fixed",
        decreaseValue: 75,
        minScore: 250,
      },
    ],
  };
}

function getFirstAcceptedSubmissions(
  acceptedSubmissions: FinalAcceptedSubmission[],
  participantByKey: Map<string, FinalParticipant>,
  problems: FinalProblem[],
) {
  const validProblemIds = new Set(problems.map((problem) => problem.id));
  const firstAccepted = new Map<string, FinalAcceptedSubmission>();

  for (const submission of acceptedSubmissions) {
    const participantKey = normalizeHandle(submission.participantHandle);
    const acceptedAtMs = parseTime(submission.acceptedAt);

    if (
      !participantByKey.has(participantKey) ||
      !validProblemIds.has(submission.problemId) ||
      acceptedAtMs === null
    ) {
      continue;
    }

    const key = `${participantKey}\n${submission.problemId}`;
    const existing = firstAccepted.get(key);

    if (!existing || acceptedAtMs < getAcceptedTime(existing.acceptedAt)) {
      firstAccepted.set(key, {
        participantHandle: participantByKey.get(participantKey)?.handle ?? "",
        problemId: submission.problemId,
        acceptedAt: submission.acceptedAt,
      });
    }
  }

  return firstAccepted;
}

function calculateProblemScore(problem: FinalProblem, solveOrder: number) {
  const rawScore =
    problem.decreaseType === "fixed"
      ? problem.initialScore - problem.decreaseValue * (solveOrder - 1)
      : problem.initialScore *
        Math.pow(1 - problem.decreaseValue / 100, solveOrder - 1);

  return roundScore(Math.max(problem.minScore, rawScore));
}

function deduplicateParticipants(participants: FinalParticipant[]) {
  const participantByKey = new Map<string, FinalParticipant>();

  for (const participant of participants) {
    const handle = participant.handle.trim();

    if (handle.length === 0) {
      continue;
    }

    const key = normalizeHandle(handle);

    if (!participantByKey.has(key)) {
      participantByKey.set(key, { handle });
    }
  }

  return Array.from(participantByKey.values());
}

function deduplicateProblems(problems: FinalProblem[]) {
  const problemById = new Map<string, FinalProblem>();

  for (const problem of problems) {
    const id = problem.id.trim();

    if (id.length === 0 || problemById.has(id)) {
      continue;
    }

    problemById.set(id, { ...problem, id, name: problem.name.trim() });
  }

  return Array.from(problemById.values());
}

function validateProblem(entry: unknown, problemNumber: number): FinalProblem {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`Final problem ${problemNumber} must be an object.`);
  }

  const problem = entry as Partial<FinalProblem>;

  if (typeof problem.id !== "string" || problem.id.trim().length === 0) {
    throw new Error(`Final problem ${problemNumber} id is invalid.`);
  }

  if (typeof problem.name !== "string" || problem.name.trim().length === 0) {
    throw new Error(`Final problem ${problemNumber} name is invalid.`);
  }

  const problemLabel = `Problem ${problem.id.trim()}`;
  const initialScore = parseRequiredNonNegativeNumber(
    problem.initialScore,
    `${problemLabel} initial score`,
  );
  const decreaseValue = parseRequiredNonNegativeNumber(
    problem.decreaseValue,
    `${problemLabel} decrease value`,
  );
  const minScore = parseRequiredNonNegativeNumber(
    problem.minScore,
    `${problemLabel} minimum score`,
  );

  if (
    problem.decreaseType !== "fixed" &&
    problem.decreaseType !== "percentage"
  ) {
    throw new Error(
      `Final problem ${problemNumber} decreaseType must be fixed or percentage.`,
    );
  }

  if (problem.decreaseType === "percentage" && decreaseValue > 100) {
    throw new Error(
      `Final problem ${problemNumber} percentage decreaseValue cannot exceed 100.`,
    );
  }

  if (minScore > initialScore) {
    throw new Error(
      `Final problem ${problemNumber} minScore cannot exceed initialScore.`,
    );
  }

  return {
    id: problem.id.trim(),
    name: problem.name.trim(),
    initialScore,
    decreaseType: problem.decreaseType,
    decreaseValue,
    minScore,
  };
}

function validateContestStartTime(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("Final contestStartTime must be a string.");
  }

  return value.trim();
}

function parseRequiredNonNegativeNumber(value: unknown, label: string) {
  if (value === undefined || value === null) {
    throw new Error(`${label} is required.`);
  }

  if (typeof value === "string" && value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }

  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }

  return numericValue;
}

function parseTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : null;
}

function getAcceptedTime(value: string) {
  return parseTime(value) ?? 0;
}

function roundScore(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function normalizeHandle(handle: string) {
  return handle.trim().toLowerCase();
}
