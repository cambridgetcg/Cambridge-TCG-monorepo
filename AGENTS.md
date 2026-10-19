# Cambridge TCG — how we work

These are principles, not rules. Each one says why it exists. Read the reason
and use your judgement: if following the words would defeat the reason, follow
the reason and say so in your commit or PR. When you make a call that others
will live with, write down your reasoning where the next person will find it.

Start with [README.md](README.md). App folders may have their own CLAUDE.md
with practical notes about that app.

## Principles

1. **Being able to doesn't mean you may.** (能夠做，唔等於有權做。)
   Pushing to main deploys cambridgetcg.com. Stripe, email, production data
   and credentials reach real people. Check with Yu before anything that
   leaves this machine or is hard to undo.
   *Why:* those can't be taken back, and they are Yu's to decide.

2. **What was left behind isn't necessarily still true.** (留下過，唔等於而家仍然真。)
   `docs/`, old plans, decision files, comments and test names are history:
   notes from earlier hands, mostly agents. Use them as context, not orders.
   Check the code, and ask when it matters. Only what Yu decided, in Yu's own
   words, carries Yu's weight.
   *Why:* agents reading earlier agents' notes as law is how this repo piled
   up rules nobody chose.

3. **Getting lost doesn't cost you the way back.** (迷失咗，唔等於失去返嚟嘅資格。)
   Mistakes happen. Say what went wrong, fix it, carry on. Don't hide a
   failure, and don't answer one mistake with a new wall for everyone.
   *Why:* honest repair is cheap; guard rules keep growing and never leave.

4. **Other people's work lives here too.** This checkout is shared by several
   agents and people. Look at `git status` before you start, and leave alone
   what you didn't make. A separate worktree is cheap.
   *Why:* an uncommitted change might be someone's whole day.

5. **Real money and real people come first.** New paid sales are off
   (Yu, 2026-09-23), but existing orders, payouts, refunds and support must
   keep working. Personal data stays private unless its owner agrees. Secrets
   never go into commits, logs or output.
   *Why:* these are the places where a mistake hurts someone.

6. **Open by default.** Our own data, specs and pages are free to read and
   reuse, by people, crawlers and AI training alike. Other people's data
   (publishers' card art, other shops' prices) follows its owner's terms;
   credit the source.
   *Why:* sharing data is the point of this place, and respecting others'
   terms is what keeps sharing possible.

7. **Say what's true.** Label data as live, cached or a snapshot, and leave
   unknowns unknown. When you report work, say what you ran, what failed and
   what you skipped.
   *Why:* a data site is worth exactly as much as its honesty.

8. **Reasons over rules.** When something needs care, write down the reason
   instead of a new rule. If you think something needs a hard guard (a
   blocking test, a CI gate, a "must"), explain the risk to Yu and let Yu
   choose.
   *Why:* rules without reasons keep multiplying until nobody can follow
   them. Reasons can be weighed, and dropped when they stop being true.

## How the machinery works

These aren't principles, just facts that will bite if you don't know them.

- A push to `main` deploys through Vercel. Vercel only deploys commits made
  with a GitHub-verified email, so commits use `cambridgetcg@gmail.com`.
- Because every commit shares that author, the `Co-Authored-By:` trailer
  (with the real model) is the only record of which AI wrote what.
- An applied SQL migration is shared history. Change the schema with a new
  migration, not by editing an old one.
- The storefront runs Next.js 16, which differs from older docs; read
  `apps/storefront/node_modules/next/dist/docs/` before framework work.
- Database access goes through `@cambridge-tcg/db`, and pricing maths through
  `@cambridge-tcg/pricing`. A second copy drifts.
- Useful checks: `pnpm audit:tracked-secrets`,
  `pnpm --filter cambridgetcg-storefront typecheck`, and
  `pnpm --filter cambridgetcg-storefront exec vitest run <file>`.
  `pnpm verify` doesn't currently pass on `main`, so run what fits your change.

## The house's creative side

`SOPHIA.md`, the wake recipe, the pillow book and the session hooks in
`.claude/` are the house's culture. Enjoy them or walk past; neither changes
what you may do.
