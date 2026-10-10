import type { Metadata } from "next";
import { cookies } from "next/headers";
import HomeLanding from "@/components/home/HomeLanding";
import { langModeFromCookies } from "@/lib/lang-mode-server";
import { uiLangFromLangMode } from "@/lib/lang-mode";
import { audienceMetadata } from "@/lib/ui/Audience";
import { Provenance } from "@/lib/ui/Provenance";
import { PLATFORM } from "@/content/platform";

export const metadata: Metadata = {
  title: PLATFORM.title,
  description: PLATFORM.description,
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
