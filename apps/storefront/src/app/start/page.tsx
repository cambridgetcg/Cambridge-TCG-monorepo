import { permanentRedirect } from "next/navigation";

/** Keep old entry links working; the homepage is the single human landing. */
export default function StartPage() {
  permanentRedirect("/");
}
