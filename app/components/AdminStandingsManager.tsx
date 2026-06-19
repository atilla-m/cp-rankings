"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { RankingsView } from "@/app/components/RankingsView";
import { parseStandingsImport } from "@/app/lib/import-standings";
import {
  buildTourStandings,
  type TourDisqualification,
  type TourId,
  type TourResult,
} from "@/app/lib/rankings";
import type { StandingsSource } from "@/app/lib/standings-store";

type DraftStandings = {
  label: "Manual import" | "Codeforces";
  source: StandingsSource;
  tour1: TourResult[];
  tour2: TourResult[];
};

type ApiErrorResponse = {
  error: string;
};

type CodeforcesStandingsResponse =
  | {
      tour1: TourResult[];
      tour2: TourResult[];
    }
  | ApiErrorResponse;

type SaveSnapshotResponse =
  | {
      snapshot: {
        updatedAt: string;
      };
    }
  | ApiErrorResponse;

type DraftStatus = "empty" | "loading" | "valid" | "error" | "stale";

const textAreaPlaceholder = `handle,score,penalty
tourist,500,120
Benq,400,90`;
const defaultQualificationCutoff = 20;
const qualificationCutoffError =
  "Qualification cutoff must be a positive integer.";

export function AdminStandingsManager() {
  const [password, setPassword] = useState("");
  const [verified, setVerified] = useState(false);
  const [tour1Text, setTour1Text] = useState("");
  const [tour2Text, setTour2Text] = useState("");
  const [activeTourId, setActiveTourId] = useState<TourId>("tour-1");
  const [tour1CutoffText, setTour1CutoffText] = useState(
    String(defaultQualificationCutoff),
  );
  const [tour2CutoffText, setTour2CutoffText] = useState(
    String(defaultQualificationCutoff),
  );
  const [tour1DisqualifiedHandles, setTour1DisqualifiedHandles] = useState("");
  const [tour2DisqualifiedHandles, setTour2DisqualifiedHandles] = useState("");
  const [tour1DisqualificationReason, setTour1DisqualificationReason] =
    useState("");
  const [tour2DisqualificationReason, setTour2DisqualificationReason] =
    useState("");
  const [draftStandings, setDraftStandings] = useState<DraftStandings | null>(
    null,
  );
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("empty");
  const [statusMessage, setStatusMessage] = useState(
    "Enter the admin password to update standings.",
  );
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [loadingCodeforces, setLoadingCodeforces] = useState(false);
  const [savingTourId, setSavingTourId] = useState<TourId | null>(null);
  const [verifying, setVerifying] = useState(false);
  const activeCodeforcesRequestId = useRef(0);

  const tour1Cutoff = parseQualificationCutoff(tour1CutoffText);
  const tour2Cutoff = parseQualificationCutoff(tour2CutoffText);
  const tour1Disqualifications = parseDisqualifications(
    tour1DisqualifiedHandles,
    tour1DisqualificationReason,
  );
  const tour2Disqualifications = parseDisqualifications(
    tour2DisqualifiedHandles,
    tour2DisqualificationReason,
  );
  const activeCutoff =
    activeTourId === "tour-1"
      ? (tour1Cutoff ?? defaultQualificationCutoff)
      : (tour2Cutoff ?? defaultQualificationCutoff);
  const activeRows =
    activeTourId === "tour-1"
      ? (draftStandings?.tour1 ?? [])
      : (draftStandings?.tour2 ?? []);
  const activeDisqualifications =
    activeTourId === "tour-1" ? tour1Disqualifications : tour2Disqualifications;
  const activeRankings = buildTourStandings({
    rows: activeRows,
    qualificationCutoff: activeCutoff,
    disqualifications: activeDisqualifications,
  });
  const activeQualifiedCount = activeRankings.filter(
    (row) => row.qualified,
  ).length;
  const activeDisqualifiedCount = activeRankings.filter(
    (row) => row.disqualified,
  ).length;
  const activeCutoffErrorMessage =
    (activeTourId === "tour-1" ? tour1Cutoff : tour2Cutoff) === null
      ? qualificationCutoffError
      : null;
  const displayedErrorMessage =
    activeCutoffErrorMessage ?? loadErrorMessage ?? saveErrorMessage;

  async function verifyPassword() {
    setVerifying(true);
    setLoadErrorMessage(null);

    try {
      const response = await fetch("/api/admin/verify", {
        method: "POST",
        headers: adminHeaders(password),
      });
      const payload = (await response.json()) as { ok: true } | ApiErrorResponse;

      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload ? payload.error : "Unable to verify admin.",
        );
      }

      setVerified(true);
      setStatusMessage("Admin access verified.");
    } catch (error) {
      setVerified(false);
      setLoadErrorMessage(
        error instanceof Error ? error.message : "Unable to verify admin.",
      );
    } finally {
      setVerifying(false);
    }
  }

  function loadImportedStandings() {
    invalidateCodeforcesRequest();
    setDraftStandings(null);
    setDraftStatus("loading");
    setLoadErrorMessage(null);
    setSaveErrorMessage(null);

    try {
      const importedTour1 =
        tour1Text.trim().length > 0
          ? parseTourStandings("Tour 1", tour1Text)
          : [];
      const importedTour2 =
        tour2Text.trim().length > 0
          ? parseTourStandings("Tour 2", tour2Text)
          : [];

      if (importedTour1.length === 0 && importedTour2.length === 0) {
        throw new Error("Enter standings for Tour 1, Tour 2, or both.");
      }

      setDraftStandings({
        label: "Manual import",
        source: "manual",
        tour1: importedTour1,
        tour2: importedTour2,
      });
      setDraftStatus("valid");
      setLoadErrorMessage(null);
      setSaveErrorMessage(null);
      setStatusMessage("Manual standings loaded into preview.");
    } catch (error) {
      setDraftStatus("error");
      setLoadErrorMessage(
        error instanceof Error ? error.message : "Unable to parse standings.",
      );
    }
  }

  function updateImportedText(
    value: string,
    updateText: (nextValue: string) => void,
  ) {
    invalidateImportedDraft();
    updateText(value);
  }

  async function loadCodeforcesStandings() {
    const requestId = activeCodeforcesRequestId.current + 1;
    activeCodeforcesRequestId.current = requestId;

    setDraftStandings(null);
    setDraftStatus("loading");
    setLoadingCodeforces(true);
    setLoadErrorMessage(null);
    setSaveErrorMessage(null);

    try {
      const response = await fetch("/api/codeforces/standings", {
        cache: "no-store",
        headers: adminHeaders(password),
      });
      const payload = (await response.json()) as CodeforcesStandingsResponse;

      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload
            ? payload.error
            : "Unable to load Codeforces standings.",
        );
      }

      if (!isActiveCodeforcesRequest(requestId)) {
        return;
      }

      setDraftStandings({
        label: "Codeforces",
        source: "codeforces",
        tour1: payload.tour1,
        tour2: payload.tour2,
      });
      setDraftStatus("valid");
      setLoadErrorMessage(null);
      setSaveErrorMessage(null);
      setStatusMessage("Codeforces standings loaded into preview.");
    } catch (error) {
      if (!isActiveCodeforcesRequest(requestId)) {
        return;
      }

      setDraftStandings(null);
      setDraftStatus("error");
      setLoadErrorMessage(
        error instanceof Error
          ? `Codeforces: ${error.message}`
          : "Codeforces: Unable to load standings.",
      );
    } finally {
      if (isActiveCodeforcesRequest(requestId)) {
        setLoadingCodeforces(false);
      }
    }
  }

  function clearPreview() {
    invalidateCodeforcesRequest();
    setDraftStandings(null);
    setDraftStatus("empty");
    setLoadErrorMessage(null);
    setSaveErrorMessage(null);
    setStatusMessage("Preview cleared.");
  }

  function invalidateCodeforcesRequest() {
    activeCodeforcesRequestId.current += 1;
    setLoadingCodeforces(false);
  }

  function isActiveCodeforcesRequest(requestId: number) {
    return activeCodeforcesRequestId.current === requestId;
  }

  function invalidateImportedDraft() {
    invalidateCodeforcesRequest();
    setLoadErrorMessage(null);
    setSaveErrorMessage(null);

    if (draftStatus === "valid" || draftStandings !== null) {
      setDraftStandings(null);
      setDraftStatus("stale");
      setStatusMessage(
        "Inputs changed. Load imported standings again before saving.",
      );
    } else if (draftStatus === "error") {
      setDraftStatus("empty");
      setStatusMessage(
        "Inputs changed. Load imported standings again before saving.",
      );
    }
  }

  async function saveSnapshot(tourId: TourId) {
    const qualificationCutoff =
      tourId === "tour-1" ? tour1Cutoff : tour2Cutoff;
    const rows =
      tourId === "tour-1" ? draftStandings?.tour1 : draftStandings?.tour2;
    const disqualifications =
      tourId === "tour-1" ? tour1Disqualifications : tour2Disqualifications;

    if (qualificationCutoff === null) {
      setSaveErrorMessage(qualificationCutoffError);
      return;
    }

    if (draftStatus !== "valid" || !draftStandings || !rows) {
      setSaveErrorMessage("Load standings into preview before saving.");
      return;
    }

    setSavingTourId(tourId);
    setSaveErrorMessage(null);

    try {
      const response = await fetch("/api/admin/standings", {
        method: "POST",
        headers: {
          ...adminHeaders(password),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tourId,
          source: draftStandings.source,
          rows,
          qualificationCutoff,
          disqualifications,
        }),
      });
      const payload = (await response.json()) as SaveSnapshotResponse;

      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload
            ? payload.error
            : "Unable to save standings snapshot.",
        );
      }

      setStatusMessage(
        `Saved ${formatTourLabel(tourId)} standings at ${new Date(
          payload.snapshot.updatedAt,
        ).toLocaleString()}.`,
      );
    } catch (error) {
      setSaveErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save standings snapshot.",
      );
    } finally {
      setSavingTourId(null);
    }
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
      invalidateImportedDraft();
      updateText(await file.text());
      setLoadErrorMessage(null);
    } catch {
      invalidateImportedDraft();
      setLoadErrorMessage(`Unable to read ${file.name}.`);
    } finally {
      event.currentTarget.value = "";
    }
  }

  return (
    <RankingsView
      description="Load, preview, and publish each tour standings snapshot."
      disqualifiedStatValue={activeDisqualifiedCount}
      qualificationCutoff={activeCutoff}
      qualifiedStatLabel="Qualified"
      qualifiedStatValue={activeQualifiedCount}
      rankings={activeRankings}
      showSourceStat={draftStandings !== null}
      sourceLabel={draftStandings?.label}
      title={`Admin ${formatTourLabel(activeTourId)} preview`}
    >
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <h2 className="text-base font-semibold text-slate-950">
            Admin update flow
          </h2>
        </div>

        <div className="grid gap-4 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex w-full flex-col gap-1 sm:max-w-sm">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                Admin password
              </span>
              <input
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
                type="password"
                value={password}
                onChange={(event) => {
                  invalidateCodeforcesRequest();
                  setPassword(event.target.value);
                  setVerified(false);
                }}
              />
            </label>
            <button
              className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={verifying || password.trim().length === 0}
              type="button"
              onClick={verifyPassword}
            >
              {verifying ? "Verifying" : "Unlock admin"}
            </button>
          </div>

          {verified ? (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <StandingsInput
                  id="admin-tour1-standings"
                  label="Tour 1 standings"
                  value={tour1Text}
                  onChange={(value) => updateImportedText(value, setTour1Text)}
                  onFileChange={(event) => loadFile(event, setTour1Text)}
                />
                <StandingsInput
                  id="admin-tour2-standings"
                  label="Tour 2 standings"
                  value={tour2Text}
                  onChange={(value) => updateImportedText(value, setTour2Text)}
                  onFileChange={(event) => loadFile(event, setTour2Text)}
                />
              </div>

              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                Do not spam refresh. Codeforces API is rate-limited.
              </p>

              <div className="inline-flex h-10 w-full overflow-hidden rounded-md border border-slate-300 bg-white p-0.5 sm:w-fit">
                <button
                  className={tabButtonClass(activeTourId === "tour-1")}
                  type="button"
                  onClick={() => setActiveTourId("tour-1")}
                >
                  Tour 1
                </button>
                <button
                  className={tabButtonClass(activeTourId === "tour-2")}
                  type="button"
                  onClick={() => setActiveTourId("tour-2")}
                >
                  Tour 2
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <TourSettings
                  cutoffText={tour1CutoffText}
                  disqualifiedHandles={tour1DisqualifiedHandles}
                  disqualificationReason={tour1DisqualificationReason}
                  label="Tour 1 controls"
                  onCutoffChange={setTour1CutoffText}
                  onDisqualificationReasonChange={
                    setTour1DisqualificationReason
                  }
                  onDisqualifiedHandlesChange={setTour1DisqualifiedHandles}
                />
                <TourSettings
                  cutoffText={tour2CutoffText}
                  disqualifiedHandles={tour2DisqualifiedHandles}
                  disqualificationReason={tour2DisqualificationReason}
                  label="Tour 2 controls"
                  onCutoffChange={setTour2CutoffText}
                  onDisqualificationReasonChange={
                    setTour2DisqualificationReason
                  }
                  onDisqualifiedHandlesChange={setTour2DisqualifiedHandles}
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  className="h-10 rounded-md border border-sky-700 bg-sky-700 px-4 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:border-sky-300 disabled:bg-sky-300"
                  disabled={loadingCodeforces}
                  type="button"
                  onClick={loadCodeforcesStandings}
                >
                  {loadingCodeforces
                    ? "Loading Codeforces"
                    : "Load from Codeforces"}
                </button>
                <button
                  className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                  type="button"
                  onClick={loadImportedStandings}
                >
                  Load imported standings
                </button>
                <button
                  className="h-10 rounded-md border border-emerald-700 bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:border-emerald-300 disabled:bg-emerald-300"
                  disabled={!canSaveTour("tour-1")}
                  type="button"
                  onClick={() => saveSnapshot("tour-1")}
                >
                  {savingTourId === "tour-1" ? "Publishing" : "Publish Tour 1"}
                </button>
                <button
                  className="h-10 rounded-md border border-emerald-700 bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:border-emerald-300 disabled:bg-emerald-300"
                  disabled={!canSaveTour("tour-2")}
                  type="button"
                  onClick={() => saveSnapshot("tour-2")}
                >
                  {savingTourId === "tour-2" ? "Publishing" : "Publish Tour 2"}
                </button>
                <button
                  className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                  type="button"
                  onClick={clearPreview}
                >
                  Clear preview
                </button>
              </div>
            </>
          ) : null}
        </div>

        <div
          aria-live="polite"
          className={`border-t border-slate-200 p-4 text-sm ${
            displayedErrorMessage
              ? "font-medium text-red-700"
              : "text-slate-500"
          }`}
        >
          {displayedErrorMessage ?? statusMessage}
        </div>
      </section>
    </RankingsView>
  );

  function canSaveTour(tourId: TourId) {
    const cutoff = tourId === "tour-1" ? tour1Cutoff : tour2Cutoff;
    const rows =
      tourId === "tour-1" ? draftStandings?.tour1 : draftStandings?.tour2;

    return (
      draftStatus === "valid" &&
      draftStandings !== null &&
      cutoff !== null &&
      rows !== undefined &&
      rows.length > 0 &&
      !loadingCodeforces &&
      savingTourId === null
    );
  }
}

