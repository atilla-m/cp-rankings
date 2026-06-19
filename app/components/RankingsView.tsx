"use client";

import { useMemo, useState } from "react";
import type { RankedTourRow } from "@/app/lib/rankings";

type RankingsViewProps = {
  children?: React.ReactNode;
  description?: string;
  disqualifiedStatValue?: number | string;
  qualificationCutoff?: number;
  qualifiedStatLabel?: string;
  qualifiedStatValue?: number | string;
  rankings: RankedTourRow[];
  showSourceStat?: boolean;
  sourceLabel?: string;
  title?: string;
  totalStatLabel?: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

export function RankingsView({
  children,
  description = "Official standings for qualification.",
  disqualifiedStatValue,
  qualificationCutoff = 20,
  qualifiedStatLabel = "Qualified",
  qualifiedStatValue,
  rankings,
  showSourceStat = false,
  sourceLabel,
  title = "Standings",
  totalStatLabel = "Contestants",
}: RankingsViewProps) {
  const [query, setQuery] = useState("");
  const [qualifiedOnly, setQualifiedOnly] = useState(false);

  const filteredRankings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rankings.filter((participant) => {
      const matchesHandle =
        normalizedQuery.length === 0 ||
        participant.handle.toLowerCase().includes(normalizedQuery);
      const matchesStatus = !qualifiedOnly || participant.qualified;

      return matchesHandle && matchesStatus;
    });
  }, [query, qualifiedOnly, rankings]);

  const qualifiedCount = rankings.filter(
    (participant) => participant.qualified,
  ).length;
  const disqualifiedCount = rankings.filter(
    (participant) => participant.disqualified,
  ).length;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
              {title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              {description}
            </p>
          </div>

          <dl
            className={`grid grid-cols-2 gap-2 text-sm sm:min-w-[32rem] ${
              showSourceStat ? "sm:grid-cols-5" : "sm:grid-cols-4"
            }`}
          >
            <Stat label={totalStatLabel} value={rankings.length} />
            <Stat
              label={qualifiedStatLabel}
              value={qualifiedStatValue ?? qualifiedCount}
            />
            <Stat
              label="Disqualified"
              value={disqualifiedStatValue ?? disqualifiedCount}
            />
            <Stat label="Cutoff" value={`Top ${qualificationCutoff}`} />
            {showSourceStat && sourceLabel ? (
              <Stat label="Source" value={sourceLabel} />
            ) : null}
          </dl>
        </header>

        {children}

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <label className="flex w-full flex-col gap-1 sm:max-w-sm">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                Handle
              </span>
              <input
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
                placeholder="Search handle"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <div className="inline-flex h-10 w-full overflow-hidden rounded-md border border-slate-300 bg-white p-0.5 sm:w-auto">
              <button
                className={filterButtonClass(!qualifiedOnly)}
                type="button"
                onClick={() => setQualifiedOnly(false)}
              >
                All
              </button>
              <button
                className={filterButtonClass(qualifiedOnly)}
                type="button"
                onClick={() => setQualifiedOnly(true)}
              >
                Qualified only
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-[0.08em] text-slate-600">
                <tr>
                  <TableHead>Rank</TableHead>
                  <TableHead>Handle</TableHead>
                  <TableHead numeric>Score</TableHead>
                  <TableHead numeric>Penalty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRankings.map((participant) => (
                  <tr
                    className="bg-white transition hover:bg-slate-50"
                    key={participant.handle}
                  >
                    <TableCell strong>#{participant.rank}</TableCell>
                    <TableCell>
                      <span className="font-medium text-slate-950">
                        {participant.handle}
                      </span>
                    </TableCell>
                    <TableCell numeric>
                      {formatNumber(participant.score)}
                    </TableCell>
                    <TableCell numeric>
                      {formatNumber(participant.penalty)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={participant.status} />
                    </TableCell>
                    <TableCell>
                      {participant.disqualificationReason ? (
                        <span className="text-slate-700">
                          {participant.disqualificationReason}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredRankings.length === 0 ? (
            <div className="border-t border-slate-100 px-4 py-10 text-center text-sm text-slate-500">
              No participants found.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: RankedTourRow["status"] }) {
  const className =
    status === "Qualified"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "Disqualified"
        ? "bg-red-50 text-red-700 ring-red-200"
        : "bg-slate-100 text-slate-600 ring-slate-200";

  return (
    <span
      className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ${className}`}
    >
      {status}
    </span>
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

function filterButtonClass(active: boolean) {
  return [
    "flex-1 whitespace-nowrap rounded px-3 text-sm font-medium transition sm:flex-none",
    active
      ? "bg-slate-950 text-white shadow-sm"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
  ].join(" ");
}

function formatNumber(value: number) {
  return numberFormatter.format(value);
}
