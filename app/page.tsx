import { RankingsView } from "@/app/components/RankingsView";
import { getPublishedStandingsResponse } from "@/app/lib/standings-store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const standings = await getPublishedStandingsResponse();

  if (standings.status === "empty") {
    return <UnpublishedStandings />;
  }

  return (
    <RankingsView
      qualificationCutoff={standings.snapshot.qualificationCutoff}
      rankings={standings.snapshot.combinedRankings}
    />
  );
}

function UnpublishedStandings() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="border-b border-slate-200 pb-5">
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
            Combined rankings
          </h1>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm font-medium text-slate-600 shadow-sm">
          Standings have not been published yet.
        </section>
      </div>
    </main>
  );
}
