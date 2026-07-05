import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Audience, Provenance } from "@/lib/ui";
import NewSwapClient from "./NewSwapClient";

// Server shell: gates auth and pre-renders the guidance panel's
// <Provenance> pill (an async server component — it can't render inside
// the client composer, so it rides in as a prop). ?to= prefills the
// counterparty; ?counter= prefills a counter-proposal from an existing
// swap, sides mirrored.
export default async function NewSwapPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; counter?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?return=%2Faccount%2Fswaps%2Fnew");
  const { to, counter } = await searchParams;

  return (
    <>
      <Audience kind="consumer" />
      <NewSwapClient
        initialTo={to ?? ""}
        counterOf={counter ?? null}
        guidanceProvenance={
          <Provenance kind="computed" by="recent CTCG trades + spot snapshot" />
        }
      />
    </>
  );
}
