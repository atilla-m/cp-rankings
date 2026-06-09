export function assertAdminRequest(request: Request) {
  const configuredPassword = process.env.ADMIN_PASSWORD?.trim();

  if (!configuredPassword) {
    throw new Error("ADMIN_PASSWORD is not configured.");
  }

  const providedPassword = request.headers.get("x-admin-password")?.trim();

  if (providedPassword !== configuredPassword) {
    throw new Error("Invalid admin password.");
  }
}
