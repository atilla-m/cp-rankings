import {
  fetchContestStandings,
  sleep,
} from "@/app/lib/codeforces-api";
import { assertAdminRequest } from "@/app/lib/admin-auth";
import {
  acquireCodeforcesRefreshCooldown,
} from "@/app/lib/codeforces-refresh-cooldown";
import {
  getCodeforcesEnvDefaults,
  readCodeforcesConfig,
  requireCompleteCodeforcesConfig,
  validateCodeforcesConfigInput,
  type CodeforcesConfig,
} from "@/app/lib/codeforces-config-store";
import { fetchCodeforcesGroupHtmlStandings } from "@/app/lib/codeforces-group-html";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return loadCodeforcesStandings(request);
}

export async function POST(request: Request) {
  try {
    assertAdminRequest(request);

    return await loadCodeforcesStandings(request, await readRequestConfig(request));
  } catch (error) {
    return codeforcesErrorResponse(error);
  }
}

async function loadCodeforcesStandings(
  request: Request,
  requestConfig?: ReturnType<typeof validateCodeforcesConfigInput>,
) {
  try {
    assertAdminRequest(request);

    const config = requireCompleteCodeforcesConfig(
      requestConfig
        ? getEffectiveRequestConfig(requestConfig)
        : await readCodeforcesConfig(),
    );
    const apiFetchOptions =
      config.fetchMode === "api" ? readCodeforcesApiFetchOptions() : undefined;

    await acquireCodeforcesRefreshCooldown();

    const tour1 = await fetchConfiguredContestStandings({
      apiFetchOptions,
      config,
      contestId: config.tour1ContestId,
    });

    await sleep(2000);

    const tour2 = await fetchConfiguredContestStandings({
      apiFetchOptions,
      config,
      contestId: config.tour2ContestId,
    });

    return Response.json({
      tour1,
      tour2,
    });
  } catch (error) {
    return codeforcesErrorResponse(error);
  }
}

function getEffectiveRequestConfig(requestConfig: CodeforcesConfig) {
  const envDefaults = getCodeforcesEnvDefaults();

  return {
    groupCode: requestConfig.groupCode || envDefaults.groupCode,
    tour1ContestId: requestConfig.tour1ContestId ?? envDefaults.tour1ContestId,
    tour2ContestId: requestConfig.tour2ContestId ?? envDefaults.tour2ContestId,
  };
}

async function fetchConfiguredContestStandings({
  apiFetchOptions,
  config,
  contestId,
}: {
  apiFetchOptions?: CodeforcesApiFetchOptions;
  config: ReturnType<typeof requireCompleteCodeforcesConfig>;
  contestId: number;
}) {
  if (config.fetchMode === "group-html") {
    return fetchCodeforcesGroupHtmlStandings({
      contestId,
      groupCode: config.groupCode,
    });
  }

  if (!apiFetchOptions) {
    throw new Error("Codeforces API fetch options are missing.");
  }

  return fetchContestStandings(contestId, {
    asManager: apiFetchOptions.asManager,
    credentials: apiFetchOptions.credentials,
  });
}

async function readRequestConfig(request: Request) {
  const body = (await request.json()) as unknown;

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Codeforces config payload is invalid.");
  }

  return validateCodeforcesConfigInput(body);
}

function codeforcesErrorResponse(error: unknown) {
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

function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim();

  return value && value.length > 0 ? value : undefined;
}

function readBooleanEnv(name: string) {
  return readOptionalEnv(name)?.toLowerCase() === "true";
}

type CodeforcesApiFetchOptions = {
  asManager: boolean;
  credentials?: ReturnType<typeof readCodeforcesCredentials>;
};

function readCodeforcesApiFetchOptions(): CodeforcesApiFetchOptions {
  const asManager = readBooleanEnv("CF_AS_MANAGER");

  return {
    asManager,
    credentials: readCodeforcesCredentials(asManager),
  };
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
