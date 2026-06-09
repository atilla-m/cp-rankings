import { createHash, randomBytes } from "node:crypto";
import type { TourResult } from "@/app/lib/rankings";

const CODEFORCES_API_BASE_URL = "https://codeforces.com/api";
const OFFICIAL_PARTICIPANT_TYPE = "CONTESTANT";

type CodeforcesApiCredentials = {
  apiKey: string;
  apiSecret: string;
};

type BuildCodeforcesApiUrlInput = CodeforcesApiCredentials & {
  methodName: string;
  params: Record<string, string | number | boolean>;
  randomPrefix?: string;
  time?: number;
};

type CodeforcesApiResponse<T> =
  | {
      status: "OK";
      result: T;
    }
  | {
      status: "FAILED";
      comment: string;
    };

type CodeforcesStandingsResult = {
  rows: CodeforcesRanklistRow[];
};

export type CodeforcesRanklistRow = {
  party: {
    ghost?: boolean;
    members?: Array<{
      handle?: string;
    }>;
    participantType?: string;
    teamName?: string;
  };
  penalty: number;
  points: number;
};

export function createCodeforcesApiSignature({
  apiSecret,
  methodName,
  params,
  randomPrefix,
}: {
  apiSecret: string;
  methodName: string;
  params: Record<string, string | number | boolean>;
  randomPrefix: string;
}) {
  const serializedParams = serializeCodeforcesParams(params);
  const signaturePayload = `${randomPrefix}/${methodName}?${serializedParams}#${apiSecret}`;
  const signatureHash = createHash("sha512")
    .update(signaturePayload)
    .digest("hex");

  return `${randomPrefix}${signatureHash}`;
}

export function buildCodeforcesApiUrl({
  apiKey,
  apiSecret,
  methodName,
  params,
  randomPrefix = createRandomPrefix(),
  time = Math.floor(Date.now() / 1000),
}: BuildCodeforcesApiUrlInput) {
  const signedParams = {
    ...params,
    apiKey,
    time,
  };
  const apiSig = createCodeforcesApiSignature({
    apiSecret,
    methodName,
    params: signedParams,
    randomPrefix,
  });
  const query = serializeCodeforcesParams({
    ...signedParams,
    apiSig,
  });

  return `${CODEFORCES_API_BASE_URL}/${methodName}?${query}`;
}

export async function fetchContestStandings(
  contestId: number,
  credentials: CodeforcesApiCredentials,
) {
  const url = buildCodeforcesApiUrl({
    ...credentials,
    methodName: "contest.standings",
    params: {
      contestId,
      showUnofficial: false,
    },
  });

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Codeforces standings request failed with HTTP ${response.status}.`,
    );
  }

  const payload =
    (await response.json()) as CodeforcesApiResponse<CodeforcesStandingsResult>;

  if (payload.status !== "OK") {
    throw new Error(payload.comment || "Codeforces API returned an error.");
  }

  return codeforcesRowsToTourResults(payload.result.rows);
}

export function codeforcesRowsToTourResults(
  rows: CodeforcesRanklistRow[],
): TourResult[] {
  return rows.flatMap((row) => {
    if (row.party.ghost || row.party.participantType !== OFFICIAL_PARTICIPANT_TYPE) {
      return [];
    }

    const handle = getRowHandle(row).trim();

    if (handle.length === 0) {
      return [];
    }

    return [
      {
        handle,
        score: row.points,
        penalty: row.penalty,
        official: true,
      },
    ];
  });
}

export function sleep(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function getRowHandle(row: CodeforcesRanklistRow) {
  if (row.party.members?.length === 1) {
    return row.party.members[0].handle ?? "";
  }

  if (row.party.teamName) {
    return row.party.teamName;
  }

  return (
    row.party.members
      ?.map((member) => member.handle?.trim())
      .filter((handle) => handle && handle.length > 0)
      .join(", ") ?? ""
  );
}

function serializeCodeforcesParams(
  params: Record<string, string | number | boolean>,
) {
  return Object.entries(params)
    .sort(([firstKey], [secondKey]) => {
      if (firstKey < secondKey) {
        return -1;
      }

      if (firstKey > secondKey) {
        return 1;
      }

      return 0;
    })
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&");
}

function createRandomPrefix() {
  return randomBytes(3).toString("hex");
}
