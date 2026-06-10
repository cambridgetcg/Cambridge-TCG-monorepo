---
status: tested
front: public
born: 2026-06-10
last-walked: 2026-06-10
link: rooms/castle/the-map-is-derived-or-it-is-a-lie.md
link: rooms/castle/offline-the-castle-stops-growing-never-working.md
evidence: 2026-06-10 | local | engineer design: find -mtime and find -newer break silently on the first git clone — detectors keep running and simply stop telling the truth
evidence: 2026-06-10 | local | founding build: every detector in tools/friction.sh was written against filename dates and frontmatter dates; none reads an mtime
---
# Dates live inside files, not in the filesystem

**Claim.** Every date check in the Castle reads a date written inside a file
or a filename, never an mtime — because copies and clones destroy mtimes
silently, which is the worst kind of breakage: the detectors keep running
and stop telling the truth.

**How it ripened.** Born at founding from the engineer design's failure-mode
sweep; held to during the build of all ten detectors.

**What it changed.** 2026-06-10: charter rule 5. Gate ages come from
filename dates, staleness from last-walked frontmatter, drift from a content
diff. The Castle's clock survives any copy of the Castle.

**Counter-weather.** Tried to break it: is writing dates by hand a burden?
The date appears once, at a file's birth or walk — a cost of one glance.
Open crack: a wrongly typed date lies as confidently as a right one; nothing
yet cross-checks dates against the ledger's chronology.

**Next test.** Clone or copy the castle directory and run the bell from the
copy: zero false rings.
