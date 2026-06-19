export type TourId = "tour-1" | "tour-2";

export type TourResult = {
  handle: string;
  score: number;
  penalty: number;
  official: boolean;
};

export type TourDisqualification = {
  handle: string;
  reason?: string;
};

export type RankedTourRow = {
  rank: number;
  handle: string;
  score: number;
  penalty: number;
  qualified: boolean;
  disqualified: boolean;
  status: "Qualified" | "Not qualified" | "Disqualified";
  disqualificationReason?: string;
};

const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

export function buildTourStandings({
  rows,
  qualificationCutoff = 20,
  disqualifications = [],
}: {
  rows: TourResult[];
  qualificationCutoff?: number;
  disqualifications?: TourDisqualification[];
}): RankedTourRow[] {
  const disqualificationReasons = new Map(
    disqualifications.map((disqualification) => [
      normalizeHandle(disqualification.handle),
      disqualification.reason?.trim() || undefined,
    ]),
  );

  return deduplicateRows(rows)
    .sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }

      if (a.penalty !== b.penalty) {
        return a.penalty - b.penalty;
      }

      return collator.compare(a.handle, b.handle);
    })
    .map((row, index) => {
      const rank = index + 1;
      const disqualificationReason = disqualificationReasons.get(
        normalizeHandle(row.handle),
      );
      const disqualified = disqualificationReasons.has(normalizeHandle(row.handle));
      const qualified = rank <= qualificationCutoff && !disqualified;

      return {
        ...row,
        rank,
        qualified,
        disqualified,
        status: disqualified
          ? "Disqualified"
          : qualified
            ? "Qualified"
            : "Not qualified",
        ...(disqualificationReason
          ? { disqualificationReason }
          : {}),
      };
    });
}

function deduplicateRows(rows: TourResult[]) {
  const bestRows = new Map<
    string,
    {
      handle: string;
      score: number;
      penalty: number;
    }
  >();

  for (const row of rows) {
    const handle = row.handle.trim();

    if (!row.official || handle.length === 0) {
      continue;
    }

    const key = normalizeHandle(handle);
    const existingRow = bestRows.get(key);
    const nextRow = {
      handle,
      score: row.score,
      penalty: row.penalty,
    };

    if (!existingRow || isBetterRow(nextRow, existingRow)) {
      bestRows.set(key, nextRow);
    }
  }

  return Array.from(bestRows.values());
}

function isBetterRow(
  candidate: { score: number; penalty: number },
  current: { score: number; penalty: number },
) {
  if (candidate.score !== current.score) {
    return candidate.score > current.score;
  }

  return candidate.penalty < current.penalty;
}

function normalizeHandle(handle: string) {
  return handle.trim().toLowerCase();
}
