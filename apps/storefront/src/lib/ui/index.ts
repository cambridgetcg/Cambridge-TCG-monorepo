/**
 * Barrel export for storefront UI primitives.
 *
 * Import: import { Badge, DataTable, EmptyState } from "@/lib/ui";
 *
 * The library mirrors the shape of apps/admin/src/lib/ui — same naming,
 * same Tone vocabulary, same primitive boundaries — so a builder moving
 * between consumer and admin surfaces meets the same vocabulary.
 */

export { Badge, type Tone } from "./Badge";
export { Button, LinkButton } from "./Button";
export { Card } from "./Card";
export { DataTable, type Column, type Align } from "./DataTable";
export { EmptyState } from "./EmptyState";
export { ErrorAlert } from "./ErrorAlert";
export { FilterPills, type FilterPill } from "./FilterPills";
export { Field, Input, Select, Textarea } from "./Input";
export { Skeleton, ListSkeleton, DetailSkeleton } from "./LoadingSkeleton";
export { PageHeader } from "./PageHeader";
export { Pagination } from "./Pagination";
export { Tabs, LinkedTabs, type Tab } from "./Tabs";
export { Provenance, type ProvenanceKind } from "./Provenance";
export { Actor, type ActorKind } from "./Actor";
export { Audience, audienceMetadata, type AudienceKind } from "./Audience";
export { SearchForm } from "./SearchForm";
export { UserChip } from "./UserChip";
export { UserMention, type MentionableUser } from "./UserMention";
export { Verifiability } from "./Verifiability";
export { Discretion, type DiscretionReason } from "./Discretion";
export { Withholding } from "./Withholding";
export { WhyLink } from "./WhyLink";
export { Consequences, type Consequence, type ConsequenceTone } from "./Consequences";
export { Memorial } from "./Memorial";
export { TrustTier } from "./TrustTier";
export { TrustTierAware } from "./TrustTierAware";
export { WelcomeAll, WELCOME_STATEMENT, WELCOME_STATEMENT_COMPACT } from "./WelcomeAll";
export { MathLang } from "./MathLang";
export { MoneyDisplay } from "./MoneyDisplay";
export { DateDisplay } from "./DateDisplay";
export {
  TypeSignature,
  type ArtifactType,
  type DoctrineParticipation,
  type TypeSignatureProps,
} from "./TypeSignature";

export * as Palettes from "./status-palettes";
