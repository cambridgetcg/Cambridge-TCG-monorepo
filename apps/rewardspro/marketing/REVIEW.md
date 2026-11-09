# Reviewing a RewardsPro pack

Before the owner sees a review pack (design §5: what would go out, exactly), a session other than the one that made it
reads it once with these questions. They come with their reasons, because a reviewer who knows why can judge the
cases a list doesn't cover. They add to the gates G1–G6 in the business-ecosystem marketing design; they don't
replace them, and nothing here runs automatically.

## 1. What do we actually have?

Start the pack with a short inventory, before any wording:

- **Real:** the verified rows in `claims.toml` this pack uses, by id.
- **Pictures:** which captures, from which development store, on which date.
- **Absent:** what we don't have and won't imitate: reviews, merchant logos, usage numbers, testimonials, speed
  figures.

Why: a page fills whatever space it has. Listing what's absent first stops a reviewer, or an agent, from filling
the gap with something that looks like proof.

## 2. Is every sentence still true?

- Each factual sentence maps to a verified, unexpired row (G1).
- Nothing from DESIGN.md's "Outdated: don't say" list appears. Search for each phrase. Don't trust a read-through:
  old wording slips past the eye because it once looked right.

## 3. Does it read as written for a person or to look busy?

Look for the marks of a page made to look full rather than to inform:

- eyebrow chips and kickers above headings, pulsing dots;
- gradient text, glows and halos on dark, cards nested in cards;
- buzzwords and em-dash chains;
- low contrast, lines longer than about 75 characters, headings that skip a level.

Why: each one pushes the fact the reader came for further down. The names follow the slop catalogue in
pbakaus/impeccable (`CREDITS.md`).

## 4. Does it hold up at the edges?

- At 360 px wide: no sideways scroll, and the button and the first fact both fit on screen.
- In text: alt text that says what matters, captions on video, and the focus ring visible.
- Under the CSP: no outside font, script or image. The site loads its own files only.

Why: merchants read on phones between tasks, and a pack that only looks right on a desktop isn't finished.

## 5. Whose words is it in?

R1 voice: plain, specific, British English, with no KINGDOM language and nothing about the owner personally. If
Shopify is named, it says only what the app works with.

## Recording the review

Write the findings into the pack itself: what was checked, what was changed, and anything left for the owner. Agent
advice is never recorded as the owner's approval (`approvals.jsonl` holds only the owner's own words).
