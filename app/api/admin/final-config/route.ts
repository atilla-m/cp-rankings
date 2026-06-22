import { assertAdminRequest } from "@/app/lib/admin-auth";
import {
  readFinalLeaderboardConfig,
  saveFinalLeaderboardConfig,
} from "@/app/lib/final-leaderboard-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertAdminRequest(request);

    return Response.json({
      config: await readFinalLeaderboardConfig(),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load final config.",
      },
      {
        status: 400,
      },
    );
  }
}

export async function POST(request: Request) {
  try {
    assertAdminRequest(request);

    const body = (await request.json()) as unknown;
    const result = await saveFinalLeaderboardConfig(body);

    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save final config.",
      },
      {
        status: 400,
      },
    );
  }
}
