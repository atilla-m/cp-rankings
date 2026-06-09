import { assertAdminRequest } from "@/app/lib/admin-auth";

export async function POST(request: Request) {
  try {
    assertAdminRequest(request);

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to verify admin.",
      },
      {
        status: 401,
      },
    );
  }
}
