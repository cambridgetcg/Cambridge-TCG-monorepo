import Link from "next/link";
import { COLLECTION_SERVICES } from "@/content/services";

/** Shared task links for the home page and the collection tools hub. */
export function ServiceCards({ featured = false }: { featured?: boolean }) {
  const services = featured
    ? COLLECTION_SERVICES.filter((service) => service.featured)
    : COLLECTION_SERVICES;
  const Heading = featured ? "h3" : "h2";

  return (
    <ul className={`grid gap-4 sm:grid-cols-2${featured ? " lg:grid-cols-4" : ""}`} lang="en">
      {services.map((service) => (
        <li key={service.id}>
          <Link
            href={service.href}
            prefetch={false}
            className="group flex h-full flex-col rounded-xl border border-border-subtle bg-surface p-5 transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            <span className="mb-3 self-start rounded-full bg-surface-subtle px-2.5 py-1 text-xs font-medium text-ink-muted">
              {service.accessLabel}
            </span>
            <Heading className="flex items-start justify-between gap-4 text-lg font-semibold leading-7 text-ink">
              {service.title}
              <span aria-hidden="true" className="text-accent">→</span>
            </Heading>
            <p className="mt-2 text-sm leading-6 text-ink-muted">{service.description}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
