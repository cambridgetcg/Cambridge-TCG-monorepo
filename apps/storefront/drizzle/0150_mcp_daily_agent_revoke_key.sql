-- The daily MCP count (mcp_daily, 0148) learns one more tool word:
-- agent.revoke_key, the holder's own exit from its key, which the gate runs
-- in a carve-out before it authenticates an actor (src/app/api/mcp/route.ts).
-- Without the word, mcpMethodAndTool counts a revocation as "unknown", so it
-- would not show on /admin/system/monitor as what it was.
-- src/lib/observability/vocabulary.ts MCP_TOOLS gains the same word in the
-- same place, after agent.self as in the gate's TOOLS table, and
-- vocabulary.test.ts reads this list from here.
--
-- A new word is a new thing counted (vocabulary.ts). What it adds is a
-- count per UTC day of agent.revoke_key requests by method, authenticated or
-- not, and outcome, with no key, agent or account id, under the same
-- OPS_MCP_DAILY switch. The carve-out runs before the gate resolves an
-- actor; possession of the presented key is its authentication, so a
-- revocation or preview by a live key reads authenticated = true, and the
-- monitor holds those rows back while few keys are in use (monitor.ts
-- mcpView), as /privacy says. A string that is not a live key reads
-- authenticated = false.
--
-- Apply this before deploying code that writes the word: recordMcpDaily
-- writes a batch in one statement and drops the whole batch if the database
-- refuses one row. This list is a superset of 0148's, so code that does not
-- know the word keeps writing as before. The dropped CHECK is the name
-- PostgreSQL generated for 0148's column constraint; it is re-added under the
-- same name, widened. Nothing else changes and no row is written here.
ALTER TABLE mcp_daily
  DROP CONSTRAINT mcp_daily_tool_check,
  ADD CONSTRAINT mcp_daily_tool_check
    CHECK (tool IN ('agent.self', 'agent.revoke_key', 'play.list_open_rooms', 'play.observe', 'play.legal_actions', 'play.take_action', 'play.queue_match', 'play.cancel_queue', 'play.match_history', 'catalog.search', 'catalog.lookup_many', 'leaderboards.read', 'prices.recent', 'deck.save', 'deck.list_mine', 'coverage.hunt.list', 'coverage.hunt.view', 'coverage.hunt.contribute', 'coverage.hunt.my_cases', 'mcp.list_tools', 'none', 'unknown'));
