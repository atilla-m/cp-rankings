import { TourStandingsPage } from "@/app/components/TourStandingsPage";

export const dynamic = "force-dynamic";

export default function Tour1Page() {
  return (
    <TourStandingsPage
      description="Published Tour 1 standings with qualification status."
      title="Tour 1 standings"
      tourId="tour-1"
    />
  );
}
