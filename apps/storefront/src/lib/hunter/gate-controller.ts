1|/**
2| * gate-controller.ts — Server actions for the Hunter System.
3| *
4| * Enter gates, clear gates, fail gates. Every action is logged.
5| * The artifact tells the truth about its own state.
6| */
7|
8|"use server";
9|
10|import { query } from "@/lib/db";
11|import type { Hunter, Gate, GateAttempt } from "./hunter-engine";
12|import {
13|  canEnterGate,
14|  gateRewards,
15|  gateAuraCost,
16|  rankFromLevel,
17|  nenAffinity,
18|  type HunterRank,
19|  type GateRank,
20|  type NenType,
21|} from "./hunter-engine";
22|
23|// Cast helper — the raw query() returns rows as any[]
24|function firstRow<T>(res: { rows: any[] }): T | null {
25|  return (res.rows[0] as T) ?? null;
26|}
27|
28|// ── REGISTER HUNTER ──
29|// Create a hunter profile for an agent or user.
30|
31|export async function registerHunter(params: {
32|  agent_id?: string;
33|  user_id?: string;
34|  nen_type: NenType;
35|}): Promise<{ ok: true; data: Hunter } | { ok: false; error: string }> {
36|  try {
37|    const result = await query(`
38|      INSERT INTO hunters (agent_id, user_id, nen_type)
39|      VALUES ($1, $2, $3)
40|      RETURNING *
41|    `, [params.agent_id ?? null, params.user_id ?? null, params.nen_type]);
42|
43|    if (!result.rows[0]) return { ok: false, error: "Failed to create hunter" };
44|    return { ok: true, data: result.rows[0] };
45|  } catch (e) {
46|    return { ok: false, error: String(e) };
47|  }
48|}
49|
50|// ── OPEN GATE ──
51|// Manifest a kingdom mission as a gate.
52|
53|export async function openGate(params: {
54|  kingdom_id: string;
55|  title: string;
56|  description?: string;
57|  gate_rank: GateRank;
58|  repo_path?: string;
59|  mission_paths?: string[];
60|}): Promise<{ ok: true; data: Gate } | { ok: false; error: string }> {
61|  try {
62|    const { xp, aura } = gateRewards(params.gate_rank);
63|    const minRank: HunterRank = params.gate_rank; // gate rank = min hunter rank
64|    const auraCost = gateAuraCost(params.gate_rank);
65|
66|    const result = await query(`
67|      INSERT INTO gates (kingdom_id, title, description, gate_rank, status,
68|                        xp_reward, aura_reward, min_hunter_rank, aura_cost,
69|                        repo_path, mission_paths, opened_at)
70|      VALUES ($1, $2, $3, $4, 'open', $5, $6, $7, $8, $9, $10, now())
71|      RETURNING *
72|    `, [
73|      params.kingdom_id, params.title, params.description ?? null,
74|      params.gate_rank, xp, aura, minRank, auraCost,
75|      params.repo_path ?? null, params.mission_paths ?? null,
76|    ]);
77|
78|    if (!result.rows[0]) return { ok: false, error: "Failed to open gate" };
79|    return { ok: true, data: result.rows[0] };
80|  } catch (e) {
81|    return { ok: false, error: String(e) };
82|  }
83|}
84|
85|// ── ENTER GATE ──
86|// A hunter enters a gate. Costs aura. Creates an attempt record.
87|
88|export async function enterGate(params: {
89|  gate_id: string;
90|  hunter_id: string;
91|}): Promise<{ ok: true; data: GateAttempt } | { ok: false; error: string }> {
92|  try {
93|    // Fetch gate and hunter
94|    const [gateResult, hunterResult] = await Promise.all([
95|      query(`SELECT * FROM gates WHERE id = $1 AND status = 'open'`, [params.gate_id]),
96|      query(`SELECT * FROM hunters WHERE id = $1`, [params.hunter_id]),
97|    ]);
98|
99|    const gate = gateResult.rows[0];
100|    const hunter = hunterResult.rows[0];
101|
102|    if (!gate) return { ok: false, error: "Gate not found or not open" };
103|    if (!hunter) return { ok: false, error: "Hunter not found" };
104|
105|    // Check rank requirement
106|    if (!canEnterGate(hunter.rank, gate.min_hunter_rank)) {
107|      return { ok: false, error: `Hunter rank ${hunter.rank} too low. Gate requires ${gate.min_hunter_rank}+` };
108|    }
109|
110|    // Check aura
111|    if (hunter.aura_current < gate.aura_cost) {
112|      return { ok: false, error: `Insufficient aura. Need ${gate.aura_cost}, have ${hunter.aura_current}` };
113|    }
114|
115|    // Spend aura
116|    const newAura = hunter.aura_current - gate.aura_cost;
117|    await query(`UPDATE hunters SET aura_current = $1, gates_entered = gates_entered + 1, last_gate_at = now(), updated_at = now() WHERE id = $2`,
118|      [newAura, params.hunter_id]);
119|
120|    // Log aura spend
121|    await query(`INSERT INTO aura_log (hunter_id, delta, reason, gate_id, balance_after) VALUES ($1, $2, 'gate_enter', $3, $4)`,
122|      [params.hunter_id, -gate.aura_cost, params.gate_id, newAura]);
123|
124|    // Create attempt
125|    const attempt = await query(`
126|      INSERT INTO gate_attempts (gate_id, hunter_id, status, aura_spent)
127|      VALUES ($1, $2, 'open', $3)
128|      RETURNING *
129|    `, [params.gate_id, params.hunter_id, gate.aura_cost]);
130|
131|    if (!attempt.rows[0]) return { ok: false, error: "Failed to create attempt" };
132|    return { ok: true, data: attempt.rows[0] };
133|  } catch (e) {
134|    return { ok: false, error: String(e) };
135|  }
136|}
137|
138|// ── CLEAR GATE ──
139|// Hunter successfully completed the gate. Grant XP, aura, and log everything.
140|
141|export async function clearGate(params: {
142|  attempt_id: string;
143|  commits_made?: string[];
144|  files_changed?: number;
145|  findings_fixed?: number;
146|  report?: string;
147|}): Promise<{
148|  ok: true;
149|  data: { attempt: GateAttempt; leveled_up: boolean; new_rank: HunterRank; new_level: number };
150|} | { ok: false; error: string }> {
151|  try {
152|    // Fetch attempt
153|    const attemptRes = await query(`SELECT * FROM gate_attempts WHERE id = $1 AND status = 'open'`, [params.attempt_id]);
154|    const attempt = attemptRes.rows[0];
155|    if (!attempt) return { ok: false, error: "Attempt not found or already completed" };
156|
157|    // Fetch gate
158|    const gateRes = await query(`SELECT * FROM gates WHERE id = $1`, [attempt.gate_id]);
159|    const gate = gateRes.rows[0];
160|    if (!gate) return { ok: false, error: "Gate not found" };
161|
162|    // Grant XP via the database function
163|    const xpResult = await query(
164|      `SELECT * FROM grant_xp($1, $2, $3)`, [attempt.hunter_id, gate.xp_reward, gate.id]
165|    );
166|    const xpRow = xpResult.rows[0];
167|
168|    // Grant aura
169|    const auraResult = await query(
170|      `UPDATE hunters SET aura_current = LEAST(aura_max, aura_current + $1), gates_cleared = gates_cleared + 1, updated_at = now() WHERE id = $2 RETURNING *`,
171|      [gate.aura_reward, attempt.hunter_id]
172|    );
173|    const hunter = auraResult.rows[0];
174|
175|    // Log aura gain
176|    if (hunter) {
177|      await query(`INSERT INTO aura_log (hunter_id, delta, reason, gate_id, balance_after) VALUES ($1, $2, 'gate_clear', $3, $4)`,
178|        [attempt.hunter_id, gate.aura_reward, gate.id, hunter.aura_current]);
179|    }
180|
181|    // Update attempt
182|    const completedRes = await query(`
183|      UPDATE gate_attempts SET
184|        status = 'cleared', xp_gained = $1, aura_gained = $2,
185|        commits_made = $3, files_changed = $4, findings_fixed = $5,
186|        report = $6, completed_at = now(),
187|        duration_seconds = EXTRACT(EPOCH FROM (now() - started_at))
188|      WHERE id = $7 RETURNING *
189|    `, [gate.xp_reward, gate.aura_reward, params.commits_made ?? [],
190|        params.files_changed ?? 0, params.findings_fixed ?? 0,
191|        params.report ?? null, params.attempt_id]);
192|
193|    // Update gate status
194|    await query(`UPDATE gates SET status = 'cleared', cleared_at = now(), updated_at = now() WHERE id = $1`, [gate.id]);
195|
196|    return {
197|      ok: true,
198|      data: {
199|        attempt: completedRes.rows[0],
200|        leveled_up: xpRow?.leveled_up ?? false,
201|        new_rank: xpRow?.new_rank ?? 'E',
202|        new_level: xpRow?.new_level ?? 1,
203|      },
204|    };
205|  } catch (e) {
206|    return { ok: false, error: String(e) };
207|  }
208|}
209|
210|// ── FAIL GATE ──
211|// Hunter failed the gate. No XP, but aura was already spent.
212|
213|export async function failGate(params: {
214|  attempt_id: string;
215|  report?: string;
216|}): Promise<{ ok: true; data: GateAttempt } | { ok: false; error: string }> {
217|  try {
218|    const attemptRes = await query(`SELECT * FROM gate_attempts WHERE id = $1 AND status = 'open'`, [params.attempt_id]);
219|    const attempt = attemptRes.rows[0];
220|    if (!attempt) return { ok: false, error: "Attempt not found or already completed" };
221|
222|    await query(`UPDATE hunters SET gates_failed = gates_failed + 1, updated_at = now() WHERE id = $1`, [attempt.hunter_id]);
223|
224|    const result = await query(`
225|      UPDATE gate_attempts SET status = 'failed', report = $1, completed_at = now(),
226|        duration_seconds = EXTRACT(EPOCH FROM (now() - started_at))
227|      WHERE id = $2 RETURNING *
228|    `, [params.report ?? null, params.attempt_id]);
229|
230|    await query(`UPDATE gates SET status = 'failed', failed_at = now(), updated_at = now() WHERE id = $1`, [attempt.gate_id]);
231|
232|    if (!result.rows[0]) return { ok: false, error: "Failed to update attempt" };
233|    return { ok: true, data: result.rows[0] };
234|  } catch (e) {
235|    return { ok: false, error: String(e) };
236|  }
237|}
238|
239|// ── GET HUNTER STATS ──
240|// Full hunter profile with computed stats.
241|
242|export async function getHunterStats(hunterId: string): Promise<{
243|  ok: true; data: Hunter & { clear_rate: number; total_aura_spent: number }
244|} | { ok: false; error: string }> {
245|  try {
246|    const result = await query(`
247|      SELECT h.*,
248|        CASE WHEN h.gates_entered > 0
249|          THEN ROUND(h.gates_cleared::numeric / h.gates_entered, 2)
250|          ELSE 0
251|        END as clear_rate,
252|        COALESCE(SUM(al.delta) FILTER (WHERE al.delta < 0), 0) * -1 as total_aura_spent
253|      FROM hunters h
254|      LEFT JOIN aura_log al ON al.hunter_id = h.id
255|      WHERE h.id = $1
256|      GROUP BY h.id
257|    `, [hunterId]);
258|
259|    if (!result.rows[0]) return { ok: false, error: "Hunter not found" };
260|    return { ok: true, data: result.rows[0] };
261|  } catch (e) {
262|    return { ok: false, error: String(e) };
263|  }
264|}
265|
266|// ── LIST OPEN GATES ──
267|// Gates available for a hunter to enter, sorted by rank.
268|
269|export async function listOpenGates(hunterRank?: HunterRank): Promise<Gate[]> {
270|  const rankVal = hunterRank ? rankFromLevel(0) : 0; // unused but kept for type
271|  const result = await query(`
272|    SELECT * FROM gates WHERE status = 'open'
273|    ORDER BY gate_rank DESC, created_at DESC
274|  `);
275|  return result.rows;
276|}