function adminHeaders(password: string) {
  return {
    "x-admin-password": password,
  };
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

function parseQualificationCutoff(value: string) {
  const trimmedValue = value.trim();

  if (!/^\d+$/.test(trimmedValue)) {
    return null;
  }

  const parsedValue = Number(trimmedValue);

  return Number.isSafeInteger(parsedValue) && parsedValue >= 1
    ? parsedValue
    : null;
}

function parseDisqualifications(
  handlesText: string,
  reasonText: string,
): TourDisqualification[] {
  const reason = reasonText.trim();

  return handlesText
    .split(/[\n,]+/)
    .map((handle) => handle.trim())
    .filter((handle) => handle.length > 0)
    .map((handle) => ({
      handle,
      ...(reason.length > 0 ? { reason } : {}),
    }));
}

function formatTourLabel(tourId: TourId) {
  return tourId === "tour-1" ? "Tour 1" : "Tour 2";
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

function TourSettings({
  cutoffText,
  disqualifiedHandles,
  disqualificationReason,
  label,
  onCutoffChange,
  onDisqualifiedHandlesChange,
  onDisqualificationReasonChange,
}: {
  cutoffText: string;
  disqualifiedHandles: string;
  disqualificationReason: string;
  label: string;
  onCutoffChange: (value: string) => void;
  onDisqualifiedHandlesChange: (value: string) => void;
  onDisqualificationReasonChange: (value: string) => void;
}) {
  return (
    <fieldset className="grid gap-3 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold text-slate-800">
        {label}
      </legend>

      <label className="flex w-full flex-col gap-1 sm:max-w-xs">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
          Qualification cutoff
        </span>
        <input
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
          inputMode="numeric"
          min={1}
          step={1}
          type="number"
          value={cutoffText}
          onChange={(event) => onCutoffChange(event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
          Disqualified handles
        </span>
        <textarea
          className="min-h-24 resize-y rounded-md border border-slate-300 bg-white p-3 font-mono text-sm leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
          placeholder="one handle per line"
          value={disqualifiedHandles}
          onChange={(event) => onDisqualifiedHandlesChange(event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
          Disqualification reason
        </span>
        <input
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
          type="text"
          value={disqualificationReason}
          onChange={(event) =>
            onDisqualificationReasonChange(event.target.value)
          }
        />
      </label>
    </fieldset>
  );
}

function tabButtonClass(active: boolean) {
  return [
    "flex-1 whitespace-nowrap rounded px-3 text-sm font-medium transition sm:flex-none",
    active
      ? "bg-slate-950 text-white shadow-sm"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
  ].join(" ");
}
