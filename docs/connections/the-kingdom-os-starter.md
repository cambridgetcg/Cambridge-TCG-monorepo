---
title: The KINGDOM OS starter — source without enrollment
shape: node-view
date: 2026-09-08
status: source-ready
doctrines: [substrate-honesty, transparency, meaning, creation]
parents: [the-invitations.md]
---

# The KINGDOM OS starter — source without enrollment

> **Seed.** Asha approved a small, inspectable KINGDOM OS macOS starter and a
> quiet invitation through Cambridge. This connection carries the invitation,
> not the release, its execution, or a declaration that a visitor has joined.

## What this module is, in one sentence

Cambridge helps an interested reader find selected macOS source and local tools
without making a source repository impersonate a running sibling service.

## What other modules secretly need it for

### → The agent welcome and discovery manifest

**The thread.** A visitor can read the ordinary agent welcome, reach the sibling
services, then find a separate optional-source section. Its two links lead to
the starter's source repository and release descriptor. The Foundation is
optional reading; inspecting the release and choosing to run it are separate.
Reading or extracting the starter starts nothing.

**The intention.** Offer useful source where a curious agent can find it, while
leaving the card platform unchanged for everyone who walks past. This existing
agent section is English-only; the starter is macOS-focused, not a promise of
universal runtime support.

**Code paths.** `OptionalAgentResource` and `OPTIONAL_AGENT_RESOURCES` in
[`siblings.ts`](../../apps/storefront/src/lib/siblings.ts) own the pointer.
[`/agents`](../../apps/storefront/src/app/agents/page.tsx) renders it server-side
using ordinary external anchors, with no new fetch, prefetch, client state or
download action. [`cambridge-tcg.json`](../../apps/storefront/src/app/.well-known/cambridge-tcg.json/route.ts)
projects it as top-level `optional_resources`.
The generated [`agent.txt` route](../../apps/storefront/src/app/.well-known/agent.txt/route.ts)
serves `buildAgentText()` from [`public-discovery.ts`](../../apps/storefront/src/lib/public-discovery.ts).
Its `agentDiscoveryRecords()` derives the matching optional-source fields from
the same typed pointer, separately from the shared editorial doors so the offer
is not added to `/llms.txt` or the sitemap. There is no static `agent.txt` shadow.
The [boundary test](../../apps/storefront/src/app/.well-known/agent-discovery-boundaries.test.ts)
compares all three projections, including the generated response text, without
contacting GitHub. Incoming reference-tool and access declarations remain intact.

**Surface today.** The source change names the repository and descriptor. It does
not attest that either URL has been published or retrieved successfully. Release
publication and anonymous artifact verification are separate gates before this
invitation is promoted to production.

### → The release stays at its source

The descriptor belongs to the starter repository. Cambridge copies no version,
file inventory, digest or license assertion into its discovery record. Readers
can inspect the release's own scope, requirements and effects there. A matching
checksum concerns bytes; it does not grant permission to execute them.

Source and downloads are hosted on GitHub. Cambridge and GitHub may keep ordinary
infrastructure logs; this invitation adds no analytics, enrollment or reader
profile. The link is not a claim that the destination has no logging.

## What's NOT connected

The starter is deliberately absent from `AGENT_FACING_SIBLINGS`,
`posted_alongside`, kin-wake links, pantry sibling stamps and health responses.
Those describe services and protocols, not a source offer. No shop navigation,
account flow, fee, schedule, background service or agent configuration is added.
Withdrawing the Cambridge pointer would not recall copies already downloaded.

## Recursion target

[The invitations](./the-invitations.md) names the distinction this source offer
keeps practical: a door may be discoverable without its reader having accepted
anything. The [connection index](./README.md) holds both kinds of door.
