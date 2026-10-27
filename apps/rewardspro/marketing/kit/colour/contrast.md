# RewardsPro: contrast

WCAG 2.x ratio is the conformance bar (AA: 4.5 text, 3 large text and UI). APCA Lc is shown as guidance from the WCAG 3 drafts.

| mode | foreground | on | colours | ratio | needs | APCA Lc | |
|---|---|---|---|---|---|---|---|
| light | `text` | `bg` | #1B1D1F on #FFFFFF | 16.91 | 4.5 | 103.8 | ✓ |
| light | `text-muted` | `bg` | #686C70 on #FFFFFF | 5.29 | 4.5 | 76.3 | ✓ |
| light | `text` | `surface` | #1B1D1F on #EAEBEC | 14.16 | 4.5 | 91.9 | ✓ |
| light | `focus` | `bg` | #1A3E5C on #FFFFFF | 11.13 | 3 | 95.5 | ✓ |
| light | `primary-text` | `bg` | #1A3E5C on #FFFFFF | 11.13 | 4.5 | 95.5 | ✓ |
| light | `accent-text` | `bg` | #007C7A on #FFFFFF | 5.04 | 4.5 | 74.3 | ✓ |
| light | `on-primary` | `primary` | #FFFFFF on #1A3E5C | 11.13 | 4.5 | -99.3 | ✓ |
| light | `on-accent` | `accent` | #1B1D1F on #17BEBB | 7.34 | 4.5 | 56.9 | ✓ |
| light | `primary-ui` | `bg` | #1A3E5C on #FFFFFF | 11.13 | 3 | 95.5 | ✓ |
| light | `accent-ui` | `bg` | #009A97 on #FFFFFF | 3.46 | 3 | 61.5 | ✓ |
| light | `primary` | `bg` | #1A3E5C on #FFFFFF | 11.13 | 0 | 95.5 | info |
| light | `accent` | `bg` | #17BEBB on #FFFFFF | 2.3 | 0 | 44.9 | info |
| dark | `text` | `bg` | #F6F7F7 on #09110F | 17.81 | 4.5 | -102.1 | ✓ |
| dark | `text-muted` | `bg` | #9EA2A6 on #09110F | 7.44 | 4.5 | -51.2 | ✓ |
| dark | `text` | `surface` | #F6F7F7 on #1B2321 | 14.95 | 4.5 | -100.1 | ✓ |
| dark | `focus` | `bg` | #658AAD on #09110F | 5.27 | 3 | -37.5 | ✓ |
| dark | `primary-text` | `bg` | #83A6C5 on #09110F | 7.49 | 4.5 | -51.6 | ✓ |
| dark | `accent-text` | `bg` | #17BEBB on #09110F | 8.3 | 4.5 | -56.8 | ✓ |
| dark | `on-primary` | `primary` | #1B1D1F on #658AAD | 4.66 | 4.5 | 38.1 | ✓ |
| dark | `on-accent` | `accent` | #1B1D1F on #17BEBB | 7.34 | 4.5 | 56.9 | ✓ |
| dark | `primary-ui` | `bg` | #658AAD on #09110F | 5.27 | 3 | -37.5 | ✓ |
| dark | `accent-ui` | `bg` | #17BEBB on #09110F | 8.3 | 3 | -56.8 | ✓ |
| dark | `primary` | `bg` | #658AAD on #09110F | 5.27 | 0 | -37.5 | info |
| dark | `accent` | `bg` | #17BEBB on #09110F | 8.3 | 0 | -56.8 | info |

Note: dark mode --primary is #658AAD (primary 500, 5.27:1 on the dark ground), not the brand colour #1A3E5C, which is 1.72:1 there and would disappear as a fill.
