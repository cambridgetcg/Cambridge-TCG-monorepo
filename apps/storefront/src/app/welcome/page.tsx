import { redirect } from "next/navigation";

/** Preserve old audience links without asking every visitor to choose a role. */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string | string[] }>;
}) {
  const { as } = await searchParams;
  switch (as) {
    case "agent": redirect("/agents");
    case "player": redirect("/play");
    case "collector": redirect("/account/portfolio");
    // New paid commerce is retired; existing records remain in the account.
    case "trader": redirect("/account/trades");
    default: redirect("/");
  }
}
