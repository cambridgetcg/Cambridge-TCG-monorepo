import type { Metadata } from "next";
import { cookies } from "next/headers";
import HomeLanding from "@/components/home/HomeLanding";
import { langModeFromCookies } from "@/lib/lang-mode-server";
import { uiLangFromLangMode } from "@/lib/lang-mode";
import { audienceMetadata } from "@/lib/ui/Audience";
import { Provenance } from "@/lib/ui/Provenance";

export const metadata: Metadata = {
  title: "Cambridge TCG — there is more to a card",
  description: "Find a card, follow a story or take a seat at the play table. Explore cards, collections and the people and ideas around them.",
  other: audienceMetadata("consumer", ["home", "collector", "player"]),
};

export default async function Home() {
  const uiLang = uiLangFromLangMode(langModeFromCookies(await cookies()));
  return (
    <HomeLanding
      uiLang={uiLang}
      provenance={<Provenance kind="computed" by="registered game catalog" />}
    />
  );
}
