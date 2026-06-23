import { assertAdminRequest } from "@/app/lib/admin-auth";
import { publishManualFinalLeaderboardSnapshot } from "@/app/lib/final-leaderboard-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertAdminRequest(request);

    const body = (await request.json()) as unknown;
    const snapshot = await publishManualFinalLeaderboardSnapshot(body);

    return Response.json({ snapshot });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to publish final leaderboard.",
      },
      {
        status: 400,
      },
    );
  }
}
