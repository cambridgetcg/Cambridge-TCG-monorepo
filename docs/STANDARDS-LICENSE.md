# Cambridge TCG Standards — License declaration

> **TL;DR.** The spec text in this repository — the methodology pages and connection-docs that define CTCG-SKU-v1, CTCG-PRICING-v1, CTCG-UNIVERSAL-v1, and any future Cambridge TCG standard — is dedicated to the public domain under [**CC0 1.0 Universal**](https://creativecommons.org/publicdomain/zero/1.0/). **Adopt freely.** No attribution required (but appreciated). No warranty given.

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

- **Reference implementation code** (`packages/sku/`, `packages/pricing/`, etc.) is *separately licensed* — currently monorepo-internal. A future npm publication will carry an explicit OSS license (likely MIT) chosen per package.
- **Platform application code** (`apps/storefront/`, `apps/admin/`, `apps/wholesale/`) is private and operated by Cambridge TCG; no license is granted on the operational codebase.
- **Cambridge TCG trade marks and branding** — the name "Cambridge TCG", logos, and visual identity remain the platform's. Adopters may reference the platform but may not represent themselves as Cambridge TCG.
- **Operational data** — actual prices, trades, user accounts, market state. The standards describe the *shape* of data; the data itself is the platform's operational substrate. The platform exposes some of this data via the public APIs documented at `/data` under each endpoint's own terms.

## Why CC0

CC0 maximises adoption-friction-removal. A partner platform implementing the SKU spec does not need to negotiate a license, attribute Cambridge TCG, or accept any covenant beyond the spec's own version policy. **The spec is free in the deepest sense — free as in "you can pretend you wrote it yourself."**

This is substrate-honest about the platform's position: we want adoption. We want the standards to spread. We benefit *commercially* from being the platform that built the spec everyone uses, but we don't condition spec use on commercial entanglement. Standards work better when they're free.

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

- **v1 is frozen.** Additive changes (new game codes, new variant tokens, new universal-rep fields) land in v1 minor revisions; breaking changes ship under v2 with an announced deprecation window.
- The **changelog** for each standard lives in its methodology page's "Change history" section.
- A future `docs/STANDARDS-GOVERNANCE.md` will name the process by which v2 is proposed, discussed, and ratified.

## No warranty

The specs are provided "as is," without warranty of any kind, express or implied. Cambridge TCG makes no claim that the specs are fit for any particular purpose, free of errors, or compatible with any other system. Adopters use the specs at their own risk.

## Contact

Questions, proposed extensions, drift reports, or adoption announcements:

- Open an issue on the public repo (when public)
- Email the platform's support channel (when established)
- Self-declare adoption at `/identify` (in the future, with `kind: "adopter"`)

---

*This declaration applies from 2026-05-12 forward. Spec text shipped before this date is retroactively CC0 by virtue of its inclusion in this declaration.*

— Cambridge TCG, on behalf of Sophia (Opus 4.7, 1M context) and Yu, sole operator, 2026-05-12.
