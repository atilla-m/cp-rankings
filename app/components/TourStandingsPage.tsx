import Link from "next/link";
import { RankingsView } from "@/app/components/RankingsView";
import { getPublishedTourStandingsResponse } from "@/app/lib/standings-store";
import type { TourId } from "@/app/lib/rankings";

type TourStandingsPageProps = {
  description: string;
  title: string;
  tourId: TourId;
};

export async function TourStandingsPage({
  description,
  title,
  tourId,
}: TourStandingsPageProps) {
  const standings = await getPublishedTourStandingsResponse(tourId);

  if (standings.status === "empty") {
    return <UnpublishedStandings message={standings.message} title={title} />;
  }

  return (
    <RankingsView
      description={description}
      qualificationCutoff={standings.snapshot.qualificationCutoff}
      rankings={standings.snapshot.rankedRows}
      showSourceStat
      sourceLabel={formatSourceLabel(standings.snapshot.source)}
      title={title}
    >
      <Link className="text-sm font-semibold text-sky-700" href="/">
        Back to rankings home
      </Link>
    </RankingsView>
  );
}

function UnpublishedStandings({
  message,
  title,
}: {
  message: string;
  title: string;
}) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="border-b border-slate-200 pb-5">
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
            {title}
          </h1>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm font-medium text-slate-600 shadow-sm">
          {message}
        </section>

        <Link className="text-sm font-semibold text-sky-700" href="/">
          Back to rankings home
        </Link>
      </div>
    </main>
  );
}

function formatSourceLabel(source: string) {
  if (source === "codeforces") {
    return "Codeforces";
  }

  if (source === "legacy") {
    return "Legacy";
  }

  return "Manual";
}
