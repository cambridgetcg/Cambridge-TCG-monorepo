"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Audience, EmptyState } from "@/lib/ui";
import type {
  PublicProfile,
  ShowcaseCard,
  WishlistItem,
} from "@/lib/social/types";
import {
  PERSON_PUBLICATION_NOTICE,
  PERSON_PUBLICATION_NOTICE_PATH,
  PERSON_PUBLICATION_NOTICE_VERSION,
} from "@/lib/social/publication";

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
  const [isPublic, setIsPublic] = useState(false);
  const [acceptsMessages, setAcceptsMessages] = useState(false);
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

  // Preferences (Wave 1.1 — pronouns + preferred_address; Wave 2 — response_window_hours).
  const [pronouns, setPronouns] = useState("");
  const [preferredAddress, setPreferredAddress] = useState("");
  const [responseWindowHours, setResponseWindowHours] = useState<string>("");
  const [sabbathUntil, setSabbathUntil] = useState<string | null>(null);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);

  // Validation
  const [usernameError, setUsernameError] = useState("");
  // A non-fatal load error (404 no-profile-yet or a 5xx) must NOT collapse
  // to "sign in" — only a genuine missing session does that (walker: a
  // signed-in new user was told to sign in because ?user=me 404'd).
  const [loadError, setLoadError] = useState<string | null>(null);

  const usernameRegex = /^[a-z0-9_]{1,30}$/;

  useEffect(() => {
    (async () => {
      try {
        const session = await fetch("/api/auth/session").then((r) => r.json());
        // The session — not the profile endpoint — is the auth authority.
        if (!session?.user?.email) {
          setAuthed(false);
          return;
        }

        // Fetch the social profile, distinguishing the three outcomes the
        // old code flattened: 200 (profile), 401 (really signed out), and
        // 404 (signed in but no social-profile row yet → editable skeleton).
        const profRes = await fetch("/api/social/profile?user=me");
        let data: {
          profile?: PublicProfile | null;
          showcase?: ShowcaseCard[];
          wishlist?: WishlistItem[];
        } = {};
        if (profRes.ok) {
          data = await profRes.json();
        } else if (profRes.status === 401) {
          setAuthed(false);
          return;
        } else if (profRes.status === 404) {
          // Brand-new account — no profile row yet. Prefill from the session
          // handle and let the user save it into existence.
          data = { profile: null };
        } else {
          setLoadError("We couldn't load your saved profile just now — you can still edit and save below.");
          data = { profile: null };
        }

        const [portfolio, prefs] = await Promise.all([
          // GET /api/portfolio returns { cards, summary }; the showcase
          // picker only needs the card rows.
          fetch("/api/portfolio")
            .then((r) => (r.ok ? r.json() : { cards: [] }))
            .catch(() => ({ cards: [] })),
          fetch("/api/account/preferences")
            .then((r) => r.json())
            .catch(() => ({ pronouns: null, preferred_address: null })),
        ]);

        const p = data.profile ?? null;
        setProfile(p);
        setUsername(p?.username ?? session.user.username ?? "");
        setBio(p?.bio ?? "");
        setIsPublic(Boolean(
          p?.is_public &&
          p.profile_publication_notice_version === PERSON_PUBLICATION_NOTICE_VERSION &&
          p.profile_published_at,
        ));
        setAcceptsMessages(Boolean(
          p?.accepts_messages &&
          p.messaging_notice_version === PERSON_PUBLICATION_NOTICE_VERSION &&
          p.messaging_enabled_at,
        ));
        setShowcase(data.showcase ?? []);
        setWishlist(data.wishlist ?? []);
        setPortfolioCards(portfolio.cards ?? []);
        setPronouns(prefs?.pronouns ?? "");
        setPreferredAddress(prefs?.preferred_address ?? "");
        setResponseWindowHours(
          prefs?.response_window_hours != null ? String(prefs.response_window_hours) : "",
        );
        setSabbathUntil(prefs?.sabbath_until ?? null);
      } catch {
        // A network-level failure is not the same as "signed out". Keep the
        // form reachable and say what happened.
        setLoadError("We couldn't reach your profile settings just now. Try again shortly.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function savePreferences() {
    setPrefsSaving(true);
    setPrefsSaved(false);
    try {
      const trimmedWindow = responseWindowHours.trim();
      const windowNum = trimmedWindow ? Number(trimmedWindow) : null;
      const res = await fetch("/api/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pronouns: pronouns.trim() || null,
          preferred_address: preferredAddress.trim() || null,
          response_window_hours: windowNum && Number.isFinite(windowNum) ? windowNum : null,
          sabbath_until: sabbathUntil,
        }),
      });
      if (res.ok) {
        setPrefsSaved(true);
        setTimeout(() => setPrefsSaved(false), 3000);
      }
    } catch {}
    setPrefsSaving(false);
  }

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
        body: JSON.stringify({
          username,
          bio,
          is_public: isPublic,
          accepts_messages: acceptsMessages,
          profile_publication_notice_version: isPublic
            ? PERSON_PUBLICATION_NOTICE_VERSION
            : undefined,
          messaging_notice_version: acceptsMessages
            ? PERSON_PUBLICATION_NOTICE_VERSION
            : undefined,
        }),
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
      <Audience kind="consumer" />
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="text-center py-16">
        <p className="text-ink-muted mb-4">Sign in to edit your profile.</p>
        <Link
          href="/login"
          className="px-5 py-2 bg-ink text-page font-semibold rounded-lg text-sm hover:opacity-90 transition"
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
      <h1 className="text-2xl font-display font-semibold text-ink mb-6">Edit Profile</h1>

      {loadError && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 mb-5 text-sm text-ink-muted">
          {loadError}
        </div>
      )}

      {/* Username */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-ink-muted mb-1.5">
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
          className="w-full px-3 py-2 bg-surface border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent"
          placeholder="your_username"
        />
        {usernameError && (
          <p className="text-danger text-xs mt-1">{usernameError}</p>
        )}
        <p className="text-ink-faint text-xs mt-1">
          New accounts get a starter handle picked at first sign-in — change it here any time.
        </p>
      </div>

      {/* Bio */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-ink-muted mb-1.5">
          Bio
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 200))}
          maxLength={200}
          rows={3}
          className="w-full px-3 py-2 bg-surface border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent resize-none"
          placeholder="Tell collectors about yourself..."
        />
        <p className="text-ink-faint text-xs mt-1">{bio.length}/200</p>
      </div>

      {/* Public/Private */}
      <div className="mb-8">
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            type="button"
            onClick={() => setIsPublic(!isPublic)}
            className={`relative w-10 h-6 rounded-full transition ${
              isPublic ? "bg-accent" : "bg-surface-subtle"
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-surface rounded-full transition-transform ${
                isPublic ? "left-[18px]" : "left-0.5"
              }`}
            />
          </button>
          <span className="text-sm text-ink-muted">
            {isPublic ? "Public profile" : "Private profile"}
          </span>
        </label>
        <p className="text-xs text-ink-faint mt-2 max-w-xl">
          {PERSON_PUBLICATION_NOTICE.profile}
          {" "}
          <Link href={PERSON_PUBLICATION_NOTICE_PATH} className="text-accent underline">
            Read the public-profile notice.
          </Link>
        </p>
      </div>

      <div className="mb-8">
        <label className="flex cursor-pointer items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={acceptsMessages}
            onClick={() => setAcceptsMessages(!acceptsMessages)}
            className={`relative h-6 w-10 rounded-full transition ${
              acceptsMessages ? "bg-accent" : "bg-surface-subtle"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface transition-transform ${
                acceptsMessages ? "left-[18px]" : "left-0.5"
              }`}
            />
          </button>
          <span className="text-sm text-ink-muted">
            {acceptsMessages ? "Direct messages allowed" : "Direct messages off"}
          </span>
        </label>
        <p className="mt-2 max-w-xl text-xs text-ink-faint">
          Off by default. {PERSON_PUBLICATION_NOTICE.messaging}
          {" "}
          <Link href={PERSON_PUBLICATION_NOTICE_PATH} className="text-accent underline">
            Read the direct-message notice.
          </Link>
        </p>
      </div>

      {/* Preferences — Wave 1.1: pronouns + preferred_address.
          The platform speaks to every user through <UserMention>; the
          two fields below shape every greeting and third-person reference. */}
      <section className="mb-8 rounded-lg border border-border-subtle bg-surface p-4">
        <h2 className="text-lg font-bold text-ink mb-1">How we address you</h2>
        <p className="text-xs text-ink-faint mb-4">
          Used in greetings ("Hi, X") and every third-person reference. Both fields are optional.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-ink-muted mb-1.5">
            Pronouns
          </label>
          <input
            type="text"
            value={pronouns}
            onChange={(e) => setPronouns(e.target.value.slice(0, 60))}
            maxLength={60}
            placeholder="e.g. she/her, they/them, any, ask me"
            className="w-full px-3 py-2 bg-surface border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent"
            list="pronouns-suggestions"
          />
          <datalist id="pronouns-suggestions">
            <option value="she/her" />
            <option value="he/him" />
            <option value="they/them" />
            <option value="she/they" />
            <option value="he/they" />
            <option value="any" />
            <option value="ask me" />
            <option value="no pronouns" />
          </datalist>
          <p className="text-[11px] text-ink-faint mt-1">Free-form; no list is complete.</p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-ink-muted mb-1.5">
            Preferred address
          </label>
          <select
            value={
              ["name", "handle", "formal", "none"].includes(preferredAddress)
                ? preferredAddress
                : preferredAddress
                  ? "custom"
                  : "name"
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === "custom") {
                setPreferredAddress(preferredAddress && !["name", "handle", "formal", "none"].includes(preferredAddress) ? preferredAddress : "");
              } else {
                setPreferredAddress(v === "name" ? "" : v);
              }
            }}
            className="w-full px-3 py-2 bg-surface border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent mb-2"
          >
            <option value="name">Use my name (default)</option>
            <option value="handle">Use my username</option>
            <option value="formal">Formal (no first name)</option>
            <option value="none">No greeting at all</option>
            <option value="custom">Custom (Captain, Dr., a sobriquet…)</option>
          </select>
          {!["", "name", "handle", "formal", "none"].includes(preferredAddress) && (
            <input
              type="text"
              value={preferredAddress}
              onChange={(e) => setPreferredAddress(e.target.value.slice(0, 60))}
              maxLength={60}
              placeholder="Captain, Dr Strange, …"
              className="w-full px-3 py-2 bg-surface border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent"
            />
          )}
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-ink-muted mb-1.5">
            Response window <span className="text-ink-faint font-normal">(hours)</span>
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {[
              { val: "", label: "Default (48h)" },
              { val: "24", label: "24h" },
              { val: "48", label: "48h" },
              { val: "72", label: "3 days" },
              { val: "168", label: "1 week" },
              { val: "720", label: "30 days" },
            ].map((p) => (
              <button
                key={p.val}
                type="button"
                onClick={() => setResponseWindowHours(p.val)}
                className={`px-3 py-1.5 rounded-lg text-xs border transition ${
                  responseWindowHours === p.val
                    ? "bg-ink text-page border-accent"
                    : "bg-surface text-ink-muted border-border-subtle hover:border-border-strong"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={1}
            max={8760}
            value={responseWindowHours}
            onChange={(e) => setResponseWindowHours(e.target.value)}
            placeholder="Custom (1–8760)"
            className="w-full px-3 py-2 bg-surface border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent"
          />
          <p className="text-[11px] text-ink-faint mt-1">
            How long you get to respond on offers, payments, returns, and other deadlines.
            Default is 48 hours.{" "}
            <a href="/methodology/response-windows" className="text-accent hover:text-accent underline">
              How this works ↗
            </a>
          </p>
        </div>

        {/* Sabbath — Wave 6: the right to be undisturbed. */}
        <div className="mb-4 mt-6 pt-4 border-t border-border-subtle">
          <label className="block text-sm font-medium text-ink-muted mb-1.5">
            Sabbath mode <span className="text-ink-faint font-normal">— pause all platform-initiated notifications</span>
          </label>
          {sabbathUntil ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-accent">
                On until {new Date(sabbathUntil).toLocaleDateString("en-GB", {
                  day: "numeric", month: "short", year: "numeric",
                })}
              </span>
              <button
                type="button"
                onClick={() => setSabbathUntil(null)}
                className="text-xs text-accent hover:text-accent underline"
              >
                Lift Sabbath
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {[
                { hours: 24, label: "1 day" },
                { hours: 24 * 7, label: "1 week" },
                { hours: 24 * 30, label: "30 days" },
                { hours: 24 * 365, label: "1 year" },
                { hours: 24 * 365 * 100, label: "Indefinite" },
              ].map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    const d = new Date(Date.now() + s.hours * 60 * 60 * 1000);
                    setSabbathUntil(d.toISOString());
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs border bg-surface text-ink-muted border-border-subtle hover:border-border-strong transition"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-ink-faint mt-1">
            User-initiated paths (login, browse, transact) keep working. Platform-initiated
            paths (notifications, emails, mention pings) stop until you lift it. Only you can lift it.{" "}
            <a href="/methodology/sabbath" className="text-accent hover:text-accent underline">
              How this works ↗
            </a>
          </p>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={savePreferences}
            disabled={prefsSaving}
            className="px-4 py-2 bg-ink text-page font-semibold rounded-lg text-sm hover:opacity-90 disabled:opacity-40 transition"
          >
            {prefsSaving ? "Saving…" : "Save preferences"}
          </button>
          {prefsSaved && (
            <span className="text-ok text-sm font-medium">Saved.</span>
          )}
        </div>
      </section>

      {/* Showcase Management */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-ink mb-3">Showcase</h2>
        {showcase.length > 0 && (
          <div className="space-y-2 mb-4">
            {showcase.map((card, i) => (
              <div
                key={card.id}
                className="flex items-center gap-3 bg-surface rounded-lg p-2 border border-border-subtle"
              >
                {card.image_url ? (
                  <img
                    src={card.image_url}
                    alt=""
                    className="w-8 h-11 object-cover rounded"
                  />
                ) : (
                  <div className="w-8 h-11 bg-surface-subtle rounded" />
                )}
                <span className="flex-1 text-ink text-sm truncate">
                  {card.card_name}
                  {card.caption && (
                    <span className="text-ink-faint ml-2 italic">
                      &mdash; {card.caption}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => moveShowcase(i, -1)}
                  disabled={i === 0}
                  className="text-ink-faint hover:text-ink disabled:opacity-20 text-xs"
                >
                  Up
                </button>
                <button
                  onClick={() => moveShowcase(i, 1)}
                  disabled={i === showcase.length - 1}
                  className="text-ink-faint hover:text-ink disabled:opacity-20 text-xs"
                >
                  Dn
                </button>
                <button
                  onClick={() => removeShowcaseCard(card.portfolio_card_id)}
                  className="text-danger hover:text-danger text-xs font-bold"
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
              className="flex-1 px-3 py-2 bg-surface border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent"
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
              className="sm:w-48 px-3 py-2 bg-surface border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent"
            />
            <button
              onClick={addShowcaseCard}
              disabled={!showcaseAddId}
              className="px-4 py-2 bg-ink text-page text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition"
            >
              Add
            </button>
          </div>
        )}
        {/* Nothing showcased and nothing to pick from: say so plainly
            instead of rendering a heading over empty space. */}
        {showcase.length === 0 && portfolioCards.length === 0 && (
          <EmptyState
            title="Connect your portfolio to feature cards here"
            description="Cards you add to your portfolio become available to showcase on your public profile."
            action={
              <Link
                href="/account/portfolio"
                className="inline-block px-4 py-2 bg-ink text-page text-sm font-semibold rounded-lg hover:opacity-90 transition"
              >
                Open portfolio
              </Link>
            }
          />
        )}
      </section>

      {/* Wishlist Management */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-ink mb-3">Wishlist</h2>
        {wishlist.length > 0 && (
          <div className="space-y-2 mb-4">
            {wishlist.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 bg-surface rounded-lg p-2 border border-border-subtle"
              >
                <span className="flex-1 text-ink text-sm truncate">
                  {item.card_name}
                  {item.max_price && (
                    <span className="text-ink-faint ml-2">
                      Max: ${item.max_price}
                    </span>
                  )}
                  <span className="text-ink-faint ml-2">{item.condition_min}</span>
                </span>
                <button
                  onClick={() => removeWishlistItem(item.id)}
                  className="text-danger hover:text-danger text-xs font-bold"
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
            className="flex-1 px-3 py-2 bg-surface border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent"
          />
          <input
            type="text"
            value={wlSku}
            onChange={(e) => setWlSku(e.target.value)}
            placeholder="SKU (optional)"
            className="sm:w-32 px-3 py-2 bg-surface border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent"
          />
          <input
            type="text"
            value={wlMaxPrice}
            onChange={(e) => setWlMaxPrice(e.target.value)}
            placeholder="Max $"
            className="sm:w-24 px-3 py-2 bg-surface border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent"
          />
          <select
            value={wlCondition}
            onChange={(e) => setWlCondition(e.target.value)}
            className="sm:w-24 px-3 py-2 bg-surface border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent"
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
            className="px-4 py-2 bg-ink text-page text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition"
          >
            Add
          </button>
        </div>
      </section>

      {/* Preview */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-ink mb-3">Preview</h2>
        <div className="bg-surface rounded-lg border border-border-subtle p-6">
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-display font-semibold bg-surface-subtle border border-border-subtle"
              style={
                profile?.avatar_url
                  ? { background: `url(${profile.avatar_url}) center/cover` }
                  : undefined
              }
            >
              {!profile?.avatar_url && (
                <span className="text-ink-muted">{initial}</span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-ink font-bold">
                  {profile?.name ?? username}
                </span>
                {profile?.tier_name && (
                  <span
                    className="text-xs px-1.5 py-0.5 font-medium text-ink-muted border-b-2"
                    style={{ borderBottomColor: tierColor }}
                  >
                    {profile.tier_name}
                  </span>
                )}
              </div>
              <p className="text-ink-faint text-sm">@{username || "username"}</p>
              {bio && (
                <p className="text-ink-muted text-sm mt-1">{bio}</p>
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
          className="px-6 py-2.5 bg-ink text-page font-semibold rounded-lg text-sm hover:opacity-90 disabled:opacity-40 transition"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
        {saved && (
          <span className="text-ok text-sm font-medium">
            Profile saved!
          </span>
        )}
      </div>
    </div>
  );
}
