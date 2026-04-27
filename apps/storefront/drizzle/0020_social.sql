-- Social layer: public profiles, follows, wishlists, activity feed, trade matching

-- Public collector profiles
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(30) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS follower_count INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS following_count INT NOT NULL DEFAULT 0;

-- Showcase: pinned cards from portfolio
CREATE TABLE IF NOT EXISTS showcase_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  portfolio_card_id UUID NOT NULL REFERENCES portfolio_cards(id) ON DELETE CASCADE,
  display_order INT NOT NULL DEFAULT 0,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, portfolio_card_id)
);

-- Want list (cards the user is looking for)
CREATE TABLE IF NOT EXISTS wishlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sku VARCHAR(60),
  card_name VARCHAR(300) NOT NULL,
  card_number VARCHAR(30),
  set_code VARCHAR(20),
  set_name VARCHAR(100),
  image_url TEXT,
  max_price NUMERIC(10,2),
  condition_min VARCHAR(10) NOT NULL DEFAULT 'NM',
  notes TEXT,
  fulfilled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, sku)
);

-- Follow system
CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);

-- Activity feed events
CREATE TABLE IF NOT EXISTS activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  link_url TEXT,
  reference_id VARCHAR(200),
  reference_type VARCHAR(30),
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Achievements / badges
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  icon VARCHAR(10) NOT NULL,
  category VARCHAR(30) NOT NULL,
  requirement_value INT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);

-- Seed achievements
INSERT INTO achievements (code, name, description, icon, category, requirement_value, sort_order) VALUES
  ('first_purchase', 'First Purchase', 'Made your first purchase', '🛒', 'trading', 1, 0),
  ('first_trade', 'First Trade', 'Completed your first P2P trade', '🤝', 'trading', 1, 1),
  ('first_auction', 'Auctioneer', 'Listed your first auction', '🔨', 'trading', 1, 2),
  ('first_tradein', 'Card Dealer', 'Submitted your first trade-in', '💰', 'trading', 1, 3),
  ('trades_10', 'Active Trader', 'Completed 10 P2P trades', '📊', 'trading', 10, 4),
  ('trades_50', 'Market Maker', 'Completed 50 P2P trades', '🏛️', 'trading', 50, 5),
  ('trades_100', 'Trading Legend', 'Completed 100 P2P trades', '👑', 'trading', 100, 6),
  ('collection_10', 'Starter Collection', 'Added 10 cards to portfolio', '📁', 'collecting', 10, 10),
  ('collection_50', 'Serious Collector', 'Added 50 cards to portfolio', '💎', 'collecting', 50, 11),
  ('collection_100', 'Master Collector', 'Added 100 cards to portfolio', '🏆', 'collecting', 100, 12),
  ('set_complete', 'Set Completer', 'Completed a full card set', '✅', 'collecting', 1, 13),
  ('trust_50', 'Trusted Member', 'Reached Trust Score 50+', '🛡️', 'reputation', 50, 20),
  ('trust_80', 'Veteran', 'Reached Trust Score 80+', '⭐', 'reputation', 80, 21),
  ('raffle_winner', 'Lucky Draw', 'Won a raffle', '🎰', 'rewards', 1, 30),
  ('mystery_legendary', 'Legendary Pull', 'Won a legendary mystery box reward', '✨', 'rewards', 1, 31),
  ('silver_member', 'Silver Status', 'Reached Silver membership tier', '🥈', 'membership', 1, 40),
  ('gold_member', 'Gold Status', 'Reached Gold membership tier', '🥇', 'membership', 1, 41),
  ('first_review', 'Reviewer', 'Left your first trade review', '📝', 'community', 1, 50),
  ('helpful_seller', 'Helpful Seller', 'Received 10 five-star reviews as seller', '🌟', 'community', 10, 51),
  ('community_pillar', 'Community Pillar', '50 followers', '🏅', 'community', 50, 52)
ON CONFLICT (code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_showcase_user ON showcase_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_sku ON wishlists(sku);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_activity_feed_user ON activity_feed(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_feed_public ON activity_feed(is_public, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
