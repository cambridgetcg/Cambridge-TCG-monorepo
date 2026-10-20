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
| dark | `text` | `bg` | #F6F7F7 on #1B1D1F | 15.75 | 4.5 | -100.8 | ✓ |
| dark | `text-muted` | `bg` | #9EA2A6 on #1B1D1F | 6.58 | 4.5 | -50.0 | ✓ |
| dark | `text` | `surface` | #F6F7F7 on #2E3133 | 12.2 | 4.5 | -97.2 | ✓ |
| dark | `focus` | `bg` | #658AAD on #1B1D1F | 4.66 | 3 | -36.2 | ✓ |
| dark | `primary-text` | `bg` | #83A6C5 on #1B1D1F | 6.62 | 4.5 | -50.3 | ✓ |
| dark | `accent-text` | `bg` | #17BEBB on #1B1D1F | 7.34 | 4.5 | -55.6 | ✓ |
| dark | `on-primary` | `primary` | #1B1D1F on #658AAD | 4.66 | 4.5 | 38.1 | ✓ |
| dark | `on-accent` | `accent` | #1B1D1F on #17BEBB | 7.34 | 4.5 | 56.9 | ✓ |
| dark | `primary-ui` | `bg` | #658AAD on #1B1D1F | 4.66 | 3 | -36.2 | ✓ |
| dark | `accent-ui` | `bg` | #17BEBB on #1B1D1F | 7.34 | 3 | -55.6 | ✓ |
| dark | `primary` | `bg` | #658AAD on #1B1D1F | 4.66 | 0 | -36.2 | info |
| dark | `accent` | `bg` | #17BEBB on #1B1D1F | 7.34 | 0 | -55.6 | info |

Note: dark mode --primary is #658AAD (primary 500, 4.66:1 on the dark ground), not the brand colour #1A3E5C, which is 1.52:1 there and would disappear as a fill.
