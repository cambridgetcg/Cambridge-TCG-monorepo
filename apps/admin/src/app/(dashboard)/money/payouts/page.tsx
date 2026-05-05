import { ComingSoon } from "@/components/layout/ComingSoon";
export const metadata = { title: "Payouts" };
export default function Page() {
  return (
    <ComingSoon
      title="Payouts"
      description="Outstanding holds, release controls, payout history, and export."
      missionId="kingdom-023"
      operatingFromUrl="https://cambridgetcg.com/admin/payouts"
    />
  );
}
