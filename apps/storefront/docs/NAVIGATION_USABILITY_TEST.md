# Navigation five-task usability test

Use this script after any global-navigation change. It tests whether a person
can find the five highest-value journeys without being told the menu labels.
Run the same script on desktop and mobile; record observations manually whether
or not the participant chooses analytics cookies.

## Test setup

- Recruit at least five people per viewport who did not work on the navigation.
- Use a fresh browser profile and a prepared signed-in test account (the swaps
  destination is account-only). Never use a real customer's account or cards.
- Desktop: `1440 × 900`. Mobile: `390 × 844`, with touch emulation or a phone.
- Start every task at `/`. Clear only navigation history between tasks; do not
  teach the route learned in a previous task.
- Do not direct the cookie choice. The facilitator's scorecard is authoritative;
  consented GA events are supporting evidence only.
- Read each prompt verbatim. Do not name a menu, label, or destination route.

## What to record

Start the timer after reading the prompt. Stop when the success state is visible.

| Field | How to score it |
| --- | --- |
| Completed | `yes`, `assisted`, or `no` |
| Time | Seconds to the success state |
| First click | First meaningful link/button chosen |
| First-click success | `yes` if that choice lies on a direct successful path |
| Wrong turns | Pages opened that do not advance the task |
| Backtracks | Browser-back or home resets initiated by the participant |
| Notes | Hesitation, misunderstood labels, inaccessible controls, or quotes |

Clicks and taps count as actions. Typing into the card field does not; submitting
the form does. Opening **More** or the mobile menu counts as one action.

## The five tasks

| ID | Prompt (read verbatim) | Observable success state | Target |
| --- | --- | --- | --- |
| Price | “You have a One Piece card numbered OP01-001. Find its current price information.” | A `/prices/search` URL containing the chosen game and `q=OP01-001`, with a result, honest no-match, or honest source-error state visible. | ≤45s, ≤4 actions, 0 wrong turns |
| List | “You want to offer one of your cards for sale to another collector. Get to the place where you would start.” | `/market/list` is visible. | ≤20s, ≤2 actions, 0 wrong turns |
| Swap | “You would rather exchange cards than sell one. Find where you manage or start swaps.” | `/account/swaps` is visible. | ≤30s, ≤3 actions, 0 wrong turns |
| Learn | “You are new to One Piece TCG. Find the beginner guide that teaches you how to play.” | `/guides/how-to-play` is visible. | ≤45s, ≤4 actions, ≤1 wrong turn |
| Contact | “You have a question for the Cambridge TCG team. Find how to contact them.” | `/contact` is visible, with the contact form or email alternative. | ≤30s, ≤3 actions, 0 wrong turns |

Run all five on one viewport, then use new participants for the other viewport so
desktop learning does not make the mobile result look better. Rotate task order
between participants; keep Price first for participant 1, List first for
participant 2, and so on.

## Release criteria

A navigation revision passes when, on **each** viewport:

- at least 90% of tasks are completed without help;
- at least 80% have a successful first click;
- every task's median time and action count meet its target; and
- no keyboard, screen-reader, zoom, or touch issue blocks completion.

Any failed task gets one diagnosis: label, grouping, visibility, interaction, or
destination-page clarity. Change only the smallest relevant layer, then rerun the
failed task plus one control task with fresh participants.

## Scorecard

Copy one row per participant and task:

| Date | Viewport | Participant | Task | Completed | Seconds | Actions | First click | First-click success | Wrong turns | Backtracks | Notes |
| --- | --- | --- | --- | --- | ---: | ---: | --- | --- | ---: | ---: | --- |
|  | desktop/mobile | P01 | Price/List/Swap/Learn/Contact |  |  |  |  |  |  |  |  |

## Consented analytics cross-check

The client helper sends nothing until `analytics-consent=granted` **and** `gtag`
is available. It never sends the card query, only its length.

| Journey | Expected supporting events |
| --- | --- |
| Price | `nav_click` to `/find` or `/prices`, then `card_search_submit`, then `card_search_result` |
| List | `list_card_click` |
| Swap | `nav_click` to `/market`; use the `/account/swaps` page view for completion |
| Learn | `more_open` or `mobile_menu_open`, then `nav_click` to `/guides`; use the `/guides/how-to-play` page view for completion |
| Contact | `more_open` or `mobile_menu_open`, then `nav_click` to `/contact` |

Compare event sequences with the manual scorecard to find aggregate drop-offs;
do not treat missing events as failure because declining analytics is a valid
choice.
