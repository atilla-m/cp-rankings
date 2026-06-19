import Link from "next/link";

const links = [
  {
    href: "/tour-1",
    title: "Tour 1 standings",
    description: "Published Tour 1 ranking and qualification status.",
  },
  {
    href: "/tour-2",
    title: "Tour 2 standings",
    description: "Published Tour 2 ranking and qualification status.",
  },
  {
    href: "/final",
    title: "Final leaderboard",
    description: "Placeholder for the upcoming live final leaderboard.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="border-b border-slate-200 pb-5">
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
            CP rankings
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Contest standings and qualification results by tour.
          </p>
        </header>

        <nav className="grid gap-3 sm:grid-cols-3" aria-label="Standings">
          {links.map((link) => (
            <Link
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
              href={link.href}
              key={link.href}
            >
              <span className="block text-base font-semibold text-slate-950">
                {link.title}
              </span>
              <span className="mt-2 block text-sm leading-6 text-slate-600">
                {link.description}
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
