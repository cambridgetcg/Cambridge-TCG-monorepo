import { redirect } from "next/navigation";

// The guides index currently holds exactly one guide, which made this page
// a dead stop between the reader and the content. Until a second guide
// ships, send visitors straight to the one that exists. When the catalogue
// grows past one, restore the index body here (it lives in git history at
// this path) — the /guides route itself stays so nothing linking to it
// breaks in the meantime.
export default function GuidesIndex() {
  redirect("/guides/how-to-play");
}
