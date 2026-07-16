import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import {
  getPublicProfile,
  getShowcase,
  getUserAchievements,
  getUserActivity,
  getWishlist,
  isFollowing,
} from "@/lib/social/db";
import { getUserReviews } from "@/lib/escrow/trust-engine";
import { PERSON_PUBLICATION_NOTICE_VERSION } from "@/lib/social/publication";
import { GET } from "./route";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/social/db", () => ({
  getPublicProfile: vi.fn(),
  getShowcase: vi.fn(),
  getUserAchievements: vi.fn(),
  getUserActivity: vi.fn(),
  getWishlist: vi.fn(),
  isFollowing: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock("@/lib/escrow/trust-engine", () => ({ getUserReviews: vi.fn() }));

const mockAuth = vi.mocked(auth);
const mockGetPublicProfile = vi.mocked(getPublicProfile);
const mockGetShowcase = vi.mocked(getShowcase);
const mockGetUserActivity = vi.mocked(getUserActivity);
const mockGetWishlist = vi.mocked(getWishlist);
const mockGetUserAchievements = vi.mocked(getUserAchievements);
const mockIsFollowing = vi.mocked(isFollowing);
const mockGetUserReviews = vi.mocked(getUserReviews);

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "viewer-1" } } as never);
  mockGetPublicProfile.mockResolvedValue({
    user_id: "author-1",
    username: "author",
    name: "Author",
    bio: "A public profile",
    avatar_url: "https://participant.example/avatar.jpg",
    is_public: true,
    accepts_messages: false,
    profile_publication_notice_version: PERSON_PUBLICATION_NOTICE_VERSION,
    profile_published_at: "2026-07-01T00:00:00Z",
    messaging_notice_version: null,
    messaging_enabled_at: null,
    activity_publication_notice_version: null,
    activity_published_at: null,
    is_suspended: false,
    pronouns: null,
    preferred_address: null,
    tier_name: null,
    tier_icon: null,
    tier_color: null,
    trust_score: 0,
    trade_count: 0,
    follower_count: 0,
    following_count: 0,
    portfolio_count: 1,
    avg_rating: null,
    total_reviews: 0,
    member_since: "2026-07-01T00:00:00Z",
  });
  mockGetShowcase.mockResolvedValue([
    {
      id: "showcase-1",
      user_id: "author-1",
      portfolio_card_id: "portfolio-1",
      display_order: 0,
      caption: "My leader",
      sku: "op-op01-001-en",
      card_name: "Leader",
      card_number: "OP01-001",
      set_name: "Romance Dawn",
      image_url: "https://legacy-upstream.example/showcase.jpg",
      rarity: "L",
      spot_price_gbp: "7777.77",
    },
  ] as never);
  mockGetUserActivity.mockResolvedValue([
    {
      id: "activity-1",
      user_id: "author-1",
      event_type: "card_added",
      title: "Added a card",
      description: null,
      image_url: "https://legacy-upstream.example/activity.jpg",
      link_url: null,
      created_at: "2026-07-01T00:00:00Z",
      user_name: "Author",
      user_username: "author",
      user_avatar: "https://participant.example/avatar.jpg",
      tier_icon: null,
      reference_price_gbp: "8888.88",
    },
  ] as never);
  mockGetWishlist.mockResolvedValue([]);
  mockGetUserAchievements.mockResolvedValue([]);
  mockIsFollowing.mockResolvedValue(false);
  mockGetUserReviews.mockResolvedValue([]);
});

describe("GET /api/social/profile legacy snapshot boundary", () => {
  it("keeps participant avatars while redacting attached card media and prices", async () => {
    const response = await GET(
      new Request("https://cambridgetcg.example/api/social/profile?user=author"),
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.profile.avatar_url).toBe("https://participant.example/avatar.jpg");
    expect(body.showcase[0].image_url).toBeNull();
    expect(body.activity[0].image_url).toBeNull();
    expect(body.activity[0].user_avatar).toBe("https://participant.example/avatar.jpg");
    expect(serialized).not.toContain("legacy-upstream.example");
    expect(serialized).not.toContain("7777.77");
    expect(serialized).not.toContain("8888.88");
    expect(serialized).not.toContain("reference_price_gbp");
    expect(serialized).not.toContain("spot_price_gbp");
  });
});
