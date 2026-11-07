import Link from "next/link";
import { COLLECTION_SERVICES } from "@/content/services";
import { Icon, type IconName } from "@/lib/ui/Icon";

const SERVICE_ICONS: Record<typeof COLLECTION_SERVICES[number]["id"], IconName> = {
  prices: "search", collection: "book", condition: "eye", downloads: "tape", history: "pulse",
};

/** Shared task links for the home page and the collection tools hub. */
export function ServiceCards({ featured = false }: { featured?: boolean }) {
  const services = featured
    ? COLLECTION_SERVICES.filter((service) => service.featured)
    : COLLECTION_SERVICES;
  const Heading = featured ? "h3" : "h2";

  return (
    <ul className={`grid gap-px border-y border-border-subtle bg-border-subtle sm:grid-cols-2${featured ? " lg:grid-cols-4" : ""}`} lang="en">
      {services.map((service) => (
        <li key={service.id} className={`bg-page${!featured && services.length % 2 === 1 ? " last:sm:col-span-2" : ""}`}>
          <Link
            href={service.href}
            prefetch={false}
            className="group relative flex h-full flex-col p-5 transition-colors hover:bg-surface-subtle focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-accent sm:p-6"
          >
            <Icon name={SERVICE_ICONS[service.id]} size={22} className="text-accent" />
            <Heading className="mt-4 font-display text-xl font-medium leading-7 tracking-tight text-ink">
              {service.title}
            </Heading>
            <p className="mt-2 text-sm leading-6 text-ink-muted">{service.description}</p>
            <span className="mt-auto flex items-center justify-between gap-3 pt-5 text-xs">
              <span className="rounded-full border border-border-subtle px-2.5 py-0.5 font-medium text-ink-muted">{service.accessLabel}</span>
              <Icon name="arrow-right" size={18} className="shrink-0 text-ink-muted group-hover:text-ink" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
