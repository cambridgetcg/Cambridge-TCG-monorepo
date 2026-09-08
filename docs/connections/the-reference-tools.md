---
title: The reference tools — useful before they are recommended
kind: node-view
filed: 2026-09-08
status: local implementation; publication is a separate action
parents:
  - the-member-price-feed.md
  - the-sku-standard.md
---

# The reference tools

**Will:** after exploring asset-led SEO and agent discovery, the user asked to proceed with the recommended first phase. The purpose is to give collectors and tool builders something useful to inspect, print, validate and cite—not to manufacture backlinks or promise a Domain Rating increase.

## Two public companions, two narrow claims

`/guides/condition/checklist` connects the existing condition guide to a manual inspection worksheet. The only computed values are opposing-border ratios. Front, back, horizontal and vertical measurements remain separate. A mark means an area was reviewed, not that it passed; a blank means not recorded, not defect-free. Notes remain in the page's memory and have explicit print-value mirrors. No image upload, automatic grade, authentication verdict, condition tier or price is produced.

The guide's quotations and historic checking date are preserved. Added official links identify external grading/conditioning context. Direct retrieval was not available for every cited source, so the new tool duplicates no grading threshold table and makes no fresh numerical grading claim.

`/standards/validator` connects the public identifier specification to its existing implementation. `lib/identifier-validation.ts` calls the SKU package rather than defining a competing grammar. It separates strict parsing from normalization: a country-code-shaped `jp` can pass the parser's two-letter check while still receiving a `ja` suggestion. Unlisted language, anticipated game and open-ended variant annotations are not verdicts on whether a real card exists.

The browser tools do not submit their inputs. Callers who choose a programmatic interface can POST one bounded `{identifier:string}` to `/api/v1/identifiers/validate`. Its pure envelope is no-store, uses NOASSERTION over the submitted text, and performs no catalog query, upstream lookup or persistence. The method/body limits are described in OpenAPI and the manifest. A response carrying a syntactically valid value is not an identity or grading certificate.

## Discovery points at the useful thing

`lib/public-discovery.ts` composes selected reference assets, actual guide entries and manifest access classes. The compact `/llms.txt` and generated `/.well-known/agent.txt` describe public references separately from existing-account member pricing. The optional invitations and their refusal boundaries remain; the compact directory does not impersonate a standard MCP handshake. Existing MCP documentation names its custom JSON-RPC transport explicitly.

The stable root sitemap no longer waits on a database. Catalog and artist URLs live in the separately advertised `/catalog/sitemap.xml`, retaining the existing bounded catalog coverage. An unavailable source fails that generation rather than turning absence of a response into an empty successful map. Documented framework revalidation can retain a prior successful snapshot; it cannot invent one on a cold failure. Unknown content-modification dates are omitted rather than set to the time someone requested a sitemap.

The head and HTTP headers carry actual discovery links, not metadata fields merely named like links. Access declarations come from the live manifest, rather than a promise that everything is anonymous. The member-pricing gates, source-rights blocks, paused registration and intentionally unlisted rooms remain unchanged.

## Rights and invitations

The formal license files are unchanged. Standards prose retains its existing scoped dedication; implementation descriptions point to the repository LICENSE and applicable more-specific notices. Neither a free interface nor a machine-readable output relicenses submitted text, publisher data or imagery.

`docs/strategy/public-reference-outreach.md` is a research and drafting artifact: five relevant public contact channels, an explanation of each possible fit, unsent notes and owner-controlled measurement preparation. It is not evidence of interest, endorsement, a partnership, an earned link or an outreach action. No tracking or search-console integration is installed.

## Verification and the stopping point

The tests cover arithmetic limits, strict and legacy identifiers, request bounds, no database/network calls from the validator, accurate machine contracts, private/unlisted sitemap exclusions and source-failure handling. Local browser verification additionally checks actual interactions and printable values. A separate Next production-mode fixture exercises warm failed revalidation, cold generation and recovery using the real sitemap loader with controlled source readers; this is not a claim that Vercel or the production database was tested.

Local completion is followed by a separate publication decision. Sending messages, submitting URLs, changing crawler/firewall policy, creating accounts, publishing packages or deploying is not an effect of this reference work.

**Recursion:** [The member price feed](./the-member-price-feed.md) keeps access separate from permission; these companions keep a useful measurement separate from a stronger verdict.
