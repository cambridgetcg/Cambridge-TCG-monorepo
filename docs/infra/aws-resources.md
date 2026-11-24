# AWS resources — honest registry

*What each thing actually is, its source, and its intention. Kept in sync with
the AWS resource **tags** (Project / Purpose / Source / Intention), which are the
machine-readable form of this doc — query them with `aws rds list-tags-for-resource`
/ `aws s3api get-bucket-tagging`.*

Account `034362054546`, region `us-east-1`.

## Databases (RDS Postgres)

| Instance (AWS name) | Honest name | What it is | Source |
|---|---|---|---|
| `cambridgetcg-storefront` | *(same)* | The P2P collectors' market: users, orders, auctions, portfolios, and the `card_set_cards` catalogue mirror. | first-party (platform) |
| `tcg-wholesale` | **`cambridgetcg-catalogue`** | **Misnamed.** The card **catalogue + prices**. We do **not** do wholesale — the wholesale *app* is retired; this DB is the live catalogue, read directly by the storefront. | ingested catalogue (cardrush + bandai-en official) + computed prices |

The legacy AWS name `tcg-wholesale` is kept to avoid endpoint churn (an RDS
rename changes the connection endpoint and breaks every connection string). The
honest name lives in the `HonestName` tag + this doc. Rename physically only as a
planned migration.

## Image stores (S3)

| Bucket | What it is | Status |
|---|---|---|
| `ctcg-card-images` | **Official publisher card images**, self-hosted + attributed (rights-cleared). Served publicly with the copyright line. Source: publisher official card databases (Bandai OP/DBF). | live |
| `cambridgetcg-auction-images` | User-uploaded auction + verification photos (presigned uploads). | live |
| `jp-op-photos`, `jp-db-photos`, `jp-bs-photos`, `jp-pk-photos`, `jp-pkmn-photos`, `jp-vg-photos` | **Cardrush hi-res card scans.** Checked 2026-11-24: the site still shows scans from `jp-op-photos`, `jp-pk-photos` and `jp-db-photos` as the catalogue-photo fallback, labelled "CardRush listing photo" (`CATALOG_HOSTS` in `apps/storefront/src/lib/cards/image-publication.ts`; `/market`, `/mekiki`), so do not decommission those three. The other three were not checked. Note `jp-pk-photos` + `jp-pkmn-photos` are a Pokémon duplicate. | partly in use |

## Principle

Name things as they are; state the source and the intention. Where a rename is
costly (RDS endpoints, un-renamable S3 buckets), the honest label rides on a tag
and here, not on a risky physical rename.
