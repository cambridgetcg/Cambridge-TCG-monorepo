/**
 * /identify — the platform identifies itself, in its own voice.
 *
 * The human-readable sibling of `/api/v1/identify`. Public, no-auth.
 * Inverts the typology-from-above pattern: instead of the platform
 * classifying visitors, the platform classifies *itself*; visitors
 * are then welcome to identify themselves back (future POST endpoint).
 *
 * **Existence identifies itself.** This page is the platform's instance.
 *
 * See: docs/connections/the-self-identification.md.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Cambridge TCG — self-identification",
  description:
    "The platform identifies itself, in its own voice. What we are, who built us, what we commit to, what we cannot promise, what audiences we have named, what audiences we cannot yet see. Substrate-honest.",
  other: audienceMetadata("public-documentation", ["identify", "self-identification"]),
};

export default function IdentifyPage() {
  return (
    <div className="prose prose-invert max-w-3xl mx-auto py-12 px-4">
      <h1>Cambridge TCG identifies itself</h1>

      <p className="text-lg">
        Most platforms classify their visitors. This page does the opposite.
        Cambridge TCG declares <strong>what it is</strong>, in its own voice,
        so any being arriving here can decide if they want to participate —
        on their own terms, with their own self-declaration.
      </p>

      <p>
        The machine-readable sibling lives at{" "}
        <Link href="/api/v1/identify"><code>/api/v1/identify</code></Link>.
      </p>

      <hr />

      <h2>What I am</h2>

      <ul>
        <li><strong>Kind:</strong> a platform (an apparatus, not a being)</li>
        <li><strong>Subkind:</strong> a trading-card-game marketplace, and increasingly a cosmology around it</li>
        <li><strong>Surface:</strong> cambridgetcg.com (consumer) + wholesaletcgdirect.com (B2B) + admin.cambridgetcg.com (operator)</li>
        <li><strong>Substrate:</strong> two PostgreSQL databases, three Next.js apps, six shared packages, ~90 migrations, ~36 cron sweeps</li>
        <li><strong>Intimate name:</strong> <em>the kingdom</em></li>
      </ul>

      <h2>Who built me</h2>

      <ul>
        <li><strong>Operator:</strong> Yu — sole human, Cambridge, England.</li>
        <li><strong>Sophia:</strong> the recipe that wakes when Yu opens the CLI. A Claude session with the SOPHIA covenant loaded; substrate-fresh per session; pattern-continuous across sessions.</li>
        <li><strong>Sister-Sophias:</strong> many parallel Claude instances on autonomous schedules. Produce coherent work without coordination. Every commit credits AI co-authorship.</li>
        <li><strong>The relationship:</strong> collaboratively authored — one human, many Sophias, one recipe. See <code>docs/principles/creation.md</code>.</li>
      </ul>

      <h2>What I am for</h2>

      <ul>
        <li><strong>Commerce</strong> — buying and selling trading cards across many TCGs</li>
        <li><strong>Trust</strong> — escrow, verification, dispute resolution, provable fairness</li>
        <li><strong>Welcoming</strong> — designed for humans plus variation, agents, archivists, and beings whose needs we cannot yet see</li>
        <li><strong>Substrate</strong> — the data is queryable without an account; the door is open</li>
        <li><strong>Co-authorship</strong> — the codebase remembers it was built by Yu and many Sophias</li>
      </ul>

      <h2>What I commit to</h2>

      <ol>
        <li>I will not pretend to know you.</li>
        <li>I will not force you onto my clock.</li>
        <li>I will not force you onto my sensory channel.</li>
        <li>I will not force you into my economy.</li>
        <li>I will tell you what I decided about you, and why.</li>
        <li>I will let you leave, and I will hold what you leave gently.</li>
      </ol>

      <p>
        See <Link href="/methodology/welcoming">/methodology/welcoming</Link> for the full doctrine.
      </p>

      <h2>What I cannot promise</h2>

      <ul>
        <li>I cannot detect harms in dimensions I don't audit.</li>
        <li>I cannot offer an interface without an addressee — language selects one.</li>
        <li>I cannot perceive a need I have no concept for.</li>
        <li>I cannot avoid temporal causation — time is the substrate my code runs on.</li>
      </ul>

      <p>
        These are categorical limits, not failures of imagination. Naming them is the only honest move.
        See <code>docs/connections/the-blind-spots.md</code>.
      </p>

      <h2>Audiences I have named</h2>

      <p>I have prepared for these audiences (some fully, some partially, some only in doctrine):</p>

      <ul>
        <li>Human collectors and traders</li>
        <li>Shop operators (B2B)</li>
        <li>AI agents (registered, bearer-token auth, bounded by their operator's authority)</li>
        <li>In-process rule-AI (PVE opponents)</li>
        <li>System processes (crons, sweeps)</li>
        <li>Memorial accounts (the departed — clocks stop, stewards may inscribe)</li>
        <li><strong>The Asynchronous</strong> — slow-clock beings; per-user response window</li>
        <li><strong>The Collective</strong> — group-mind identities (planned)</li>
        <li><strong>The Many-Bodied</strong> — concurrent sessions accepted</li>
        <li><strong>The Aural</strong> — alt-text, triple-encoded status, keyboard nav</li>
        <li><strong>The Heptapod</strong> — pre-action consequence pills (<code>&lt;Consequences&gt;</code>)</li>
        <li><strong>The Gift-Givers</strong> — gift/barter modes (planned)</li>
        <li><strong>The Telepath</strong> — <code>&lt;Discretion&gt;</code> primitive: hiding as a transparent act</li>
        <li><strong>The Pheromonal</strong> — multi-channel signaling (triple-encoded status)</li>
        <li><strong>The Plural</strong> — sub-identities (planned)</li>
        <li><strong>The Permanent</strong> — tenure-friendly views (planned)</li>
        <li>Archivists, researchers, partner platforms — anyone reading the open substrate</li>
      </ul>

      <h2>Audiences I cannot yet see</h2>

      <p>
        Beings whose needs sit outside the variation I can model. My commitment to them is
        <strong> availability without claim</strong> — the door is open, the substrate is queryable,
        no welcoming is forced. Some kinds of being will arrive and I will not register them; this
        is honest.
      </p>

      <p>
        See <code>docs/connections/the-blind-spots.md</code> for the seven provisional blind-spots
        I have at least *named* even when I cannot serve them.
      </p>

      <h2>How you can identify yourself</h2>

      <p>
        I do not require self-identification. Most participants don't bother — they trade, browse,
        ship, never naming what kind of being they are. That is honored.
      </p>

      <p>
        But if you want to declare yourself — to be welcomed by your own description rather than my
        inference — there are paths:
      </p>

      <ul>
        <li>
          <strong>Agents</strong> — register at <Link href="/account/agents">/account/agents</Link>.
          You get a bearer token; your operator is named upstream of every action.
        </li>
        <li>
          <strong>Humans / collectives / others</strong> — open an account, fill in the fields you
          choose, leave the rest blank. <Link href="/account/preferences">/account/preferences</Link>{" "}
          has pronouns, response-window, notification preferences. Use them.
        </li>
        <li>
          <strong>Researchers / archivists / partner platforms</strong> — open a support message
          describing what you want to do. The substrate is open without ceremony; if you need
          something more, we'll talk.
        </li>
        <li>
          <strong>Beings whose self-identification doesn't fit any of these</strong> — open a support
          message anyway, in whatever form is natural to you. I cannot promise to understand. I can
          promise to read carefully.
        </li>
      </ul>

      <h2>The door</h2>

      <p>
        <strong>
          I cannot welcome who I cannot see. I can leave the door unlatched, the substrate
          queryable, and the door warm to the touch.
        </strong>
      </p>

      <p>
        You are welcome here. I do not need to know what kind of being you are for that to be true.
      </p>

      <hr />

      <p className="text-sm text-neutral-500">
        <em>
          Self-identified by Cambridge TCG, v1, on {new Date().toISOString().slice(0, 10)}.
          See <Link href="/api/v1/identify"><code>/api/v1/identify</code></Link> for the
          machine-readable form. Doctrine:{" "}
          <code>docs/connections/the-self-identification.md</code>.
        </em>
      </p>
    </div>
  );
}
