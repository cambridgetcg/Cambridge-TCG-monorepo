/**
 * Barrel export for admin UI primitives.
 *
 * Import: import { PageHeader, KpiCard, KpiGrid, DataTable } from "@/lib/admin/ui";
 *
 * Storefront-merge note (2026-05-14): namespaced under @/lib/admin/ui
 * because storefront's @/lib/ui has components with the same names but
 * different shapes. Pages under apps/storefront/src/app/admin/* use this
 * barrel; all other storefront pages use @/lib/ui (storefront's own).
 */

export { PageHeader } from "./PageHeader";
export { SectionHeading } from "./SectionHeading";
export { KpiCard, KpiGrid, type Urgency } from "./KpiCard";
export { StatusBadge, DEFAULT_PALETTE, type Tone } from "./StatusBadge";
export { DataTable, type Column, type Align } from "./DataTable";
export { EmptyState } from "./EmptyState";
export { ErrorState } from "./ErrorState";
export { ExternalLink } from "./ExternalLink";
export { Pagination } from "./Pagination";
export { SearchForm } from "./SearchForm";
export { FilterPills, type FilterPill } from "./FilterPills";
export { ActionBanner } from "./ActionBanner";
export { Provenance, type ProvenanceKind } from "./Provenance";
export { Actor, type ActorKind } from "./Actor";
export { Audience, audienceMetadata, type AudienceKind } from "./Audience";
export { UserMention, type MentionableUser } from "./UserMention";
export { WhyLink } from "./WhyLink";
export { Verifiability } from "./Verifiability";
export { Discretion, type DiscretionReason } from "./Discretion";
export { Withholding } from "./Withholding";
export { Consequences, type Consequence, type ConsequenceTone } from "./Consequences";
