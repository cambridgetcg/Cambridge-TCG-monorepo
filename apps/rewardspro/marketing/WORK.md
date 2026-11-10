# RewardsPro: who does what

RewardsPro work runs through a small standing team: a chief of staff (the owner's main session, `/rp`) and two
leads, Product (`rp-product`) and Growth (`rp-growth`).

- **The charter** is `.claude/skills/rp-team/SKILL.md`: who owns what, the owner's short list, the one read and five
  principles. The role files are in `.claude/agents/rewardspro/`.
- **The board** is the set of issues labelled `rewardspro` plus a role label. The pinned issue "RewardsPro: this
  week" is where the owner looks.
- **To start,** run `claude --model fable` in the repo, then `/rp`. To work as a lead with the owner present, run
  `claude --agent rp-product` or `claude --agent rp-growth`. On the lab, once a week:
  `claude --agent rp-product --bg -n "rp-product week" "work your rp:product board"`.
- **Earlier versions of this file** (the packages, claim and concur comments, the lab invitation) are in git
  history. They are history, not orders.
