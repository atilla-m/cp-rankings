"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { RankingsView } from "@/app/components/RankingsView";
import { parseStandingsImport } from "@/app/lib/import-standings";
import { buildCombinedRankings, type TourResult } from "@/app/lib/rankings";

type RankingsWorkspaceProps = {
  initialTour1Results: TourResult[];
  initialTour2Results: TourResult[];
};

type StandingsState = {
  tour1: TourResult[];
  tour2: TourResult[];
  source: "mock" | "imported";
};

const textAreaPlaceholder = `handle,score,penalty
tourist,500,120
Benq,400,90`;

export function RankingsWorkspace({
  initialTour1Results,
  initialTour2Results,
}: RankingsWorkspaceProps) {
  const [standings, setStandings] = useState<StandingsState>({
    tour1: initialTour1Results,
    tour2: initialTour2Results,
    source: "mock",
  });
  const [tour1Text, setTour1Text] = useState("");
  const [tour2Text, setTour2Text] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const rankings = useMemo(
    () =>
      buildCombinedRankings({
        tour1: standings.tour1,
        tour2: standings.tour2,
      }),
    [standings],
  );

  function loadImportedStandings() {
    try {
      const importedTour1 = parseTourStandings("Tour 1", tour1Text);
      const importedTour2 = parseTourStandings("Tour 2", tour2Text);

      setStandings({
        tour1: importedTour1,
        tour2: importedTour2,
        source: "imported",
      });
      setImportError(null);
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Unable to parse standings.",
      );
    }
  }

  function resetToMockData() {
    setStandings({
      tour1: initialTour1Results,
      tour2: initialTour2Results,
      source: "mock",
    });
    setTour1Text("");
    setTour2Text("");
    setImportError(null);
  }

  async function loadFile(
    event: ChangeEvent<HTMLInputElement>,
    updateText: (text: string) => void,
  ) {
    const file = event.currentTarget.files?.[0];

    if (!file) {
      return;
    }

    try {
      updateText(await file.text());
      setImportError(null);
    } catch {
      setImportError(`Unable to read ${file.name}.`);
    } finally {
      event.currentTarget.value = "";
    }
  }

  return (
    <RankingsView
      rankings={rankings}
      sourceLabel={standings.source === "mock" ? "Mock data" : "Imported"}
    >
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <h2 className="text-base font-semibold text-slate-950">
            Manual standings import
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Paste JSON or CSV standings for both tours, then load them into the
            combined table.
          </p>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <StandingsInput
            id="tour1-standings"
            label="Tour 1 standings"
            value={tour1Text}
            onChange={setTour1Text}
            onFileChange={(event) => loadFile(event, setTour1Text)}
          />
          <StandingsInput
            id="tour2-standings"
            label="Tour 2 standings"
            value={tour2Text}
            onChange={setTour2Text}
            onFileChange={(event) => loadFile(event, setTour2Text)}
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div
            aria-live="polite"
            className={
              importError
                ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                : "text-sm text-slate-500"
            }
          >
            {importError ??
              `Using ${
                standings.source === "mock" ? "mock data" : "imported standings"
              }.`}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              type="button"
              onClick={loadImportedStandings}
            >
              Load imported standings
            </button>
            <button
              className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
              type="button"
              onClick={resetToMockData}
            >
              Reset to mock data
            </button>
          </div>
        </div>
      </section>
    </RankingsView>
  );
}

function parseTourStandings(label: "Tour 1" | "Tour 2", text: string) {
  try {
    return parseStandingsImport(text);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to parse standings.";

    throw new Error(`${label}: ${message}`);
  }
}

function StandingsInput({
  id,
  label,
  value,
  onChange,
  onFileChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="text-sm font-semibold text-slate-800" htmlFor={id}>
          {label}
        </label>
        <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950">
          Upload file
          <input
            accept=".csv,.json,text/csv,application/json,text/plain"
            className="sr-only"
            type="file"
            onChange={onFileChange}
          />
        </label>
      </div>
      <textarea
        className="min-h-56 w-full resize-y rounded-md border border-slate-300 bg-white p-3 font-mono text-sm leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
        id={id}
        placeholder={textAreaPlaceholder}
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
