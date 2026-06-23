import Link from "next/link";
import {
  getFinalLeaderboardResponse,
  type FinalLeaderboardSnapshot,
} from "@/app/lib/final-leaderboard-store";

export const dynamic = "force-dynamic";

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export default async function FinalPage() {
  const response = await getFinalLeaderboardResponse();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
              Final leaderboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Latest published final-tour leaderboard snapshot.
            </p>
          </div>

          {response.status === "published" ? (
            <dl className="grid grid-cols-2 gap-2 text-sm sm:min-w-[24rem] sm:grid-cols-3">
              <Stat label="Participants" value={response.snapshot.rows.length} />
              <Stat
                label="Problems"
                value={response.snapshot.config.problems.length}
              />
              <Stat
                label="Source"
                value={formatSourceLabel(response.snapshot.source)}
              />
            </dl>
          ) : null}
        </header>

        {response.status === "empty" ? (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            {response.message}
          </section>
        ) : (
          <FinalLeaderboardTable snapshot={response.snapshot} />
        )}

        <Link className="text-sm font-semibold text-sky-700" href="/">
          Back to rankings home
        </Link>
      </div>
    </main>
  );
}

function FinalLeaderboardTable({
  snapshot,
}: {
  snapshot: FinalLeaderboardSnapshot;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase tracking-[0.08em] text-slate-600">
            <tr>
              <TableHead>Rank</TableHead>
              <TableHead>Handle</TableHead>
              {snapshot.config.problems.map((problem) => (
                <TableHead numeric key={problem.id}>
                  {problem.id}
                </TableHead>
              ))}
              <TableHead numeric>Total</TableHead>
              <TableHead numeric>Penalty</TableHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {snapshot.rows.map((row) => (
              <tr className="bg-white transition hover:bg-slate-50" key={row.handle}>
                <TableCell strong>#{row.rank}</TableCell>
                <TableCell>
                  <span className="font-medium text-slate-950">
                    {row.handle}
                  </span>
                </TableCell>
                {snapshot.config.problems.map((problem) => {
                  const result = row.problemResults[problem.id];

                  return (
                    <TableCell numeric key={problem.id}>
                      {result ? (
                        <span title={`Solve order ${result.solveOrder}`}>
                          {formatNumber(result.score)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell numeric strong>
                  {formatNumber(row.totalScore)}
                </TableCell>
                <TableCell numeric>{formatNumber(row.totalPenalty)}</TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatSourceLabel(source: FinalLeaderboardSnapshot["source"]) {
  if (source === "manual") {
    return "Manual";
  }

  if (source === "live") {
    return "Live";
  }

  return "Demo";
}
