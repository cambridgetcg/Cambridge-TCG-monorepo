# Cardmarket prices: on our pages, not in our API or downloads

**Status:** in force from 2026-11-24. An agent's careful reading, made on
2026-11-24 under the owner's go-ahead for that day's recommendations. The
reading and the wording are the agent's, not the owner's. The owner changes it
by saying so ([how](#to-restore)).

## What changed

Cardmarket's raw rows left the member API (`/api/v1/member-prices`) and the
member downloads (`/api/account/prices/export`). Both still check the key or
the session first, then answer 503 with the date and the reason, never an
empty success. Signed-in members see Cardmarket prices on `/prices` as before,
with Cardmarket named, in every view they had. Collection and derived data are
unchanged.

The switch is one entry, `MEMBER_PRICE_POLICIES.cardmarket` in
`packages/data-ingest/src/member-prices.ts`. `uses` holds what is open;
`paused` holds what is stopped, since when and why. The reader, `/prices`,
`/account/data`, `/methodology/member-pricing`, `/api/v1/sources` and the card
evidence all read it there.

## Why

- Cardmarket's [General Terms](https://help.cardmarket.com/en/general-terms-and-conditions)
  dated 2026-11-26 ask, in the English text's section on API use, for prior
  written agreement before cards and their prices are presented on external
  websites. An agent read the English text on 2026-11-24. The German text
  binds and has not been read. Whether that section reaches the public daily
  files is not known.
- Our API and downloads rested on a 2024 announcement that the files may be
  used “however you see fit” (`member-prices/2026-09-07.1`).
- The scope recorded on [2026-10-28](2026-10-28-tcg-data-permissions-and-paid-data-api.md)
  is that raw provider prices appear on our pages with the source named and
  are not exported. It left Cardmarket's older, wider grant as it was. Cardmarket
  now follows the same line as CardRush and TCGplayer.
- The owner holds an email that agents have not seen. It may allow more.

## What stays as it was

- Display to signed-in members, history and 500-row pages included. The limits
  on CardRush and TCGplayer views do not apply to Cardmarket.
- The daily collector, its User-Agent and its evidence version. Stored rows
  match on that version, so it must not change.
- Derived data. Cardmarket is still an input, and still never counts toward a
  reference's two sources: its values went out through our API and downloads
  until this date, and anyone can download its own daily files.
- The database release row. `member_api` and `member_download` stay set. The
  code refuses first, and the derivation reads those flags as values that went
  out.
- Files members downloaded before this date. Cambridge cannot recall them.

## To restore

One line from the owner, for example that the email covers the API and
downloads. Then revert the commit that added this file; or move the two uses
back in `MEMBER_PRICE_POLICIES.cardmarket`, set `paused` to `null`, change the
tests that pin the pause, and add a dated line here.

## If showing them is not covered either

That is not this switch. The writer and the collector's release check both
need `member-display` (`validateMemberPriceWrite`, `writeMemberPriceBatch`,
`ingestMemberPriceSource`), so taking it out of `uses`, or clearing
`member_display` in the database, also stops collection, and Cardmarket's
derived rows stop within a week. Display would need its own change that keeps
those three checks.
