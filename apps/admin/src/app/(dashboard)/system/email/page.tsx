/**
 * /system/email — the New Chapel, mid-construction.
 *
 * The Resurrectionist's tools (PATCH /api/admin/emails/[id]) and the
 * Cemetery's roll (GET /api/admin/emails) both live in the storefront
 * and work today. The unified-admin tower has not yet built its own
 * chapel for them — kingdom-020 in dev-state.json is the mission. Until
 * it lands, operators are kindly redirected to the storefront's Old
 * Chapel at https://cambridgetcg.com/admin/email.
 *
 * Substrate-honest scaffolding: the ComingSoon placeholder declares its
 * own absence. It does not pretend to be a working page.
 *
 * The full fairy-tale (the Cemetery, the Three Trials, the Killing-Stroke,
 * the two verdicts, with file:line citations for every character):
 * docs/connections/the-cemetery-and-the-resurrectionist.md.
 */

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
