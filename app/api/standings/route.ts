import { getPublishedTourStandingsResponse } from "@/app/lib/standings-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [tour1, tour2] = await Promise.all([
      getPublishedTourStandingsResponse("tour-1"),
      getPublishedTourStandingsResponse("tour-2"),
    ]);

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
            : "Unable to load standings snapshot.",
      },
      {
        status: 500,
      },
    );
  }
}
