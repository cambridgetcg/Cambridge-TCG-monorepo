"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  Raffle,
  RaffleEntry,
  RaffleStatus,
  MysteryBox,
  MysteryBoxReward,
  MysteryBoxStatus,
} from "@/lib/rewards/types";
import { REWARD_TYPES, RARITY_COLORS } from "@/lib/rewards/types";
import AdminShell from "@/components/admin/AdminShell";

import { Audience } from "@/lib/ui";
// ── Status colors ──

const RAFFLE_STATUS_COLORS: Record<RaffleStatus, string> = {
  draft: "bg-neutral-500/20 text-ink-muted",
  active: "bg-emerald-500/20 text-secondary",
  drawing: "bg-accent/20 text-accent-strong",
  completed: "bg-blue-500/20 text-blue-400",
  cancelled: "bg-danger/20 text-red-400",
};

const BOX_STATUS_COLORS: Record<MysteryBoxStatus, string> = {
  draft: "bg-neutral-500/20 text-ink-muted",
  active: "bg-emerald-500/20 text-secondary",
  paused: "bg-accent/20 text-accent-strong",
  retired: "bg-danger/20 text-red-400",
};

// ── Helpers ──

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalDatetime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const INPUT =
  "w-full px-3 py-2 bg-surface-elevated border border-border-strong rounded-lg text-sm text-ink placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-accent/50";
const LABEL = "text-xs text-ink-muted mb-1 block";

// ── Component ──

