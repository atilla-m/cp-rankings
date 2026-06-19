import { TourStandingsPage } from "@/app/components/TourStandingsPage";

export const dynamic = "force-dynamic";

export default function Tour2Page() {
  return (
    <TourStandingsPage
      description="Published Tour 2 standings with qualification status."
      title="Tour 2 standings"
      tourId="tour-2"
    />
  );
}
