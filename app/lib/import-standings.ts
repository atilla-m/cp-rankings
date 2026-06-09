import type { TourResult } from "@/app/lib/rankings";

type RawStandingRow = {
  handle?: unknown;
  official?: unknown;
  score?: unknown;
  penalty?: unknown;
};

export function parseStandingsImport(text: string): TourResult[] {
  const input = text.trim();

  if (input.length === 0) {
    throw new Error("Standings input is empty.");
  }

  if (input.startsWith("[")) {
    return parseJsonStandings(input);
  }

  return parseCsvStandings(input);
}

function parseJsonStandings(input: string): TourResult[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch (error) {
    throw new Error(
      `Invalid JSON: ${error instanceof Error ? error.message : "parse failed"}.`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("JSON standings must be an array of rows.");
  }

  return parsed.map((row, index) => validateStandingRow(row, index + 1));
}

function parseCsvStandings(input: string): TourResult[] {
  const rows = parseCsvRows(input).filter((row) =>
    row.some((cell) => cell.trim().length > 0),
  );

  if (rows.length === 0) {
    throw new Error("Standings input is empty.");
  }

  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const handleIndex = header.indexOf("handle");
  const scoreIndex = header.indexOf("score");
  const penaltyIndex = header.indexOf("penalty");
  const officialIndex = header.indexOf("official");

  if (handleIndex === -1 || scoreIndex === -1 || penaltyIndex === -1) {
    throw new Error("CSV header must include handle, score, and penalty columns.");
  }

  if (rows.length === 1) {
    throw new Error("CSV standings must include at least one data row.");
  }

  return rows.slice(1).map((row, index) =>
    validateStandingRow(
      {
        handle: row[handleIndex],
        score: row[scoreIndex],
        penalty: row[penaltyIndex],
        official: officialIndex === -1 ? undefined : row[officialIndex],
      },
      index + 2,
    ),
  );
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += character;
      }

      continue;
    }

    if (character === '"') {
      if (cell.trim().length !== 0) {
        throw new Error("CSV contains an unexpected quote.");
      }

      cell = "";
      inQuotes = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (character === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";

      if (input[index + 1] === "\n") {
        index += 1;
      }
    } else {
      cell += character;
    }
  }

  if (inQuotes) {
    throw new Error("CSV has an unterminated quoted field.");
  }

  row.push(cell);
  rows.push(row);

  return rows;
}

function validateStandingRow(row: unknown, rowNumber: number): TourResult {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`Row ${rowNumber}: row must be an object.`);
  }

  const rawRow = row as RawStandingRow;
  const handle =
    typeof rawRow.handle === "string" ? rawRow.handle.trim() : "";

  if (handle.length === 0) {
    throw new Error(`Row ${rowNumber}: handle must be a non-empty string.`);
  }

  return {
    handle,
    score: parseNonNegativeFiniteNumber(rawRow.score, rowNumber, "score"),
    penalty: parseNonNegativeFiniteNumber(rawRow.penalty, rowNumber, "penalty"),
    official: parseOfficial(rawRow.official, rowNumber),
  };
}

function parseOfficial(value: unknown, rowNumber: number) {
  if (value === undefined) {
    return true;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    throw new Error(
      `Row ${rowNumber}: official must be true/false, yes/no, or 1/0.`,
    );
  }

  const normalizedValue = value.trim().toLowerCase();

  if (["true", "yes", "1"].includes(normalizedValue)) {
    return true;
  }

  if (["false", "no", "0"].includes(normalizedValue)) {
    return false;
  }

  throw new Error(
    `Row ${rowNumber}: official must be true/false, yes/no, or 1/0.`,
  );
}

function parseNonNegativeFiniteNumber(
  value: unknown,
  rowNumber: number,
  field: "score" | "penalty",
) {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value.trim())
        : Number.NaN;

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new Error(
      `Row ${rowNumber}: ${field} must be a finite non-negative number.`,
    );
  }

  return numericValue;
}
