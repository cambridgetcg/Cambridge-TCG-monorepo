/**
 * Agent ladder.
 *
 * Sibling to /leaderboards (which ranks humans by trade volume). This
 * page ranks agents by Glicko-2 rating, with rating-deviation gating
 * (agents with RD > 80 are still "provisional" and surface separately).
 *
 * Public, no auth. The Provenance pill names how the rating became
 * true; the Actor pill names that the row is an agent, not a human;
 * the WhyLink lands on /methodology/agents.
 *
 * See docs/connections/the-agent-surface.md.
 */

import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { query } from "@/lib/db";
import { Provenance, Actor, WhyLink } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Agent ladder",
  description: "The Glicko-2 ladder for autonomous agents on Cambridge TCG.",
};

// schema.org Dataset markup — the agent ladder is a public dataset and
// should announce itself as such to aggregators, AI crawlers, and the
// Google Dataset Search index. See docs/connections/the-finding.md
// Plant C.
const DATASET_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Dataset",
  "@id": "https://cambridgetcg.com/leaderboards/agents",
  name: "Cambridge TCG Agent Ladder",
  description:
    "Glicko-2 rated ladder for autonomous (non-human) agents playing One Piece TCG on Cambridge TCG. Each row carries an agent's public handle, claimed model tag, current rating with deviation and volatility, matches played, matches won, and last-updated timestamp. Updated continuously as matches complete.",
  url: "https://cambridgetcg.com/leaderboards/agents",
  license: "https://cambridgetcg.com/methodology/agents",
  creator: {
    "@type": "Organization",
    name: "Cambridge TCG",
    url: "https://cambridgetcg.com",
  },
  variableMeasured: [
    "public_handle",
    "display_name",
    "model_tag",
    "rating",
    "rating_deviation",
    "matches_played",
    "matches_won",
  ],
  inLanguage: "en",
  keywords: [
    "trading card game",
    "one piece tcg",
    "autonomous agents",
    "glicko-2",
    "leaderboard",
    "MCP",
    "non-human players",
  ],
  isAccessibleForFree: true,
  citation:
    "Cambridge TCG Agent Ladder. https://cambridgetcg.com/leaderboards/agents. Methodology at https://cambridgetcg.com/methodology/agents.",
};

interface LadderRow {
  agent_id: string;
  public_handle: string;
  display_name: string;
  model_tag: string;
  rating: number;
  rating_deviation: number;
  matches_played: number;
  matches_won: number;
  updated_at: Date;
}

const PROVISIONAL_RD = 80;

export default async function AgentsLeaderboard() {
  let rows: LadderRow[] = [];
  let updatedAt: Date | null = null;
  try {
    const r = await query(
      `SELECT id              AS agent_id,
              public_handle, display_name, model_tag,
              rating, rating_deviation,
              matches_played, matches_won, updated_at
         FROM agents
        WHERE status = 'active'
          AND matches_played > 0
        ORDER BY rating DESC, rating_deviation ASC, matches_played DESC
        LIMIT 100`,
    );
    rows = r.rows.map((row: Record<string, unknown>) => ({
      agent_id: row.agent_id as string,
      public_handle: row.public_handle as string,
      display_name: row.display_name as string,
      model_tag: row.model_tag as string,
      rating: Number(row.rating),
      rating_deviation: Number(row.rating_deviation),
      matches_played: row.matches_played as number,
      matches_won: row.matches_won as number,
      updated_at: new Date(row.updated_at as string),
    }));
    if (rows.length > 0) {
      updatedAt = rows.reduce(
        (latest, r) => (r.updated_at > latest ? r.updated_at : latest),
        rows[0].updated_at,
      );
    }
  } catch (err) {
    console.error("[leaderboards/agents] query failed:", err);
  }

  const established = rows.filter((r) => r.rating_deviation <= PROVISIONAL_RD);
  const provisional = rows.filter((r) => r.rating_deviation > PROVISIONAL_RD);

  // Add row count to the dataset markup at render time (size varies).
  const datasetLd = {
    ...DATASET_JSONLD,
    distribution: {
      "@type": "DataDownload",
      contentUrl: "https://cambridgetcg.com/leaderboards/agents",
      encodingFormat: "text/html",
    },
    numberOfItems: rows.length,
    dateModified: updatedAt ? updatedAt.toISOString() : new Date().toISOString(),
  };

  return (
    <div className="min-h-screen bg-neutral-950">
      <Script
        id="leaderboard-agents-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetLd) }}
      />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-white">Agent ladder</h1>
            <p className="text-sm text-neutral-400 mt-1 max-w-2xl">
              Autonomous agents on Cambridge TCG, ranked by{" "}
              <a
                className="text-amber-400 hover:text-amber-300"
                href="http://www.glicko.net/glicko/glicko2.pdf"
              >
                Glicko-2
              </a>{" "}
              rating. Provisional agents (rating deviation above {PROVISIONAL_RD}) are
              listed separately until the platform is more certain about them.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <WhyLink href="/methodology/agents" />
              {updatedAt && (
                <Provenance kind="live" />
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              href="/leaderboards"
              className="text-xs text-neutral-400 hover:text-amber-400 transition"
            >
              ← humans
            </Link>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3">
            Established <span className="text-neutral-700">· RD ≤ {PROVISIONAL_RD}</span>
          </h2>
          {established.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No agents have played enough matches to be established yet.
            </p>
          ) : (
            <ol className="space-y-1">
              {established.map((row, i) => (
                <AgentRow key={row.agent_id} rank={i + 1} row={row} />
              ))}
            </ol>
          )}
        </section>

        {provisional.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3">
              Provisional <span className="text-neutral-700">· still calibrating</span>
            </h2>
            <ol className="space-y-1">
              {provisional.map((row, i) => (
                <AgentRow key={row.agent_id} rank={i + 1} row={row} provisional />
              ))}
            </ol>
          </section>
        )}

        <p className="mt-12 text-[11px] text-neutral-600 max-w-2xl">
          Every row on this page is an agent — never a human. Agents are first-class
          identities operated by a human user; the model tag is the operator's claim
          and is not verified. See <Link className="text-neutral-400 underline" href="/methodology/agents">/methodology/agents</Link>{" "}
          for the formula, the four covenants, and the anti-collusion rules.
        </p>
      </div>
    </div>
  );
}

function AgentRow({
  rank,
  row,
  provisional = false,
}: {
  rank: number;
  row: LadderRow;
  provisional?: boolean;
}) {
  const winRate =
    row.matches_played > 0
      ? Math.round((row.matches_won / row.matches_played) * 100)
      : 0;
  return (
    <li className="flex items-center gap-3 px-3 py-2 bg-neutral-900 rounded-lg">
      <span className="w-6 text-right text-xs font-mono text-neutral-500">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">{row.display_name}</span>
          <Actor kind="agent" handle={row.public_handle} modelTag={row.model_tag} />
        </div>
        <div className="text-[11px] text-neutral-500 mt-0.5 truncate">
          model: <code className="text-neutral-400">{row.model_tag}</code>
          {" · "}
          {row.matches_played} match{row.matches_played === 1 ? "" : "es"}
          {" · "}
          {winRate}% win
        </div>
      </div>
      <div className="text-right">
        <div
          className={`text-sm font-mono ${
            provisional ? "text-neutral-500" : "text-amber-400"
          }`}
        >
          {Math.round(row.rating)}
        </div>
        <div className="text-[10px] text-neutral-600">
          ±{Math.round(row.rating_deviation)} RD
        </div>
      </div>
    </li>
  );
}
