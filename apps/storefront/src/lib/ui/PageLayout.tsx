import type { ReactNode } from "react";

const WIDTH = {
  standard: "max-w-5xl",
  wide: "max-w-7xl",
  reading: "max-w-3xl",
} as const;

/** One content landmark and predictable spacing for public task pages.
 * Account pages already have a main landmark in their layout.
 */
export function PageLayout({
  children,
  width = "standard",
  className = "",
}: {
  children: ReactNode;
  width?: keyof typeof WIDTH;
  className?: string;
}) {
  return (
    <main className={`mx-auto w-full ${WIDTH[width]} px-4 py-8 sm:px-6 sm:py-10 lg:px-8 ${className}`.trim()}>
      {children}
    </main>
  );
}
