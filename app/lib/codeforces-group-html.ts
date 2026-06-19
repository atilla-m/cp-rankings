import type { TourResult } from "@/app/lib/rankings";

const CODEFORCES_BASE_URL = "https://codeforces.com";

export async function fetchCodeforcesGroupHtmlStandings({
  contestId,
  groupCode,
}: {
  contestId: number;
  groupCode: string;
}) {
  const response = await fetch(
    `${CODEFORCES_BASE_URL}/group/${encodeURIComponent(
      groupCode,
    )}/contest/${contestId}/standings/groupmates/true`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Codeforces group standings request failed with HTTP ${response.status}.`,
    );
  }

  return codeforcesGroupHtmlToTourResults(await response.text());
}

export function codeforcesGroupHtmlToTourResults(html: string): TourResult[] {
  return extractHtmlRows(html).flatMap((rowHtml) => {
    const cells = extractTableCells(rowHtml);

    if (cells.length < 4) {
      return [];
    }

    const handle = extractHandle(cells[1]);
    const score = parseNumericCell(cells[2]);
    const penalty = parseNumericCell(cells[3]);

    if (!handle || score === null || penalty === null) {
      return [];
    }

    return [
      {
        handle,
        score,
        penalty,
        official: true,
      },
    ];
  });
}

function extractHtmlRows(html: string) {
  return Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi), (match) =>
    match[1],
  );
}

function extractTableCells(rowHtml: string) {
  return Array.from(
    rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi),
    (match) => match[1],
  );
}

function extractHandle(cellHtml: string) {
  const profileHrefMatch = cellHtml.match(/href=["']\/profile\/([^"']+)["']/i);

  if (profileHrefMatch) {
    return decodeURIComponent(profileHrefMatch[1]).trim();
  }

  const text = htmlToText(cellHtml)
    .replace(/\s+/g, " ")
    .replace(/\s+\*$/, "")
    .trim();

  return text.length > 0 ? text : null;
}

function parseNumericCell(cellHtml: string) {
  const text = htmlToText(cellHtml).replace(/\s+/g, "");

  if (!/^-?\d+(?:\.\d+)?$/.test(text)) {
    return null;
  }

  const value = Number(text);

  return Number.isFinite(value) ? value : null;
}

function htmlToText(html: string) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " "));
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_entity, codePoint: string) =>
      String.fromCodePoint(Number(codePoint)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
