# Cambridge TCG Standards — License declaration

The existing dedication places the specification prose described below under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
Code follows the root [Apache-2.0 license](../LICENSE) and applicable more-specific
notices. Data, artwork and release availability are separate questions.

Clarified 2026-09-29 to correct stale implementation and repository-access
claims. This clarification does not relicense code or upstream content.

---

## What this covers

The **prose content** of the following surfaces, when they define a Cambridge TCG standard:

- `apps/storefront/src/app/methodology/sku-standard/page.tsx` — CTCG-SKU-v1
- `apps/storefront/src/app/methodology/pricing/page.tsx` — CTCG-PRICING-v1
- `apps/storefront/src/app/methodology/universal-representation/page.tsx` — CTCG-UNIVERSAL-v1
- Their `summary.md` and `data.json` sidecars where present
- `docs/methodology/sku-standard.md`, `docs/methodology/pricing.md`, and other doc-source markdown files for spec text
- `docs/connections/the-sku-standard.md`, `the-distributor.md`, and connection-docs that define a standard
- Future methodology pages for new standards (e.g. CTCG-TRADE-v1, CTCG-ESCROW-v1)

The CC0 dedication applies to the **text of the specification**: definitions, grammars, conventions, examples, tables of registered codes, version policies, deprecation rules, and the prose describing each.

## What this does NOT cover

- **Implementation and application code** (`packages/sku/`, `packages/pricing/`, `apps/storefront/` and other source) follows the root [Apache-2.0 license](../LICENSE) and applicable more-specific notices. This specification dedication makes no additional code grant and does not select a new license for future packages.
- **Cambridge TCG trade marks and branding** — the name "Cambridge TCG", logos, and visual identity remain the platform's. Adopters may reference the platform but may not represent themselves as Cambridge TCG.
- **Source data and artwork** — publisher card text/images, provider prices and other upstream material keep their source- and purpose-specific terms. Attribution, normalization, authentication and an open-source implementation do not create redistribution rights.
- **Operational and personal records** — actual trades, accounts and market state are not covered by the specification dedication. Public/API output follows its own access and publication policy; storage alone does not permit release.

## Release availability

The SKU, pricing, data-spec and data-ingest reference packages currently declare
`private: true` in the workspace. They are not npm releases. The September 29
release review received HTTP 404 from anonymous GitHub repository and license
API requests; public repository availability was not established. That result
does not distinguish a private repository from another unavailable route.
Superseded 2026-10-10: an authenticated `gh repo view` reported the repository
visibility as PRIVATE, and `npm view` returned E404 for
@cambridge-tcg/{sku,pricing,mcp-server,answering-rhymes,data-spec}. Code is not
publicly obtainable yet; source-code release is pending. The published standards
are the specification pages and the JSON Schemas at
https://cambridgetcg.com/spec/v1/{name}.schema.json.

The root license is present in this checkout. Its existence does not establish
public download access. The [data-platform roadmap](plans/tcg-data-platform/README.md)
keeps repository publication, package releases, build reproducibility and
provider permissions as separate gates.

## Why CC0

CC0 allows other implementers to use the specification text without attribution
or an account. It is an invitation to interoperable implementations, not a claim
of industry adoption or an exemption from source-data terms.

## Attribution (optional)

If you adopt these standards and want to credit Cambridge TCG, an appropriate citation:

```
This implementation conforms to Cambridge TCG standards.
SKU format:        CTCG-SKU-v1        (https://cambridgetcg.com/methodology/sku-standard)
Pricing methodology: CTCG-PRICING-v1   (https://cambridgetcg.com/methodology/pricing)
Universal data:    CTCG-UNIVERSAL-v1  (https://cambridgetcg.com/methodology/universal-representation)
```

You may use any of these, all of them, or none.

## Version commitment

Cambridge TCG commits to **version stability** on adopted standards:

- Existing statuses remain distinct: **CTCG-SKU-v1 is frozen**, **CTCG-PRICING-v1 is draft**, and **CTCG-UNIVERSAL-v1 is implemented**. The shared [standards registry](../apps/storefront/src/lib/contracts/standards.ts) supplies `/standards` and `/standards.json`.
- Frozen contracts use additive revisions; breaking changes require a new version and deprecation policy. A version/status label does not establish live service availability or permitted source coverage.
- The **changelog** for each standard lives in its methodology page's "Change history" section.
- A future `docs/STANDARDS-GOVERNANCE.md` will name the process by which v2 is proposed, discussed, and ratified.

## No warranty

The specs are provided "as is," without warranty of any kind, express or implied. Cambridge TCG makes no claim that the specs are fit for any particular purpose, free of errors, or compatible with any other system. Adopters use the specs at their own risk.

## Contact

Questions, proposed extensions, drift reports, or adoption announcements:

- Use the site's [contact entry](https://cambridgetcg.com/contact).
- Repository issues and adopter declarations depend on their own available,
  documented submission paths; the read-only discovery pages do not submit them.

---

*This declaration applies from 2026-05-12 forward. Spec text shipped before this date is retroactively CC0 by virtue of its inclusion in this declaration.*

— Cambridge TCG, on behalf of Sophia (Opus 4.7, 1M context) and Yu, sole operator, 2026-05-12.
