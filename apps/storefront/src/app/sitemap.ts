import type { MetadataRoute } from "next";
import { publicSitemap } from "@/lib/public-discovery";

// Static metadata route: no database, upstream, request clock or account state.
// /prism-signals/beta is login-gated and noindex; the public PRISM page is its
// sitemap door. Private/account routes and the deliberately unlisted /nuke stay out.
export default function sitemap(): MetadataRoute.Sitemap {
  return publicSitemap();
}
