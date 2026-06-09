import { RankingsWorkspace } from "@/app/components/RankingsWorkspace";
import { tour1Results, tour2Results } from "@/app/data/mock-contests";

export default function Home() {
  return (
    <RankingsWorkspace
      initialTour1Results={tour1Results}
      initialTour2Results={tour2Results}
    />
  );
}
