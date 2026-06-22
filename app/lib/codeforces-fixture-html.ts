import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { codeforcesGroupHtmlToTourResults } from "@/app/lib/codeforces-group-html";

const CODEFORCES_GROUP_STANDINGS_FIXTURE_PATH = join(
  process.cwd(),
  "app",
  "fixtures",
  "codeforces-group-standings-sample.html",
);

export async function readCodeforcesGroupHtmlFixture() {
  return readFile(CODEFORCES_GROUP_STANDINGS_FIXTURE_PATH, "utf-8");
}

export async function readCodeforcesGroupHtmlFixtureStandings() {
  return codeforcesGroupHtmlToTourResults(
    await readCodeforcesGroupHtmlFixture(),
  );
}
