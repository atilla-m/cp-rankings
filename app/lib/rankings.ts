export type TourResult = {
  handle: string;
  score: number;
  penalty: number;
  official: boolean;
};

export type RankedParticipant = {
  rank: number;
  handle: string;
  tour1Score: number;
  tour1Penalty: number;
  tour2Score: number;
  tour2Penalty: number;
  totalScore: number;
  totalPenalty: number;
  qualified: boolean;
  status: "Qualified" | "Not qualified";
};

type ParticipantAccumulator = Omit<
  RankedParticipant,
  "rank" | "qualified" | "status" | "totalScore" | "totalPenalty"
>;

type BuildCombinedRankingsInput = {
  tour1: TourResult[];
  tour2: TourResult[];
  qualifierLimit?: number;
};

const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

export function buildCombinedRankings({
  tour1,
  tour2,
  qualifierLimit = 20,
}: BuildCombinedRankingsInput): RankedParticipant[] {
  const participants = new Map<string, ParticipantAccumulator>();

  addTourResults(participants, tour1, "tour1");
  addTourResults(participants, tour2, "tour2");

  return Array.from(participants.values())
    .map((participant) => ({
      ...participant,
      totalScore: participant.tour1Score + participant.tour2Score,
      totalPenalty: participant.tour1Penalty + participant.tour2Penalty,
    }))
    .sort((a, b) => {
      if (a.totalScore !== b.totalScore) {
        return b.totalScore - a.totalScore;
      }

      if (a.totalPenalty !== b.totalPenalty) {
        return a.totalPenalty - b.totalPenalty;
      }

      return collator.compare(a.handle, b.handle);
    })
    .map((participant, index) => {
      const qualified = index < qualifierLimit;

      return {
        ...participant,
        rank: index + 1,
        qualified,
        status: qualified ? "Qualified" : "Not qualified",
      };
    });
}

function addTourResults(
  participants: Map<string, ParticipantAccumulator>,
  results: TourResult[],
  tour: "tour1" | "tour2",
) {
  for (const result of results) {
    const handle = result.handle.trim();

    if (!result.official || handle.length === 0) {
      continue;
    }

    const key = handle.toLowerCase();
    const participant = participants.get(key) ?? {
      handle,
      tour1Score: 0,
      tour1Penalty: 0,
      tour2Score: 0,
      tour2Penalty: 0,
    };

    if (tour === "tour1") {
      participant.tour1Score = result.score;
      participant.tour1Penalty = result.penalty;
    } else {
      participant.tour2Score = result.score;
      participant.tour2Penalty = result.penalty;
    }

    participants.set(key, participant);
  }
}