export default function AdminRewardsPage() {
  // Tabs
  const [tab, setTab] = useState<"raffles" | "boxes">("raffles");

  // Raffles
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [raffleLoading, setRaffleLoading] = useState(false);
  const [raffleExpanded, setRaffleExpanded] = useState<string | null>(null);
  const [raffleEntries, setRaffleEntries] = useState<Record<string, RaffleEntry[]>>({});
  const [raffleActioning, setRaffleActioning] = useState<string | null>(null);
  const [showNewRaffle, setShowNewRaffle] = useState(false);
  const [newRaffle, setNewRaffle] = useState({
    title: "",
    description: "",
    entry_cost_points: 100,
    max_entries_per_user: 10,
    prize_description: "",
    prize_value: "",
    prize_type: "physical",
    starts_at: "",
    ends_at: "",
    draw_at: "",
  });
  const [creatingRaffle, setCreatingRaffle] = useState(false);

  // Mystery Boxes
  const [boxes, setBoxes] = useState<MysteryBox[]>([]);
  const [boxLoading, setBoxLoading] = useState(false);
  const [boxExpanded, setBoxExpanded] = useState<string | null>(null);
  const [boxActioning, setBoxActioning] = useState<string | null>(null);
  const [showNewBox, setShowNewBox] = useState(false);
  const [newBox, setNewBox] = useState({
    title: "",
    description: "",
    cost_points: 100,
    max_opens_per_user: 5,
  });
  const [creatingBox, setCreatingBox] = useState(false);

  // Add reward form state per box
  const [addRewardForm, setAddRewardForm] = useState<
    Record<
      string,
      {
        name: string;
        reward_type: string;
        reward_value: string;
        probability: string;
        rarity: string;
        stock: string;
      }
    >
  >({});

  // ── Raffles fetch ──

  const fetchRaffles = useCallback(async () => {
    setRaffleLoading(true);
    try {
      const res = await fetch("/api/rewards/raffles?admin=true");
      if (res.ok) {
        const data = await res.json();
        setRaffles(data.raffles || []);
      }
    } catch {
      // ignore
    } finally {
      setRaffleLoading(false);
    }
  }, []);

  const fetchEntries = useCallback(async (raffleId: string) => {
    try {
      const res = await fetch(`/api/rewards/raffles/${raffleId}/draw`);
      if (res.ok) {
        const data = await res.json();
        setRaffleEntries((prev) => ({ ...prev, [raffleId]: data.entries || [] }));
      }
    } catch {
      // ignore
    }
  }, []);

  // ── Boxes fetch ──

  const fetchBoxes = useCallback(async () => {
    setBoxLoading(true);
    try {
      const res = await fetch("/api/rewards/mystery-boxes?admin=true");
      if (!res.ok) return;
      const data = await res.json();
      setBoxes(data.boxes || []);
    } catch {
      // ignore
    } finally {
      setBoxLoading(false);
    }
  }, []);

  // Auto-fetch on tab change
  useEffect(() => {
    if (tab === "raffles") fetchRaffles();
    else fetchBoxes();
  }, [tab, fetchRaffles, fetchBoxes]);

  // Fetch entries when raffle expanded
  useEffect(() => {
    if (raffleExpanded) fetchEntries(raffleExpanded);
  }, [raffleExpanded, fetchEntries]);

  // ── Raffle actions ──

  async function createRaffle(e: React.FormEvent) {
    e.preventDefault();
    setCreatingRaffle(true);
    try {
      const res = await fetch("/api/rewards/raffles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRaffle),
      });
      if (res.ok) {
        setShowNewRaffle(false);
        setNewRaffle({
          title: "",
          description: "",
          entry_cost_points: 100,
          max_entries_per_user: 10,
          prize_description: "",
          prize_value: "",
          prize_type: "physical",
          starts_at: "",
          ends_at: "",
          draw_at: "",
        });
        fetchRaffles();
      }
    } catch {
      // ignore
    } finally {
      setCreatingRaffle(false);
    }
  }

  async function raffleAction(id: string, action: "activate" | "draw" | "cancel") {
    setRaffleActioning(id);
    try {
      const res = await fetch(`/api/rewards/raffles/${id}/draw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) fetchRaffles();
    } catch {
      // ignore
    } finally {
      setRaffleActioning(null);
    }
  }

  // ── Box actions ──

  async function createBox(e: React.FormEvent) {
    e.preventDefault();
    setCreatingBox(true);
    try {
      const res = await fetch("/api/rewards/mystery-boxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newBox),
      });
      if (res.ok) {
        setShowNewBox(false);
        setNewBox({ title: "", description: "", cost_points: 100, max_opens_per_user: 5 });
        fetchBoxes();
      }
    } catch {
      // ignore
    } finally {
      setCreatingBox(false);
    }
  }

  async function updateBoxStatus(id: string, status: MysteryBoxStatus) {
    setBoxActioning(id);
    try {
      const res = await fetch(`/api/rewards/mystery-boxes/${id}/rewards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_status", status }),
      });
      if (res.ok) fetchBoxes();
    } catch {
      // ignore
    } finally {
      setBoxActioning(null);
    }
  }

  async function addReward(boxId: string) {
    const form = addRewardForm[boxId];
    if (!form?.name || !form?.reward_value || !form?.probability) return;
    setBoxActioning(boxId);
    try {
      const res = await fetch(`/api/rewards/mystery-boxes/${boxId}/rewards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_reward",
          name: form.name,
          reward_type: form.reward_type || "points",
          reward_value: form.reward_value,
          probability: parseFloat(form.probability),
          rarity: form.rarity || "common",
          stock: form.stock ? parseInt(form.stock) : null,
        }),
      });
      if (res.ok) {
        setAddRewardForm((prev) => ({
          ...prev,
          [boxId]: { name: "", reward_type: "points", reward_value: "", probability: "", rarity: "common", stock: "" },
        }));
        fetchBoxes();
      }
    } catch {
      // ignore
    } finally {
      setBoxActioning(null);
    }
  }

  async function removeReward(boxId: string, rewardId: string) {
    setBoxActioning(boxId);
    try {
      const res = await fetch(`/api/rewards/mystery-boxes/${boxId}/rewards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_reward", rewardId }),
      });
      if (res.ok) fetchBoxes();
    } catch {
      // ignore
    } finally {
      setBoxActioning(null);
    }
  }

  // ── Stats ──

  const raffleTotal = raffles.length;
  const raffleActive = raffles.filter((r) => r.status === "active").length;
  const raffleCompleted = raffles.filter((r) => r.status === "completed").length;

  const boxTotal = boxes.length;
  const boxActive = boxes.filter((b) => b.status === "active").length;
  const boxTotalOpens = boxes.reduce((s, b) => s + (b.total_opens || 0), 0);

  // ── Render ──

  return (
    <AdminShell
      title="Rewards Management"
      authProbe="/api/rewards/raffles?admin=true"
    >
      <Audience kind="operator" />
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-8 bg-surface rounded-xl p-1 w-fit">
          <button
            onClick={() => setTab("raffles")}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition ${
              tab === "raffles"
                ? "bg-accent text-black"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            Raffles
          </button>
          <button
            onClick={() => setTab("boxes")}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition ${
              tab === "boxes"
                ? "bg-accent text-black"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            Mystery Boxes
          </button>
        </div>

        {/* ════════════════════════════════════ RAFFLES TAB ════════════════════════════════════ */}
        {tab === "raffles" && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-surface rounded-xl p-4">
                <p className="text-xs text-ink-faint uppercase tracking-wide">Total</p>
                <p className="text-2xl font-bold text-ink mt-1">{raffleTotal}</p>
              </div>
              <div className="bg-surface rounded-xl p-4">
                <p className="text-xs text-ink-faint uppercase tracking-wide">Active</p>
                <p className="text-2xl font-bold text-secondary mt-1">{raffleActive}</p>
              </div>
              <div className="bg-surface rounded-xl p-4">
                <p className="text-xs text-ink-faint uppercase tracking-wide">Completed</p>
                <p className="text-2xl font-bold text-blue-400 mt-1">{raffleCompleted}</p>
              </div>
            </div>

            {/* Actions row */}
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={fetchRaffles}
                disabled={raffleLoading}
                className="px-4 py-2 bg-surface-elevated text-ink text-sm rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
              >
                {raffleLoading ? "Loading..." : "Refresh"}
              </button>
              <button
                onClick={() => setShowNewRaffle(!showNewRaffle)}
                className="px-4 py-2 bg-accent text-black text-sm font-bold rounded-lg hover:bg-accent-strong transition"
              >
                {showNewRaffle ? "Cancel" : "New Raffle"}
              </button>
            </div>

            {/* New Raffle Form */}
            {showNewRaffle && (
              <form onSubmit={createRaffle} className="bg-surface rounded-xl p-6 mb-6 space-y-4">
                <h3 className="text-sm font-bold text-ink mb-2">Create Raffle</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL}>Title *</label>
                    <input
                      className={INPUT}
                      required
                      value={newRaffle.title}
                      onChange={(e) => setNewRaffle((p) => ({ ...p, title: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Prize Type</label>
                    <select
                      className={INPUT}
                      value={newRaffle.prize_type}
                      onChange={(e) => setNewRaffle((p) => ({ ...p, prize_type: e.target.value }))}
                    >
                      <option value="physical">Physical Card/Product</option>
                      <option value="credit">Store Credit</option>
                      <option value="points">Bonus Berries</option>
                      <option value="discount">Discount Code</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className={LABEL}>Description</label>
                    <textarea
                      className={INPUT + " h-20 resize-none"}
                      value={newRaffle.description}
                      onChange={(e) => setNewRaffle((p) => ({ ...p, description: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Entry Cost (points) *</label>
                    <input
                      type="number"
                      className={INPUT}
                      required
                      min={1}
                      value={newRaffle.entry_cost_points}
                      onChange={(e) =>
                        setNewRaffle((p) => ({ ...p, entry_cost_points: parseInt(e.target.value) || 0 }))
                      }
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Max Entries Per User</label>
                    <input
                      type="number"
                      className={INPUT}
                      min={1}
                      value={newRaffle.max_entries_per_user}
                      onChange={(e) =>
                        setNewRaffle((p) => ({ ...p, max_entries_per_user: parseInt(e.target.value) || 1 }))
                      }
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Prize Description *</label>
                    <input
                      className={INPUT}
                      required
                      value={newRaffle.prize_description}
                      onChange={(e) => setNewRaffle((p) => ({ ...p, prize_description: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Prize Value</label>
                    <input
                      className={INPUT}
                      placeholder="e.g. 50.00"
                      value={newRaffle.prize_value}
                      onChange={(e) => setNewRaffle((p) => ({ ...p, prize_value: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Start Date *</label>
                    <input
                      type="datetime-local"
                      className={INPUT}
                      required
                      value={newRaffle.starts_at}
                      onChange={(e) => setNewRaffle((p) => ({ ...p, starts_at: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>End Date *</label>
                    <input
                      type="datetime-local"
                      className={INPUT}
                      required
                      value={newRaffle.ends_at}
                      onChange={(e) => setNewRaffle((p) => ({ ...p, ends_at: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Draw Date *</label>
                    <input
                      type="datetime-local"
                      className={INPUT}
                      required
                      value={newRaffle.draw_at}
                      onChange={(e) => setNewRaffle((p) => ({ ...p, draw_at: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={creatingRaffle}
                    className="px-6 py-2 bg-accent text-black text-sm font-bold rounded-lg hover:bg-accent-strong transition disabled:opacity-50"
                  >
                    {creatingRaffle ? "Creating..." : "Create Raffle"}
                  </button>
                </div>
              </form>
            )}

            {/* Raffle list */}
            {raffles.length === 0 && !raffleLoading && (
              <p className="text-ink-faint text-center py-12">No raffles yet.</p>
            )}

            <div className="space-y-3">
              {raffles.map((r) => (
                <div key={r.id} className="bg-surface rounded-xl overflow-hidden">
                  {/* Row */}
                  <button
                    onClick={() => setRaffleExpanded(raffleExpanded === r.id ? null : r.id)}
                    className="w-full px-4 py-4 flex items-center gap-4 text-left hover:bg-surface-elevated/50 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-bold text-ink truncate">{r.title}</span>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            RAFFLE_STATUS_COLORS[r.status] || "bg-neutral-700 text-ink-muted"
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>
                      <p className="text-xs text-ink-faint mt-1">
                        {r.total_entries} entr{r.total_entries !== 1 ? "ies" : "y"}
                        {r.prize_value ? ` \u00b7 Prize: \u00a3${r.prize_value}` : ""}
                        {" \u00b7 Draw: "}
                        {fmtDate(r.draw_at)}
                      </p>
                    </div>
                    <span className="text-neutral-600 text-sm">
                      {raffleExpanded === r.id ? "\u25b2" : "\u25bc"}
                    </span>
                  </button>

                  {/* Expanded */}
                  {raffleExpanded === r.id && (
                    <div className="px-4 pb-4 border-t border-border-subtle">
                      {/* Details grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 mb-4 text-sm">
                        <div>
                          <span className="text-ink-faint">Entry Cost</span>
                          <p className="text-ink">{r.entry_cost_points} Berries</p>
                        </div>
                        <div>
                          <span className="text-ink-faint">Max/User</span>
                          <p className="text-ink">{r.max_entries_per_user}</p>
                        </div>
                        <div>
                          <span className="text-ink-faint">Prize</span>
                          <p className="text-ink">{r.prize_description}</p>
                        </div>
                        <div>
                          <span className="text-ink-faint">Prize Type</span>
                          <p className="text-ink">{r.prize_type}</p>
                        </div>
                        <div>
                          <span className="text-ink-faint">Starts</span>
                          <p className="text-ink">{fmtDate(r.starts_at)}</p>
                        </div>
                        <div>
                          <span className="text-ink-faint">Ends</span>
                          <p className="text-ink">{fmtDate(r.ends_at)}</p>
                        </div>
                        <div>
                          <span className="text-ink-faint">Draw</span>
                          <p className="text-ink">{fmtDate(r.draw_at)}</p>
                        </div>
                        {r.winner_name && (
                          <div>
                            <span className="text-ink-faint">Winner</span>
                            <p className="text-secondary font-medium">{r.winner_name}</p>
                          </div>
                        )}
                      </div>

                      {r.description && (
                        <p className="text-sm text-ink-muted mb-4">{r.description}</p>
                      )}

                      {/* Entry list */}
                      {raffleEntries[r.id] && raffleEntries[r.id].length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-xs text-ink-faint uppercase tracking-wide mb-2">
                            Entries ({raffleEntries[r.id].length})
                          </h4>
                          <div className="bg-surface-elevated/50 rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-ink-faint text-xs">
                                  <th className="text-left px-3 py-2">User</th>
                                  <th className="text-left px-3 py-2">Entries</th>
                                  <th className="text-left px-3 py-2">Berries Spent</th>
                                  <th className="text-left px-3 py-2">Date</th>
                                </tr>
                              </thead>
                              <tbody>
                                {raffleEntries[r.id].map((entry) => (
                                  <tr
                                    key={entry.id}
                                    className="border-t border-border-strong/50 text-ink-muted"
                                  >
                                    <td className="px-3 py-2">{entry.user_name || entry.user_id.slice(0, 8)}</td>
                                    <td className="px-3 py-2">{entry.entry_count}</td>
                                    <td className="px-3 py-2">{entry.points_spent}</td>
                                    <td className="px-3 py-2">{fmtDate(entry.created_at)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {raffleEntries[r.id] && raffleEntries[r.id].length === 0 && (
                        <p className="text-xs text-neutral-600 mb-4">No entries yet.</p>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {r.status === "draft" && (
                          <button
                            onClick={() => raffleAction(r.id, "activate")}
                            disabled={raffleActioning === r.id}
                            className="px-4 py-2 bg-emerald-600 text-ink text-sm font-bold rounded-lg hover:bg-emerald-500 transition disabled:opacity-50"
                          >
                            {raffleActioning === r.id ? "..." : "Activate"}
                          </button>
                        )}
                        {r.status === "active" && (
                          <button
                            onClick={() => raffleAction(r.id, "draw")}
                            disabled={raffleActioning === r.id}
                            className="px-4 py-2 bg-amber-600 text-ink text-sm font-bold rounded-lg hover:bg-accent transition disabled:opacity-50"
                          >
                            {raffleActioning === r.id ? "..." : "Draw Winner"}
                          </button>
                        )}
                        {(r.status === "draft" || r.status === "active") && (
                          <button
                            onClick={() => raffleAction(r.id, "cancel")}
                            disabled={raffleActioning === r.id}
                            className="px-4 py-2 bg-danger/20 text-red-400 text-sm font-bold rounded-lg hover:bg-danger/30 transition disabled:opacity-50"
                          >
                            {raffleActioning === r.id ? "..." : "Cancel"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ════════════════════════════════════ MYSTERY BOXES TAB ════════════════════════════════════ */}
        {tab === "boxes" && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-surface rounded-xl p-4">
                <p className="text-xs text-ink-faint uppercase tracking-wide">Total</p>
                <p className="text-2xl font-bold text-ink mt-1">{boxTotal}</p>
              </div>
              <div className="bg-surface rounded-xl p-4">
                <p className="text-xs text-ink-faint uppercase tracking-wide">Active</p>
                <p className="text-2xl font-bold text-secondary mt-1">{boxActive}</p>
              </div>
              <div className="bg-surface rounded-xl p-4">
                <p className="text-xs text-ink-faint uppercase tracking-wide">Total Opens</p>
                <p className="text-2xl font-bold text-accent-strong mt-1">{boxTotalOpens}</p>
              </div>
            </div>

            {/* Actions row */}
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={fetchBoxes}
                disabled={boxLoading}
                className="px-4 py-2 bg-surface-elevated text-ink text-sm rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
              >
                {boxLoading ? "Loading..." : "Refresh"}
              </button>
              <button
                onClick={() => setShowNewBox(!showNewBox)}
                className="px-4 py-2 bg-accent text-black text-sm font-bold rounded-lg hover:bg-accent-strong transition"
              >
                {showNewBox ? "Cancel" : "New Mystery Box"}
              </button>
            </div>

            {/* New Box Form */}
            {showNewBox && (
              <form onSubmit={createBox} className="bg-surface rounded-xl p-6 mb-6 space-y-4">
                <h3 className="text-sm font-bold text-ink mb-2">Create Mystery Box</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL}>Title *</label>
                    <input
                      className={INPUT}
                      required
                      value={newBox.title}
                      onChange={(e) => setNewBox((p) => ({ ...p, title: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Cost (points) *</label>
                    <input
                      type="number"
                      className={INPUT}
                      required
                      min={1}
                      value={newBox.cost_points}
                      onChange={(e) => setNewBox((p) => ({ ...p, cost_points: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={LABEL}>Description</label>
                    <textarea
                      className={INPUT + " h-20 resize-none"}
                      value={newBox.description}
                      onChange={(e) => setNewBox((p) => ({ ...p, description: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Max Opens Per User</label>
                    <input
                      type="number"
                      className={INPUT}
                      min={1}
                      value={newBox.max_opens_per_user}
                      onChange={(e) =>
                        setNewBox((p) => ({ ...p, max_opens_per_user: parseInt(e.target.value) || 1 }))
                      }
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={creatingBox}
                    className="px-6 py-2 bg-accent text-black text-sm font-bold rounded-lg hover:bg-accent-strong transition disabled:opacity-50"
                  >
                    {creatingBox ? "Creating..." : "Create Box"}
                  </button>
                </div>
              </form>
            )}

            {/* Box list */}
            {boxes.length === 0 && !boxLoading && (
              <p className="text-ink-faint text-center py-12">No mystery boxes yet.</p>
            )}

            <div className="space-y-3">
              {boxes.map((b) => (
                <div key={b.id} className="bg-surface rounded-xl overflow-hidden">
                  {/* Row */}
                  <button
                    onClick={() => setBoxExpanded(boxExpanded === b.id ? null : b.id)}
                    className="w-full px-4 py-4 flex items-center gap-4 text-left hover:bg-surface-elevated/50 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-bold text-ink truncate">{b.title}</span>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            BOX_STATUS_COLORS[b.status] || "bg-neutral-700 text-ink-muted"
                          }`}
                        >
                          {b.status}
                        </span>
                      </div>
                      <p className="text-xs text-ink-faint mt-1">
                        {b.cost_points} Berries &middot; {b.total_opens} open{b.total_opens !== 1 ? "s" : ""}
                        {" \u00b7 "}
                        {b.rewards?.length || 0} reward{(b.rewards?.length || 0) !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <span className="text-neutral-600 text-sm">
                      {boxExpanded === b.id ? "\u25b2" : "\u25bc"}
                    </span>
                  </button>

                  {/* Expanded */}
                  {boxExpanded === b.id && (
                    <div className="px-4 pb-4 border-t border-border-subtle">
                      {b.description && (
                        <p className="text-sm text-ink-muted mt-4 mb-4">{b.description}</p>
                      )}

                      {/* Reward pool table */}
                      {b.rewards && b.rewards.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-xs text-ink-faint uppercase tracking-wide mb-2">
                            Reward Pool ({b.rewards.length})
                          </h4>
                          <div className="bg-surface-elevated/50 rounded-lg overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-ink-faint text-xs">
                                  <th className="text-left px-3 py-2">Name</th>
                                  <th className="text-left px-3 py-2">Type</th>
                                  <th className="text-left px-3 py-2">Value</th>
                                  <th className="text-left px-3 py-2">Rarity</th>
                                  <th className="text-left px-3 py-2">Prob</th>
                                  <th className="text-left px-3 py-2">Stock</th>
                                  <th className="text-left px-3 py-2">Awarded</th>
                                  <th className="text-left px-3 py-2"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {b.rewards.map((rw) => (
                                  <tr
                                    key={rw.id}
                                    className="border-t border-border-strong/50 text-ink-muted"
                                  >
                                    <td className="px-3 py-2 font-medium text-ink">{rw.name}</td>
                                    <td className="px-3 py-2">{rw.reward_type}</td>
                                    <td className="px-3 py-2">{rw.reward_value}</td>
                                    <td className="px-3 py-2">
                                      <span
                                        className={`text-xs px-2 py-0.5 rounded-full ${
                                          RARITY_COLORS[rw.rarity] || "bg-neutral-700 text-ink-muted"
                                        }`}
                                      >
                                        {rw.rarity}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 font-mono text-xs">
                                      {parseFloat(rw.probability).toFixed(4)}
                                    </td>
                                    <td className="px-3 py-2">
                                      {rw.stock !== null ? rw.stock : "\u221e"}
                                    </td>
                                    <td className="px-3 py-2">{rw.awarded_count}</td>
                                    <td className="px-3 py-2">
                                      <button
                                        onClick={() => removeReward(b.id, rw.id)}
                                        disabled={boxActioning === b.id}
                                        className="text-xs text-red-400 hover:text-red-300 transition disabled:opacity-50"
                                      >
                                        Remove
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {(!b.rewards || b.rewards.length === 0) && (
                        <p className="text-xs text-neutral-600 mt-4 mb-4">No rewards in pool yet.</p>
                      )}

                      {/* Add reward form */}
                      <div className="mb-4 p-4 bg-surface-elevated/30 border border-border-subtle rounded-xl">
                        <h4 className="text-xs text-ink-faint uppercase tracking-wide mb-3">
                          Add Reward
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          <div>
                            <label className={LABEL}>Name *</label>
                            <input
                              className={INPUT}
                              placeholder="Reward name"
                              value={addRewardForm[b.id]?.name || ""}
                              onChange={(e) =>
                                setAddRewardForm((prev) => ({
                                  ...prev,
                                  [b.id]: { ...prev[b.id], name: e.target.value },
                                }))
                              }
                            />
                          </div>
                          <div>
                            <label className={LABEL}>Type</label>
                            <select
                              className={INPUT}
                              value={addRewardForm[b.id]?.reward_type || "points"}
                              onChange={(e) =>
                                setAddRewardForm((prev) => ({
                                  ...prev,
                                  [b.id]: { ...prev[b.id], reward_type: e.target.value },
                                }))
                              }
                            >
                              {REWARD_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={LABEL}>Value *</label>
                            <input
                              className={INPUT}
                              placeholder="e.g. 500 or product-sku"
                              value={addRewardForm[b.id]?.reward_value || ""}
                              onChange={(e) =>
                                setAddRewardForm((prev) => ({
                                  ...prev,
                                  [b.id]: { ...prev[b.id], reward_value: e.target.value },
                                }))
                              }
                            />
                          </div>
                          <div>
                            <label className={LABEL}>Probability (0.0000-1.0000) *</label>
                            <input
                              type="number"
                              className={INPUT}
                              placeholder="0.2500"
                              step="0.0001"
                              min="0"
                              max="1"
                              value={addRewardForm[b.id]?.probability || ""}
                              onChange={(e) =>
                                setAddRewardForm((prev) => ({
                                  ...prev,
                                  [b.id]: { ...prev[b.id], probability: e.target.value },
                                }))
                              }
                            />
                          </div>
                          <div>
                            <label className={LABEL}>Rarity</label>
                            <select
                              className={INPUT}
                              value={addRewardForm[b.id]?.rarity || "common"}
                              onChange={(e) =>
                                setAddRewardForm((prev) => ({
                                  ...prev,
                                  [b.id]: { ...prev[b.id], rarity: e.target.value },
                                }))
                              }
                            >
                              <option value="common">Common</option>
                              <option value="uncommon">Uncommon</option>
                              <option value="rare">Rare</option>
                              <option value="legendary">Legendary</option>
                            </select>
                          </div>
                          <div>
                            <label className={LABEL}>Stock (optional)</label>
                            <input
                              type="number"
                              className={INPUT}
                              placeholder="Unlimited if empty"
                              min="0"
                              value={addRewardForm[b.id]?.stock || ""}
                              onChange={(e) =>
                                setAddRewardForm((prev) => ({
                                  ...prev,
                                  [b.id]: { ...prev[b.id], stock: e.target.value },
                                }))
                              }
                            />
                          </div>
                        </div>
                        <div className="flex justify-end mt-3">
                          <button
                            type="button"
                            onClick={() => addReward(b.id)}
                            disabled={boxActioning === b.id}
                            className="px-4 py-2 bg-accent text-black text-sm font-bold rounded-lg hover:bg-accent-strong transition disabled:opacity-50"
                          >
                            {boxActioning === b.id ? "Adding..." : "Add Reward"}
                          </button>
                        </div>
                      </div>

                      {/* Status toggle buttons */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-ink-faint">Status:</span>
                        {(["draft", "active", "paused", "retired"] as MysteryBoxStatus[]).map((st) => (
                          <button
                            key={st}
                            onClick={() => updateBoxStatus(b.id, st)}
                            disabled={b.status === st || boxActioning === b.id}
                            className={`text-xs px-3 py-1 rounded-full transition ${
                              b.status === st
                                ? BOX_STATUS_COLORS[st] + " font-bold"
                                : "bg-surface-elevated text-ink-muted hover:bg-neutral-700"
                            } disabled:opacity-50`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
    </AdminShell>
  );
}
