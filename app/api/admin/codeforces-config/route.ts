import { assertAdminRequest } from "@/app/lib/admin-auth";
import {
  readCodeforcesConfig,
  saveCodeforcesConfig,
} from "@/app/lib/codeforces-config-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertAdminRequest(request);

    return Response.json({
      config: await readCodeforcesConfig(),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Codeforces config.",
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

    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Codeforces config payload is invalid.");
    }

    return Response.json({
      config: await saveCodeforcesConfig(body),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save Codeforces config.",
      },
      {
        status: 400,
      },
    );
  }
}
