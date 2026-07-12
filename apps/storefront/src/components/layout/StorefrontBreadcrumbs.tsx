"use client";

import { usePathname } from "next/navigation";
import { Breadcrumbs } from "./Breadcrumbs";

/**
 * Root-layout breadcrumb slot for public routes that do not already own
 * local wayfinding. Registry ownership keeps account, admin, play, and
 * page-rendered trails from appearing twice.
 */
export function StorefrontBreadcrumbs() {
  const pathname = usePathname();

  return (
    <Breadcrumbs
      pathname={pathname}
      renderedBy="global"
      className="mx-auto max-w-7xl px-4 pt-4"
    />
  );
}
