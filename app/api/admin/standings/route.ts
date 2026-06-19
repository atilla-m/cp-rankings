import { assertAdminRequest } from "@/app/lib/admin-auth";
import { savePublishedTourStandings } from "@/app/lib/standings-store";

export async function POST(request: Request) {
  try {
    assertAdminRequest(request);

    const body = (await request.json()) as unknown;

    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Standings payload is invalid.");
    }

    const snapshot = await savePublishedTourStandings(
      body as Parameters<typeof savePublishedTourStandings>[0],
    );

    return Response.json({ snapshot });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save standings snapshot.",
      },
      {
        status: 400,
      },
    );
  }
}
