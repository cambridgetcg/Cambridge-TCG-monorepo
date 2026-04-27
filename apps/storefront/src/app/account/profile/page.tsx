"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type {
  PublicProfile,
  ShowcaseCard,
  WishlistItem,
} from "@/lib/social/types";

interface PortfolioCard {
  id: string;
  card_name: string;
  image_url: string | null;
  set_name: string | null;
}

export default function EditProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [authed, setAuthed] = useState(true);

  // Profile fields
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  // Showcase
  const [showcase, setShowcase] = useState<ShowcaseCard[]>([]);
  const [portfolioCards, setPortfolioCards] = useState<PortfolioCard[]>([]);
  const [showcaseAddId, setShowcaseAddId] = useState("");
  const [showcaseCaption, setShowcaseCaption] = useState("");

  // Wishlist
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [wlCardName, setWlCardName] = useState("");
  const [wlSku, setWlSku] = useState("");
  const [wlMaxPrice, setWlMaxPrice] = useState("");
  const [wlCondition, setWlCondition] = useState("NM");

  // Validation
  const [usernameError, setUsernameError] = useState("");

  const usernameRegex = /^[a-z0-9_]{1,30}$/;

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/session").then((r) => r.json()),
      fetch("/api/social/profile?user=me").then((r) => {
        if (r.status === 401) throw new Error("unauth");
        return r.json();
      }),
      fetch("/api/portfolio/cards")
        .then((r) => r.json())
        .catch(() => ({ cards: [] })),
    ])
      .then(([session, data, portfolio]) => {
        if (!session?.user?.email) {
          setAuthed(false);
          return;
        }
        const p = data.profile as PublicProfile;
        setProfile(p);
        setUsername(p.username ?? "");
        setBio(p.bio ?? "");
        setIsPublic(p.is_public);
        setShowcase(data.showcase ?? []);
        setWishlist(data.wishlist ?? []);
        setPortfolioCards(portfolio.cards ?? []);
      })
      .catch(() => setAuthed(false))
      .finally(() => setLoading(false));
  }, []);

  function validateUsername(val: string) {
    if (!val) {
      setUsernameError("Username is required");
    } else if (!usernameRegex.test(val)) {
      setUsernameError("Only lowercase letters, numbers, and underscores");
    } else {
      setUsernameError("");
    }
  }

  async function handleSave() {
    if (usernameError || !username) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/social/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, bio, is_public: isPublic }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {}
    setSaving(false);
  }

  async function addShowcaseCard() {
    if (!showcaseAddId) return;
    try {
      const res = await fetch("/api/social/showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioCardId: showcaseAddId,
          caption: showcaseCaption || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.card) setShowcase((prev) => [...prev, data.card]);
        setShowcaseAddId("");
        setShowcaseCaption("");
      }
    } catch {}
  }

  async function removeShowcaseCard(portfolioCardId: string) {
    try {
      const res = await fetch("/api/social/showcase", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolioCardId }),
      });
      if (res.ok) {
        setShowcase((prev) =>
          prev.filter((c) => c.portfolio_card_id !== portfolioCardId)
        );
      }
    } catch {}
  }

  async function addWishlistItem() {
    if (!wlCardName) return;
    try {
      const res = await fetch("/api/social/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: wlSku || null,
          cardName: wlCardName,
          maxPrice: wlMaxPrice || null,
          conditionMin: wlCondition,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.item) setWishlist((prev) => [...prev, data.item]);
        setWlCardName("");
        setWlSku("");
        setWlMaxPrice("");
        setWlCondition("NM");
      }
    } catch {}
  }

  async function removeWishlistItem(itemId: string) {
    try {
      const res = await fetch("/api/social/wishlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      if (res.ok) {
        setWishlist((prev) => prev.filter((w) => w.id !== itemId));
      }
    } catch {}
  }

  const moveShowcase = useCallback(
    (idx: number, dir: -1 | 1) => {
      const next = idx + dir;
      if (next < 0 || next >= showcase.length) return;
      const copy = [...showcase];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      setShowcase(copy);
    },
    [showcase]
  );

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="text-center py-16">
        <p className="text-neutral-400 mb-4">Sign in to edit your profile.</p>
        <Link
          href="/login"
          className="px-5 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm hover:bg-amber-400 transition"
        >
          Sign In
        </Link>
      </div>
    );
  }

  const tierColor = profile?.tier_color ?? "#f59e0b";
  const initial = (profile?.name ?? username ?? "?")[0]?.toUpperCase() ?? "?";

  // Available portfolio cards not already in showcase
  const availableCards = portfolioCards.filter(
    (pc) => !showcase.some((sc) => sc.portfolio_card_id === pc.id)
  );

  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-6">Edit Profile</h1>

      {/* Username */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-neutral-400 mb-1.5">
          Username
        </label>
        <input
          type="text"
          value={username}
          onChange={(e) => {
            const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
            setUsername(v);
            validateUsername(v);
          }}
          maxLength={30}
          className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
          placeholder="your_username"
        />
        {usernameError && (
          <p className="text-red-400 text-xs mt-1">{usernameError}</p>
        )}
      </div>

      {/* Bio */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-neutral-400 mb-1.5">
          Bio
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 200))}
          maxLength={200}
          rows={3}
          className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500 resize-none"
          placeholder="Tell collectors about yourself..."
        />
        <p className="text-neutral-600 text-xs mt-1">{bio.length}/200</p>
      </div>

      {/* Public/Private */}
      <div className="mb-8">
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            type="button"
            onClick={() => setIsPublic(!isPublic)}
            className={`relative w-10 h-6 rounded-full transition ${
              isPublic ? "bg-amber-500" : "bg-neutral-700"
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                isPublic ? "left-[18px]" : "left-0.5"
              }`}
            />
          </button>
          <span className="text-sm text-neutral-300">
            {isPublic ? "Public profile" : "Private profile"}
          </span>
        </label>
      </div>

      {/* Showcase Management */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-white mb-3">Showcase</h2>
        {showcase.length > 0 && (
          <div className="space-y-2 mb-4">
            {showcase.map((card, i) => (
              <div
                key={card.id}
                className="flex items-center gap-3 bg-neutral-900 rounded-lg p-2 border border-neutral-800"
              >
                {card.image_url ? (
                  <img
                    src={card.image_url}
                    alt=""
                    className="w-8 h-11 object-cover rounded"
                  />
                ) : (
                  <div className="w-8 h-11 bg-neutral-800 rounded" />
                )}
                <span className="flex-1 text-white text-sm truncate">
                  {card.card_name}
                  {card.caption && (
                    <span className="text-neutral-500 ml-2 italic">
                      &mdash; {card.caption}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => moveShowcase(i, -1)}
                  disabled={i === 0}
                  className="text-neutral-500 hover:text-white disabled:opacity-20 text-xs"
                >
                  Up
                </button>
                <button
                  onClick={() => moveShowcase(i, 1)}
                  disabled={i === showcase.length - 1}
                  className="text-neutral-500 hover:text-white disabled:opacity-20 text-xs"
                >
                  Dn
                </button>
                <button
                  onClick={() => removeShowcaseCard(card.portfolio_card_id)}
                  className="text-red-400 hover:text-red-300 text-xs font-bold"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        {availableCards.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={showcaseAddId}
              onChange={(e) => setShowcaseAddId(e.target.value)}
              className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
            >
              <option value="">Select a card...</option>
              {availableCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.card_name} {c.set_name ? `(${c.set_name})` : ""}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={showcaseCaption}
              onChange={(e) => setShowcaseCaption(e.target.value)}
              placeholder="Caption (optional)"
              className="sm:w-48 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={addShowcaseCard}
              disabled={!showcaseAddId}
              className="px-4 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 disabled:opacity-40 transition"
            >
              Add
            </button>
          </div>
        )}
      </section>

      {/* Wishlist Management */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-white mb-3">Wishlist</h2>
        {wishlist.length > 0 && (
          <div className="space-y-2 mb-4">
            {wishlist.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 bg-neutral-900 rounded-lg p-2 border border-neutral-800"
              >
                <span className="flex-1 text-white text-sm truncate">
                  {item.card_name}
                  {item.max_price && (
                    <span className="text-neutral-500 ml-2">
                      Max: ${item.max_price}
                    </span>
                  )}
                  <span className="text-neutral-600 ml-2">{item.condition_min}</span>
                </span>
                <button
                  onClick={() => removeWishlistItem(item.id)}
                  className="text-red-400 hover:text-red-300 text-xs font-bold"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={wlCardName}
            onChange={(e) => setWlCardName(e.target.value)}
            placeholder="Card name"
            className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
          />
          <input
            type="text"
            value={wlSku}
            onChange={(e) => setWlSku(e.target.value)}
            placeholder="SKU (optional)"
            className="sm:w-32 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
          />
          <input
            type="text"
            value={wlMaxPrice}
            onChange={(e) => setWlMaxPrice(e.target.value)}
            placeholder="Max $"
            className="sm:w-24 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
          />
          <select
            value={wlCondition}
            onChange={(e) => setWlCondition(e.target.value)}
            className="sm:w-24 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
          >
            <option value="NM">NM</option>
            <option value="LP">LP</option>
            <option value="MP">MP</option>
            <option value="HP">HP</option>
            <option value="DMG">DMG</option>
          </select>
          <button
            onClick={addWishlistItem}
            disabled={!wlCardName}
            className="px-4 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 disabled:opacity-40 transition"
          >
            Add
          </button>
        </div>
      </section>

      {/* Preview */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-white mb-3">Preview</h2>
        <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6">
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-black"
              style={{
                background: profile?.avatar_url
                  ? `url(${profile.avatar_url}) center/cover`
                  : "rgb(38,38,38)",
                boxShadow: `0 0 0 3px ${tierColor}`,
              }}
            >
              {!profile?.avatar_url && (
                <span style={{ color: tierColor }}>{initial}</span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-bold">
                  {profile?.name ?? username}
                </span>
                {profile?.tier_name && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                    style={{
                      background: `${tierColor}20`,
                      color: tierColor,
                    }}
                  >
                    {profile.tier_icon} {profile.tier_name}
                  </span>
                )}
              </div>
              <p className="text-neutral-500 text-sm">@{username || "username"}</p>
              {bio && (
                <p className="text-neutral-400 text-sm mt-1">{bio}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving || !!usernameError}
          className="px-6 py-2.5 bg-amber-500 text-black font-bold rounded-lg text-sm hover:bg-amber-400 disabled:opacity-40 transition"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
        {saved && (
          <span className="text-emerald-400 text-sm font-medium">
            Profile saved!
          </span>
        )}
      </div>
    </div>
  );
}
