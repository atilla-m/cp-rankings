"use client";

import { useMemo, useState } from "react";
import type { RankedParticipant } from "@/app/lib/rankings";

type RankingsViewProps = {
  children?: React.ReactNode;
  description?: string;
  qualificationCutoff?: number;
  qualifiedStatLabel?: string;
  qualifiedStatValue?: number | string;
  rankings: RankedParticipant[];
  showSourceStat?: boolean;
  sourceLabel?: string;
  title?: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

export function RankingsView({
  children,
  description = "Tour 1 and Tour 2 official standings for live round qualification.",
  qualificationCutoff = 20,
  qualifiedStatLabel = "Qualified",
  qualifiedStatValue,
  rankings,
  showSourceStat = false,
  sourceLabel,
  title = "Combined rankings",
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
            className={`grid grid-cols-2 gap-2 text-sm sm:min-w-96 ${
              showSourceStat ? "sm:grid-cols-4" : "sm:grid-cols-3"
            }`}
          >
            <Stat label="Official" value={rankings.length} />
            <Stat
              label={qualifiedStatLabel}
              value={qualifiedStatValue ?? qualifiedCount}
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
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-[0.08em] text-slate-600">
                <tr>
                  <TableHead>Rank</TableHead>
                  <TableHead>Handle</TableHead>
                  <TableHead numeric>Tour 1 score</TableHead>
                  <TableHead numeric>Tour 1 penalty</TableHead>
                  <TableHead numeric>Tour 2 score</TableHead>
                  <TableHead numeric>Tour 2 penalty</TableHead>
                  <TableHead numeric>Total score</TableHead>
                  <TableHead numeric>Total penalty</TableHead>
                  <TableHead>Status</TableHead>
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
                      {formatNumber(participant.tour1Score)}
                    </TableCell>
                    <TableCell numeric>
                      {formatNumber(participant.tour1Penalty)}
                    </TableCell>
                    <TableCell numeric>
                      {formatNumber(participant.tour2Score)}
                    </TableCell>
                    <TableCell numeric>
                      {formatNumber(participant.tour2Penalty)}
                    </TableCell>
                    <TableCell numeric strong>
                      {formatNumber(participant.totalScore)}
                    </TableCell>
                    <TableCell numeric>
                      {formatNumber(participant.totalPenalty)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          participant.qualified
                            ? "inline-flex rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"
                            : "inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200"
                        }
                      >
                        {participant.status}
                      </span>
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
