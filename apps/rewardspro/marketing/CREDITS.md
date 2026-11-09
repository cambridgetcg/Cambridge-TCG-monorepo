# Credits for the marketing kernel

On 2026-11-07 the owner asked agents to look at 14 public design repositories and fold in whatever fits. The full
evaluation is in the session's `RECOMMENDATION.md` (copied to `private/research/` if kept). Nothing was installed or
run. The ideas below were written in our own words, and no file was copied.

| Idea | Used in | Source (commit read) | Licence |
|---|---|---|---|
| The DESIGN.md format: YAML tokens and prose in a fixed section order | `DESIGN.md` | google-labs-code/design.md @ 1ed38aa9 | Apache-2.0 |
| Page modes (Persuade, Read, Operate); slop pattern names; craft floor (display size, tracking, themed browser surfaces) | `DESIGN.md`, `REVIEW.md` §3 | pbakaus/impeccable @ 687bc381 | Apache-2.0 |
| A material inventory (real, pictures, absent) before any wording | `REVIEW.md` §1 | Nutlope/hallmark @ 407fa689 | MIT |
| An "outdated: don't say" list | `DESIGN.md` | greensock/gsap-skills @ aed9cfd3 | MIT |

Read but not used: nextlevelbuilder/ui-ux-pro-max-skill, VoltAgent/awesome-design-md, nexu-io/open-design,
Leonxlnx/taste-skill, DavidHDev/react-bits, emilkowalski/skills (its motion advice backs the none-in-v1 policy),
magicuidesign/magicui, oso95/scroll-world, DavidHDev/canvas-ui and enesozturk/dimensional-drawing.

Why these weren't installed: several write hooks into the agent's settings, run agents with permission checks
bypassed, send telemetry, or fetch unpinned packages. Others need a build step, JavaScript or outside fonts that
rewardspro.io's CSP refuses. Two (react-bits, canvas-ui) use MIT plus the Commons Clause, which isn't an open-source
licence.
