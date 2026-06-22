import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/codeforces/standings": [
      "./app/fixtures/codeforces-group-standings-sample.html",
    ],
  },
};

export default nextConfig;
