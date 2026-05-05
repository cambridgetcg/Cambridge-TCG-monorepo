import { ComingSoon } from "@/components/layout/ComingSoon";
export const metadata = { title: "Email Queue" };
export default function Page() {
  return (
    <ComingSoon
      title="Email Queue"
      description="Dead-letter monitoring, retry, dismiss, and template preview."
      missionId="kingdom-020"
      operatingFromUrl="https://cambridgetcg.com/admin/email"
    />
  );
}
