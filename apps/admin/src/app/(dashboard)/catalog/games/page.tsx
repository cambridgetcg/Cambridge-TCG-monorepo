import { ComingSoon } from "@/components/layout/ComingSoon";
export const metadata = { title: "Games & Sets" };
export default function Page() {
  return (
    <ComingSoon
      title="Games & Sets"
      description="Create and manage games, sets, and their active status."
      missionId="kingdom-026"
      operatingFromUrl="https://wholesale.cambridgetcg.com/admin/games"
    />
  );
}
