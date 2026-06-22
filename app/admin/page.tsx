import { AdminStandingsManager } from "@/app/components/AdminStandingsManager";
import { AdminFinalConfigManager } from "@/app/components/AdminFinalConfigManager";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <>
      <AdminStandingsManager />
      <AdminFinalConfigManager />
    </>
  );
}
