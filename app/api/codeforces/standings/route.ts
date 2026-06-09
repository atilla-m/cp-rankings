import {
  fetchContestStandings,
  sleep,
} from "@/app/lib/codeforces-api";
import { assertAdminRequest } from "@/app/lib/admin-auth";
import {
  acquireCodeforcesRefreshCooldown,
} from "@/app/lib/codeforces-refresh-cooldown";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertAdminRequest(request);

    const asManager = readBooleanEnv("CF_AS_MANAGER");
    const credentials = readCodeforcesCredentials(asManager);
    const contest1Id = readContestId("CF_CONTEST_1_ID");
    const contest2Id = readContestId("CF_CONTEST_2_ID");

    await acquireCodeforcesRefreshCooldown();

    const tour1 = await fetchContestStandings(contest1Id, {
      asManager,
      credentials,
    });

    await sleep(2000);

    const tour2 = await fetchContestStandings(contest2Id, {
      asManager,
      credentials,
    });

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

function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim();

  return value && value.length > 0 ? value : undefined;
}

function readBooleanEnv(name: string) {
  return readOptionalEnv(name)?.toLowerCase() === "true";
}

function readCodeforcesCredentials(asManager: boolean) {
  const apiKey = readOptionalEnv("CF_API_KEY");
  const apiSecret = readOptionalEnv("CF_API_SECRET");

  if ((apiKey && !apiSecret) || (!apiKey && apiSecret)) {
    throw new Error(
      "Codeforces API configuration error: both CF_API_KEY and CF_API_SECRET must be set, or neither.",
    );
  }

  if (asManager && (!apiKey || !apiSecret)) {
    throw new Error(
      "Codeforces API configuration error: CF_AS_MANAGER=true requires both CF_API_KEY and CF_API_SECRET.",
    );
  }

  if (!apiKey || !apiSecret) {
    return undefined;
  }

  return {
    apiKey,
    apiSecret,
  };
}

function readContestId(name: string) {
  const value = Number(readEnv(name));

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}
