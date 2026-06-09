import {
  fetchContestStandings,
  sleep,
} from "@/app/lib/codeforces-api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const apiKey = readEnv("CF_API_KEY");
    const apiSecret = readEnv("CF_API_SECRET");
    const contest1Id = readContestId("CF_CONTEST_1_ID");
    const contest2Id = readContestId("CF_CONTEST_2_ID");

    const credentials = {
      apiKey,
      apiSecret,
    };
    const tour1 = await fetchContestStandings(contest1Id, credentials);

    await sleep(2000);

    const tour2 = await fetchContestStandings(contest2Id, credentials);

    return Response.json({
      tour1,
      tour2,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Codeforces standings.",
      },
      {
        status: 500,
      },
    );
  }
}

function readEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

function readContestId(name: string) {
  const value = Number(readEnv(name));

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}
