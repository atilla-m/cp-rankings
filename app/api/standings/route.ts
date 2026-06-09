import { getPublishedStandingsResponse } from "@/app/lib/standings-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getPublishedStandingsResponse());
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load standings snapshot.",
      },
      {
        status: 500,
      },
    );
  }
}
