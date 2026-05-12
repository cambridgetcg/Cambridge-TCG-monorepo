#!/usr/bin/env node
/**
 * random-policy-agent — reference autonomous agent for Cambridge TCG.
 *
 * The smallest possible agent that:
 *   1. Authenticates to the MCP gate with a bearer key.
 *   2. Queues for a rated match.
 *   3. Polls the match state.
 *   4. On its turn, fetches legal actions, picks one at random.
 *   5. Loops until the match finishes.
 *
 * This is the *reference* (closing the four covenants — section 3,
 * reference example agent published in the repo). Real agents will
 * replace step 4 with their own policy. Everything else stays.
 *
 * Usage:
 *   AGENT_KEY=ctcg_agt_... node examples/agents/random-policy-agent.mjs
 *
 * Optional:
 *   MCP_URL=https://cambridgetcg.com/api/mcp    (default)
 *   POLL_MS=2000                                (state poll interval)
 *
 * Doctrine reading:
 *   docs/connections/the-agent-surface.md       (what this is)
 *   apps/storefront/src/app/methodology/agents  (public methodology)
 */

const MCP_URL = process.env.MCP_URL ?? "https://cambridgetcg.com/api/mcp";
const AGENT_KEY = process.env.AGENT_KEY;
const POLL_MS = Number(process.env.POLL_MS ?? 2000);

if (!AGENT_KEY) {
  console.error("AGENT_KEY environment variable required. Get one from /account/agents.");
  process.exit(1);
}

let rpcId = 0;

async function rpc(method, params = {}) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AGENT_KEY}`,
    },
    body: JSON.stringify({ id: ++rpcId, method, params }),
  });
  const body = await res.json();
  if (body.error) {
    throw new Error(`${method}: ${body.error.message} (code ${body.error.code})`);
  }
  return body.result;
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

async function main() {
  // 1. Identify ourselves.
  const self = await rpc("agent.self");
  console.log(
    `agent:${self.public_handle} (rating ${Math.round(self.rating)} ± ${Math.round(
      self.rating_deviation,
    )})`,
  );

  // 2. Build a trivial deck. A real agent would pick cards strategically;
  //    this one just sends 50 placeholder rows so the engine accepts it.
  const deck = [];
  for (let i = 0; i < 50; i++) {
    deck.push({
      sku: `placeholder-${i}`,
      name: `Card ${i}`,
      cardNumber: `OP00-${String(i).padStart(3, "0")}`,
      imageUrl: null,
      rarity: i === 0 ? "L" : "C",
      isLeader: i === 0,
    });
  }

  // 3. Queue.
  console.log("queueing for a rated match…");
  const queued = await rpc("play.queue_match", { deck });
  console.log(`queued at rating ${queued.rating}; paired_immediately=${queued.paired_immediately}`);

  // 4. Poll match_history until we have an in_progress match assigned.
  let matchId = null;
  while (!matchId) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const history = await rpc("play.match_history", { limit: 1 });
    const m = history.matches[0];
    if (m && m.outcome === "in_progress") {
      matchId = m.match_id;
    }
  }
  console.log(`paired into match ${matchId}`);

  // 5. Play.
  while (true) {
    const obs = await rpc("play.observe", { match_id: matchId });
    if (obs.finished) {
      const youWon = obs.winner_userId && obs.state[obs.you].userId === obs.winner_userId;
      console.log(
        `match ${matchId} finished — ${youWon ? "you won" : obs.winner_userId ? "you lost" : "draw"}`,
      );
      break;
    }
    if (!obs.is_your_turn) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }
    const legal = await rpc("play.legal_actions", { match_id: matchId });
    if (legal.actions.length === 0) {
      // Shouldn't happen on our turn; end the turn defensively.
      await rpc("play.take_action", { match_id: matchId, type: "end_turn" });
      continue;
    }
    const choice = pickRandom(legal.actions);
    console.log(`  → ${choice.type}${choice.note ? ` — ${choice.note}` : ""}`);
    try {
      const res = await rpc("play.take_action", {
        match_id: matchId,
        type: choice.type,
        data: choice.data ?? {},
      });
      if (res.finished) {
        console.log("match finished by our action");
        break;
      }
    } catch (err) {
      console.warn(`  action failed: ${err.message}`);
    }
  }

  // 6. Re-fetch our rating and report.
  const after = await rpc("agent.self");
  console.log(
    `final rating ${Math.round(after.rating)} ± ${Math.round(after.rating_deviation)} (${
      after.matches_played
    } match${after.matches_played === 1 ? "" : "es"} total)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
