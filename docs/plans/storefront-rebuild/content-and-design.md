# Content and design direction

[Plan entry](README.md) · Proposed editorial and visual direction; no new UI is
implemented by this document.

## The Artbitrage reference, precisely

Two useful versions were inspected in the neighbouring Artbitrage repository:

| Reference | What it contributes |
|---|---|
| Cached `origin/main` at `1faae8357` (2026-09-28); homepage last changed at `543bd9643` (September 8) | Intent-based entrances, paired human/machine reading, deeper object research and sources beside claims |
| Dirty local work based on `1b4d9b266`, with September 27 public-site work | A shared introduction, one room directory, explicit writing registers and three reasoned trails |

Both maps contain 46 entries, including four external destinations, but they
contain different rooms. The remote includes Depths, Pigments and Trade; the
local draft includes the retained Museum and new Map. Neither map is an exhaustive
inventory of all source pages. The local work is not established as deployed or
as a complete successor to the remote version.

Reference files: Artbitrage `docs/PUBLIC-SITE.md`, `map.json`, `index.html`,
`museum.html`, `rhymes.html`, `tools/build_public_site.py`; remote
`data/depths.json` and `depths.html`. Artbitrage files were inspected, not changed.

The transferable sequence is **encounter → observation → context → connection**.
The museum distinguishes what is seen, history and a thread to follow. Deeper
readings distinguish a response to the work, the maker, the world, materials and
the work's later life. Cambridge can use that structure in a smaller, more
practical form.

## A fresh editorial brief

Working headline: **There is more to a card.**

Opening copy:

> A card can be a game piece, a picture, a memory, or the beginning of a
> collection. Find the card in front of you, learn how it works, or follow a
> story into the people and ideas around it.

That is draft Cambridge copy, not an Artbitrage quotation. Keep the opening
short enough that search and the first useful destination remain visible.

Three entrances:

| Entrance | Plain explanation | Action |
|---|---|---|
| Meet a card | Find its identity, compare printings and learn what the record can tell you. | Find a card |
| Follow a story | Look at the illustration, the maker, the material or a collecting tradition. | Read a story |
| Take a seat | Learn a turn, prepare a deck or try a game in your browser. | Start practice |

Collection stays prominent in navigation and card pages. Its signed-out
introduction explains what is possible without offering unavailable registration.

## A small vocabulary of page types

| Page type | Content order | Interaction |
|---|---|---|
| Front door | Invitation, one object/story, search, entrances, trails | Choose a direction |
| Room entrance | Room purpose, useful starting point, contents, connected rooms | Browse or begin one task |
| Directory/results | Question/filter, results with context, source state, next/refine | Search, filter, compare |
| Card reference | Identity, print/variant information, available observations, rules, context, evidence | Compare; save when authorised |
| Guided reading/story | An encounter, observation, context, interpretation, sources, next thread | Read at your own pace |
| Task workspace | Current task/state, controls, result, consequences, recovery | Edit a collection/deck or complete an existing obligation |
| Play surface | Setup, board, turn/state, help and local/server persistence | Play with the existing engine |
| Contract/reference | Purpose, example, exact contract, access/effects, errors, related resource | Inspect a schema or make an authorised call |
| Operator workspace | Status, queues/records, filters, inspectable action and audit result | Restricted operations |

Rooms compose these page types. We do not need a different component library
for each room or a bespoke layout for every historical page.

## A card is three different things

1. **The card identity:** the game's named/rules-bearing entity.
2. **The printing or variant:** the particular edition, language and treatment.
3. **Someone's copy:** its owner-controlled notes, quantity, condition and history.

The design must keep these distinctions legible. Exact database relationships
need confirmation before inventing new identifiers or merging records. A curated
reading may discuss an illustration without asserting which physical printing a
visitor owns.

For an initial guided reading, select a real record after its source fields are
reviewed. `OP01-001` is a search example already used by the site, not evidence
that every desired fact or image is available.

Suggested content anatomy:

- **The card in front of you:** name, code, game, language/printing and a permitted
  image or an honest text-only record.
