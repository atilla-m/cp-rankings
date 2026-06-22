"use client";

import { useMemo, useState } from "react";
import {
  buildFinalLeaderboard,
  demoFinalAcceptedSubmissions,
  demoFinalParticipants,
  getDefaultFinalLeaderboardConfig,
  validateFinalLeaderboardConfigInput,
  type FinalDecreaseType,
  type FinalLeaderboardConfig,
} from "@/app/lib/final-leaderboard";

type ApiErrorResponse = {
  error: string;
};

type FinalConfigResponse =
  | {
      config: FinalLeaderboardConfig & {
        updatedAt?: string;
      };
      snapshot?: {
        updatedAt: string;
      };
    }
  | ApiErrorResponse;

type DraftProblem = {
  id: string;
  name: string;
  initialScore: string;
  decreaseType: FinalDecreaseType;
  decreaseValue: string;
  minScore: string;
};

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export function AdminFinalConfigManager() {
  const defaultConfig = getDefaultFinalLeaderboardConfig();
  const [password, setPassword] = useState("");
  const [verified, setVerified] = useState(false);
  const [contestStartTime, setContestStartTime] = useState(
    defaultConfig.contestStartTime ?? "",
  );
  const [problems, setProblems] = useState<DraftProblem[]>(
    defaultConfig.problems.map(toDraftProblem),
  );
  const [statusMessage, setStatusMessage] = useState(
    "Enter the admin password to edit final configuration.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const parsedConfig = useMemo(() => {
    try {
      return {
        config: parseDraftConfig(contestStartTime, problems),
        error: null,
      };
    } catch (error) {
      return {
        config: null,
        error:
          error instanceof Error
            ? error.message
            : "Final configuration is invalid.",
      };
    }
  }, [contestStartTime, problems]);
  const previewRows = parsedConfig.config
    ? buildFinalLeaderboard(
        parsedConfig.config,
        demoFinalParticipants,
        demoFinalAcceptedSubmissions,
      )
    : [];
  const displayedErrorMessage = errorMessage ?? parsedConfig.error;

  async function verifyPassword() {
    setLoading(true);
    setErrorMessage(null);

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
      await loadFinalConfig();
      setStatusMessage("Final admin access verified.");
    } catch (error) {
      setVerified(false);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to verify admin.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadFinalConfig() {
    const response = await fetch("/api/admin/final-config", {
      cache: "no-store",
      headers: adminHeaders(password),
    });
    const payload = (await response.json()) as FinalConfigResponse;

    if (!response.ok || "error" in payload) {
      throw new Error(
        "error" in payload ? payload.error : "Unable to load final config.",
      );
    }

    applyConfig(payload.config);
  }

  async function saveFinalConfig() {
    if (!parsedConfig.config) {
      setErrorMessage(parsedConfig.error);
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/admin/final-config", {
        method: "POST",
        headers: {
          ...adminHeaders(password),
          "content-type": "application/json",
        },
        body: JSON.stringify(parsedConfig.config),
      });
      const payload = (await response.json()) as FinalConfigResponse;

      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload ? payload.error : "Unable to save final config.",
        );
      }

      applyConfig(payload.config);
      const savedAt = payload.snapshot?.updatedAt ?? payload.config.updatedAt;

      setStatusMessage(
        savedAt
          ? `Final config saved. Demo snapshot updated at ${new Date(
              savedAt,
            ).toLocaleString()}.`
          : "Final config saved. Demo snapshot updated.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save final config.",
      );
    } finally {
      setSaving(false);
    }
  }

  function applyConfig(config: FinalLeaderboardConfig) {
    setContestStartTime(config.contestStartTime ?? "");
    setProblems(config.problems.map(toDraftProblem));
  }

  function updateProblem(
    index: number,
    field: keyof DraftProblem,
    value: string,
  ) {
    setProblems((currentProblems) =>
      currentProblems.map((problem, problemIndex) =>
        problemIndex === index ? { ...problem, [field]: value } : problem,
      ),
    );
  }

  function addProblem() {
    const nextIndex = problems.length;
    const nextId = String.fromCharCode("A".charCodeAt(0) + nextIndex);

    setProblems((currentProblems) => [
      ...currentProblems,
      {
        id: nextId,
        name: `Problem ${nextId}`,
        initialScore: "500",
        decreaseType: "fixed",
        decreaseValue: "50",
        minScore: "100",
      },
    ]);
  }

  function removeProblem(index: number) {
    setProblems((currentProblems) =>
      currentProblems.filter((_, problemIndex) => problemIndex !== index),
    );
  }

  return (
    <main className="bg-slate-50 px-4 pb-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <h2 className="text-base font-semibold text-slate-950">
              Final configuration
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
                    setPassword(event.target.value);
                    setVerified(false);
                  }}
                />
              </label>
              <button
                className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={loading || password.trim().length === 0}
                type="button"
                onClick={verifyPassword}
              >
                {loading ? "Verifying" : "Unlock final admin"}
              </button>
            </div>

            {verified ? (
              <>
                <label className="flex w-full flex-col gap-1 sm:max-w-sm">
                  <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    Contest start time
                  </span>
                  <input
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
                    placeholder="2026-06-21T10:00:00.000Z"
                    type="text"
                    value={contestStartTime}
                    onChange={(event) => setContestStartTime(event.target.value)}
                  />
                </label>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                    <thead className="bg-slate-100 text-xs uppercase tracking-[0.08em] text-slate-600">
                      <tr>
                        <TableHead>ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead numeric>Initial</TableHead>
                        <TableHead>Decrease</TableHead>
                        <TableHead numeric>Value</TableHead>
                        <TableHead numeric>Minimum</TableHead>
                        <TableHead>Action</TableHead>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {problems.map((problem, index) => (
                        <tr key={index}>
                          <TableCell>
                            <TextInput
                              ariaLabel={`Problem ${index + 1} id`}
                              value={problem.id}
                              onChange={(value) =>
                                updateProblem(index, "id", value)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <TextInput
                              ariaLabel={`Problem ${index + 1} name`}
                              value={problem.name}
                              onChange={(value) =>
                                updateProblem(index, "name", value)
                              }
                            />
                          </TableCell>
                          <TableCell numeric>
                            <NumberInput
                              ariaLabel={`Problem ${index + 1} initial score`}
                              value={problem.initialScore}
                              onChange={(value) =>
                                updateProblem(index, "initialScore", value)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <select
                              aria-label={`Problem ${index + 1} decrease type`}
                              className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-950 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
                              value={problem.decreaseType}
                              onChange={(event) =>
                                updateProblem(
                                  index,
                                  "decreaseType",
                                  event.target.value,
                                )
                              }
                            >
                              <option value="fixed">fixed</option>
                              <option value="percentage">percentage</option>
                            </select>
                          </TableCell>
                          <TableCell numeric>
                            <NumberInput
                              ariaLabel={`Problem ${index + 1} decrease value`}
                              value={problem.decreaseValue}
                              onChange={(value) =>
                                updateProblem(index, "decreaseValue", value)
                              }
                            />
                          </TableCell>
                          <TableCell numeric>
                            <NumberInput
                              ariaLabel={`Problem ${index + 1} minimum score`}
                              value={problem.minScore}
                              onChange={(value) =>
                                updateProblem(index, "minScore", value)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <button
                              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                              disabled={problems.length <= 1}
                              type="button"
                              onClick={() => removeProblem(index)}
                            >
                              Remove
                            </button>
                          </TableCell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                    type="button"
                    onClick={addProblem}
                  >
                    Add problem
                  </button>
                  <button
                    className="h-10 rounded-md border border-emerald-700 bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:border-emerald-300 disabled:bg-emerald-300"
                    disabled={saving || parsedConfig.config === null}
                    type="button"
                    onClick={saveFinalConfig}
                  >
                    {saving ? "Saving final config" : "Save final config"}
                  </button>
                </div>

                <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-950">
                      Mock leaderboard preview
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                      <thead className="bg-slate-100 text-xs uppercase tracking-[0.08em] text-slate-600">
                        <tr>
                          <TableHead>Rank</TableHead>
                          <TableHead>Handle</TableHead>
                          <TableHead numeric>Total</TableHead>
                          <TableHead numeric>Penalty</TableHead>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewRows.map((row) => (
                          <tr key={row.handle}>
                            <TableCell strong>#{row.rank}</TableCell>
                            <TableCell>{row.handle}</TableCell>
                            <TableCell numeric>
                              {formatNumber(row.totalScore)}
                            </TableCell>
                            <TableCell numeric>
                              {formatNumber(row.totalPenalty)}
                            </TableCell>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
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
      </div>
    </main>
  );
}

function parseDraftConfig(
  contestStartTime: string,
  problems: DraftProblem[],
) {
  return validateFinalLeaderboardConfigInput({
    contestStartTime,
    problems: problems.map((problem) => ({
      ...problem,
      initialScore: problem.initialScore,
      decreaseValue: problem.decreaseValue,
      minScore: problem.minScore,
    })),
  });
}

function toDraftProblem(
  problem: FinalLeaderboardConfig["problems"][number],
): DraftProblem {
  return {
    id: problem.id,
    name: problem.name,
    initialScore: String(problem.initialScore),
    decreaseType: problem.decreaseType,
    decreaseValue: String(problem.decreaseValue),
    minScore: String(problem.minScore),
  };
}

function adminHeaders(password: string) {
  return {
    "x-admin-password": password,
  };
}

function TextInput({
  ariaLabel,
  value,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      aria-label={ariaLabel}
      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-950 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function NumberInput({
  ariaLabel,
  value,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      aria-label={ariaLabel}
      className="h-9 w-28 rounded-md border border-slate-300 bg-white px-2 text-right text-sm tabular-nums text-slate-950 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
      inputMode="decimal"
      min={0}
      step="any"
      type="number"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function TableHead({
  children,
  numeric = false,
}: {
  children: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <th
      className={`whitespace-nowrap px-4 py-3 font-semibold ${
        numeric ? "text-right" : "text-left"
      }`}
      scope="col"
    >
      {children}
    </th>
  );
}

function TableCell({
  children,
  numeric = false,
  strong = false,
}: {
  children: React.ReactNode;
  numeric?: boolean;
  strong?: boolean;
}) {
  return (
    <td
      className={`whitespace-nowrap px-4 py-3 ${
        numeric ? "text-right tabular-nums" : "text-left"
      } ${strong ? "font-semibold text-slate-950" : "text-slate-700"}`}
    >
      {children}
    </td>
  );
}

function formatNumber(value: number) {
  return numberFormatter.format(value);
}
