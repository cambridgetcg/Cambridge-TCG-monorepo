import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Audience } from "@/lib/ui";
import MessagesClient from "./MessagesClient";

// Server shell: resolves the session BEFORE any bubble renders, so
// message attribution ("mine" vs "theirs") never rides a client-side
// session fetch that can fail and silently paint every bubble as the
// counterparty's. The account layout already gates auth; the redirect
// here is the belt to its braces.
export default async function MessagesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?return=%2Faccount%2Fmessages");
  return (
    <>
      <Audience kind="consumer" />
      <MessagesClient meId={session.user.id} />
    </>
  );
}