- **What to notice:** a short observation about an actual visible feature.
- **How it works:** a small explanation tied to the applicable published rules.
- **Where it came from:** sourced release, maker or printing information.
- **Copies and differences:** explain known distinctions and unknowns.
- **Follow a connection:** two or three relevant next steps, each with a reason.
- **Sources and corrections:** evidence, review date, gaps and an available
  correction route. A correction form is only promised if its workflow exists.

Most catalog records need a good reference page, not an automatically generated
essay. Begin with a small authored collection of readings and expand when there
is something useful and supportable to say.

## Three initial trails

| Trail | Stops and why they connect |
|---|---|
| I found a card. What is it? | Locate the printed code → find the record → compare language/printing → record your copy. Each step removes an identification ambiguity. |
| From one card to a first game | Read one card → learn where it sits on the table → practise a turn → choose a starter deck. Understanding becomes something the visitor can try. |
| Why do two copies look different? | Compare sourced records → learn printing/variant distinctions → inspect condition separately → document a copy. Printing, wear and price remain different questions. |

A trail is optional and can be entered at any stop. It has no completion pressure,
reward promise or invented estimate of how long someone should take.

## Voice, evidence and translation

Use warm, concrete writing about the subject. Forms use explicit verbs such as
Find, Save, Compare, Start practice and View records. Errors explain the next
useful action. Avoid turning every button into a metaphor.

Content records distinguish **reference**, **interpretation**, **personal account**
and **experiment**. Store attribution, language, sources, review date and known
limits beside the authored content. Claims about history, rules or services need
their own evidence; a poetic comparison can be presented as a reading.

Chinese/Japanese names and Cantonese writing can remain where they carry meaning.
Provide an accessible introduction and accurate language tags. Do not manufacture
translations or call an English body translated because its navigation is localised.
Personal writing does not prescribe a relationship, identity or belief for readers.

## Visual proposal: an editorial table

The visual character comes from the content: a card, a detail, a short caption,
an illustration with a source, a readable page and connected notes.

- Use a calm light surface and an equally complete dark option, strong readable
  text and one restrained action colour. High contrast and text-only modes remain
  functional. Exact colours are a wireframe/prototype decision.
- Use one clear sans-serif family for controls and body. A restrained reading
  heading face can be explored in the prototype; it is not a prerequisite for
  atmosphere. Avoid giant slogans and ornament in data-heavy pages.
- Keep body text around 16–18px with comfortable leading; paragraphs should fit
  a reading column. Tables can use a wider workspace. Labels and status text must
  remain readable on a narrow phone.
- A useful image has a subject, alt text and a credit. No generic card-image
  wallpaper, decorative generation pipeline, autoplay or scroll choreography.
  Missing permission produces a text-first layout, not substitute “real” artwork.
- Use ordinary links, visible labels, deliberate spacing, clear focus and touch
  targets. Essential content and simple forms should work before JavaScript;
  games and editing disclose their interactive requirements.

The previous blue application shell is not the visual specification for this
rebuild. The first design deliverable is a new set of low-fidelity compositions
using the content above, followed by a small visual prototype.

## Wireframe structure

```text
FRONT DOOR
Cambridge TCG     Explore the map · Cards · Play · Collection     Search · Account

There is more to a card.          One credited object / authored reading
Short invitation                 What to notice, source, Read this card
[Game] [Card number or term] [Find]

Meet a card             Follow a story             Take a seat
Purpose + direct link   Purpose + direct link       Purpose + direct link

Follow a thread
Question → stop + reason → stop + reason → stop + reason

All rooms · Source desk · Agents · Help · Reading preferences
```

```text
CARD PAGE
Breadcrumb / game / set                     Search another card
Identity + code + printing context          Image or text-first identity panel
Available facts and source state           Credit / image status

Details | Printings | How it plays | Story (when authored)
Qualified observations / unavailable state
[Save to collection — sign-in when needed]

What to notice / How it works / Sources
Next: compare this printing / try this lesson — each with a reason
```

```text
PERSONAL WORKSPACE
Collection       Cards · Wish list · Decks             Account
Task title + save state
[Search/filter]       Records or honest empty state
Selected item        Fields → Save / Cancel → result / recovery
Source/valuation status beside affected values
```

At 320px, columns become a meaningful reading order. The map and Menu contain
all rooms; eight rooms do not become eight cramped header links. Account and
operator workspaces use denser task layouts without importing museum decoration.
