import Link from "next/link";

export default function FinalPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="border-b border-slate-200 pb-5">
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
            Final leaderboard
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            The live final leaderboard will be added later.
          </p>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm font-medium text-slate-600 shadow-sm">
          Final standings are not published yet.
        </section>

        <Link className="text-sm font-semibold text-sky-700" href="/">
          Back to rankings home
        </Link>
      </div>
    </main>
  );
}
