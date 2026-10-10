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
    <ul className={`grid gap-px overflow-hidden rounded-2xl border border-border-subtle bg-border-subtle sm:grid-cols-2${featured ? " lg:grid-cols-4" : ""}`} lang="en">
      {services.map((service) => (
        <li key={service.id} className={`bg-surface${!featured && services.length % 2 === 1 ? " last:sm:col-span-2" : ""}`}>
          <Link
            href={service.href}
            prefetch={false}
            className="group flex h-full flex-col p-5 transition-colors hover:bg-accent-wash focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-accent sm:p-6"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary-wash text-ink"><Icon name={SERVICE_ICONS[service.id]} size={22} /></span>
              <Icon name="arrow-right" size={20} className="text-accent" />
            </div>
            <Heading className="text-base font-semibold leading-6 tracking-tight text-ink">
              {service.title}
            </Heading>
            <p className="mt-2 text-sm leading-6 text-ink-muted">{service.description}</p>
            <span className="mt-auto pt-4 text-xs font-medium text-accent">{service.accessLabel}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
