/**
 * Points Currency Icon Library
 *
 * Provides a comprehensive library of icons for points currency branding:
 * - Categorized emoji icons for quick selection
 * - Lucide vector icons for professional look
 * - Color presets for brand customization
 */

// ============================================
// EMOJI ICON LIBRARY
// ============================================

export interface EmojiCategory {
  name: string;
  description: string;
  emojis: string[];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    name: "Stars & Sparkles",
    description: "Classic reward symbols",
    emojis: ["⭐", "🌟", "✨", "💫", "⚡", "🔥", "✴️", "🌠"],
  },
  {
    name: "Coins & Currency",
    description: "Money and value symbols",
    emojis: ["🪙", "💰", "💵", "💲", "💎", "💳", "🏦", "💸"],
  },
  {
    name: "Awards & Trophies",
    description: "Achievement icons",
    emojis: ["🏆", "🥇", "🥈", "🥉", "🏅", "🎖️", "👑", "🎯"],
  },
  {
    name: "Gems & Jewels",
    description: "Precious stones",
    emojis: ["💎", "💠", "🔷", "🔶", "♦️", "🔹", "🔸", "💍"],
  },
  {
    name: "Hearts & Love",
    description: "Affection symbols",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💝"],
  },
  {
    name: "Nature & Elements",
    description: "Natural symbols",
    emojis: ["🌸", "🍀", "🌺", "🌻", "🌹", "🌿", "🍂", "☘️"],
  },
  {
    name: "Fun & Playful",
    description: "Playful icons",
    emojis: ["🎁", "🎉", "🎊", "🎈", "🎀", "🎪", "🎭", "🎨"],
  },
  {
    name: "Space & Cosmic",
    description: "Celestial objects",
    emojis: ["🌙", "☀️", "🌍", "🪐", "☄️", "🌌", "🌈", "⭕"],
  },
];

// Flattened list of all emojis for quick access
export const ALL_EMOJIS = EMOJI_CATEGORIES.flatMap((cat) => cat.emojis);

// Popular/recommended emojis
export const POPULAR_EMOJIS = ["⭐", "💎", "🪙", "🏆", "✨", "💰", "🌟", "👑", "🎁", "❤️", "🔥", "💫"];

// ============================================
// VECTOR ICON LIBRARY (Lucide-compatible)
// ============================================

export interface VectorIcon {
  id: string;
  name: string;
  category: string;
  // SVG path data for rendering
  path: string;
  viewBox?: string;
}

export interface VectorIconCategory {
  name: string;
  description: string;
  icons: VectorIcon[];
}

// Lucide-compatible icon paths (24x24 viewBox)
export const VECTOR_ICON_CATEGORIES: VectorIconCategory[] = [
  {
    name: "Stars",
    description: "Star shapes",
    icons: [
      {
        id: "star",
        name: "Star",
        category: "stars",
        path: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
      },
      {
        id: "star-half",
        name: "Half Star",
        category: "stars",
        path: "M12 17.8 5.8 21 7 14.1 2 9.3l7-1L12 2",
      },
      {
        id: "sparkle",
        name: "Sparkle",
        category: "stars",
        path: "m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z",
      },
      {
        id: "sparkles",
        name: "Sparkles",
        category: "stars",
        path: "m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3ZM5 3v4M19 17v4M3 5h4M17 19h4",
      },
      {
        id: "sun",
        name: "Sun",
        category: "stars",
        path: "M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z",
      },
    ],
  },
  {
    name: "Coins & Currency",
    description: "Money symbols",
    icons: [
      {
        id: "circle-dollar",
        name: "Dollar Coin",
        category: "currency",
        path: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v2M12 16v2M8 10c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2s-.9 2-2 2h-4c-1.1 0-2 .9-2 2s.9 2 2 2h4",
      },
      {
        id: "coins",
        name: "Stacked Coins",
        category: "currency",
        path: "M12 2C6.5 2 2 4.5 2 7.5v9C2 19.5 6.5 22 12 22s10-2.5 10-5.5v-9C22 4.5 17.5 2 12 2zM2 12.5c0 3 4.5 5.5 10 5.5s10-2.5 10-5.5M2 7.5c0 3 4.5 5.5 10 5.5s10-2.5 10-5.5",
      },
      {
        id: "banknote",
        name: "Banknote",
        category: "currency",
        path: "M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 12h.01M18 12h.01",
      },
      {
        id: "wallet",
        name: "Wallet",
        category: "currency",
        path: "M17 9V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2M21 12a3 3 0 0 0-3-3h-1v6h1a3 3 0 0 0 3-3z",
      },
      {
        id: "piggy-bank",
        name: "Piggy Bank",
        category: "currency",
        path: "M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8.8 3.3 2 4.5V19h3v-2h4v2h3v-2.7c1.5-.7 2.6-2 2.8-3.5H22v-2h-2.2c-.2-.6-.5-1.2-.8-1.8V5z",
      },
    ],
  },
  {
    name: "Gems & Diamonds",
    description: "Precious stones",
    icons: [
      {
        id: "diamond",
        name: "Diamond",
        category: "gems",
        path: "M2.7 10.3a2.4 2.4 0 0 0 0 3.4l7.6 7.6a2.4 2.4 0 0 0 3.4 0l7.6-7.6a2.4 2.4 0 0 0 0-3.4l-7.6-7.6a2.4 2.4 0 0 0-3.4 0L2.7 10.3z",
      },
      {
        id: "gem",
        name: "Gem",
        category: "gems",
        path: "M6 3h12l4 6-10 13L2 9l4-6zM11 3l1 6h9M2 9h20M11 3l-1 6",
      },
      {
        id: "hexagon",
        name: "Hexagon",
        category: "gems",
        path: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
      },
      {
        id: "octagon",
        name: "Octagon",
        category: "gems",
        path: "M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2z",
      },
      {
        id: "pentagon",
        name: "Pentagon",
        category: "gems",
        path: "M3.5 8.7l8-5.4a1 1 0 0 1 1 0l8 5.4a1 1 0 0 1 .4.9l-1.5 8.2a1 1 0 0 1-.7.8l-7.2 2.2a1 1 0 0 1-.6 0l-7.2-2.2a1 1 0 0 1-.7-.8L1.5 9.5a1 1 0 0 1 .4-.8z",
      },
    ],
  },
  {
    name: "Awards & Trophies",
    description: "Achievement icons",
    icons: [
      {
        id: "trophy",
        name: "Trophy",
        category: "awards",
        path: "M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22M18 2H6v7a6 6 0 0 0 12 0V2z",
      },
      {
        id: "award",
        name: "Award",
        category: "awards",
        path: "M12 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM7.4 11.4L4 22l8-3 8 3-3.4-10.6",
      },
      {
        id: "medal",
        name: "Medal",
        category: "awards",
        path: "M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15M11 12 5.12 2.2M13 12l5.88-9.8M8 7h8M12 17a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
      },
      {
        id: "crown",
        name: "Crown",
        category: "awards",
        path: "M2 5l3 3 6-6 6 6 3-3v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z",
      },
      {
        id: "target",
        name: "Target",
        category: "awards",
        path: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
      },
    ],
  },
  {
    name: "Hearts",
    description: "Love and loyalty",
    icons: [
      {
        id: "heart",
        name: "Heart",
        category: "hearts",
        path: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
      },
      {
        id: "heart-pulse",
        name: "Heart Pulse",
        category: "hearts",
        path: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7ZM3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27",
      },
      {
        id: "heart-handshake",
        name: "Heart Handshake",
        category: "hearts",
        path: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7ZM12 5L9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66",
      },
    ],
  },
  {
    name: "Gift & Rewards",
    description: "Present and reward icons",
    icons: [
      {
        id: "gift",
        name: "Gift",
        category: "gifts",
        path: "M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z",
      },
      {
        id: "party-popper",
        name: "Party Popper",
        category: "gifts",
        path: "M5.8 11.3 2 22l10.7-3.8M4 3h.01M22 8h.01M15 2h.01M22 20h.01M22 2l-2.24.75a2.9 2.9 0 0 0-1.96 3.12v0c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10M22 13l-.82-.33c-.86-.34-1.82.2-1.98 1.11v0c-.11.7-.72 1.22-1.43 1.22H17M11 2l.33.82c.34.86-.2 1.82-1.11 1.98v0C9.52 4.9 9 5.52 9 6.23V7M11 13l-1.7-1.7a1.98 1.98 0 0 0-2.1-.48v0c-.27.12-.57.18-.87.18H6",
      },
      {
        id: "package",
        name: "Package",
        category: "gifts",
        path: "M16.5 9.4 7.55 4.24M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12",
      },
      {
        id: "ticket",
        name: "Ticket",
        category: "gifts",
        path: "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z M13 5v2M13 17v2M13 11v2",
      },
    ],
  },
  {
    name: "Energy & Power",
    description: "Dynamic symbols",
    icons: [
      {
        id: "zap",
        name: "Lightning",
        category: "energy",
        path: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
      },
      {
        id: "flame",
        name: "Flame",
        category: "energy",
        path: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",
      },
      {
        id: "rocket",
        name: "Rocket",
        category: "energy",
        path: "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5",
      },
      {
        id: "bolt",
        name: "Bolt",
        category: "energy",
        path: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM12 8v8M8 12h8",
      },
    ],
  },
];

// Flattened list of all vector icons
export const ALL_VECTOR_ICONS = VECTOR_ICON_CATEGORIES.flatMap((cat) => cat.icons);

// Popular vector icons
export const POPULAR_VECTOR_ICONS = ["star", "gem", "trophy", "crown", "heart", "gift", "zap", "sparkle"];

// ============================================
// COLOR PRESETS
// ============================================

export interface ColorPreset {
  id: string;
  name: string;
  color: string;
  textColor: string; // For contrast
}

export const COLOR_PRESETS: ColorPreset[] = [
  // Brand colors
  { id: "gold", name: "Gold", color: "#F59E0B", textColor: "#000000" },
  { id: "amber", name: "Amber", color: "#D97706", textColor: "#FFFFFF" },
  { id: "orange", name: "Orange", color: "#EA580C", textColor: "#FFFFFF" },
  { id: "red", name: "Red", color: "#DC2626", textColor: "#FFFFFF" },
  { id: "rose", name: "Rose", color: "#E11D48", textColor: "#FFFFFF" },
  { id: "pink", name: "Pink", color: "#DB2777", textColor: "#FFFFFF" },
  { id: "purple", name: "Purple", color: "#9333EA", textColor: "#FFFFFF" },
  { id: "violet", name: "Violet", color: "#7C3AED", textColor: "#FFFFFF" },
  { id: "indigo", name: "Indigo", color: "#4F46E5", textColor: "#FFFFFF" },
  { id: "blue", name: "Blue", color: "#2563EB", textColor: "#FFFFFF" },
  { id: "cyan", name: "Cyan", color: "#0891B2", textColor: "#FFFFFF" },
  { id: "teal", name: "Teal", color: "#0D9488", textColor: "#FFFFFF" },
  { id: "emerald", name: "Emerald", color: "#059669", textColor: "#FFFFFF" },
  { id: "green", name: "Green", color: "#16A34A", textColor: "#FFFFFF" },
  { id: "lime", name: "Lime", color: "#65A30D", textColor: "#000000" },
  // Neutrals
  { id: "slate", name: "Slate", color: "#475569", textColor: "#FFFFFF" },
  { id: "gray", name: "Gray", color: "#6B7280", textColor: "#FFFFFF" },
  { id: "zinc", name: "Zinc", color: "#71717A", textColor: "#FFFFFF" },
  { id: "black", name: "Black", color: "#18181B", textColor: "#FFFFFF" },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get an emoji by its character
 */
export function getEmoji(emoji: string): string | undefined {
  return ALL_EMOJIS.find((e) => e === emoji);
}

/**
 * Get a vector icon by its ID
 */
export function getVectorIcon(id: string): VectorIcon | undefined {
  return ALL_VECTOR_ICONS.find((icon) => icon.id === id);
}

/**
 * Get a color preset by its ID
 */
export function getColorPreset(id: string): ColorPreset | undefined {
  return COLOR_PRESETS.find((preset) => preset.id === id);
}

/**
 * Validate a hex color
 */
export function isValidHexColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

/**
 * Get contrasting text color for a background
 */
export function getContrastColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace("#", "");

  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}

/**
 * Render the appropriate icon based on type
 */
export function getIconDisplay(
  iconType: "emoji" | "upload" | "library",
  iconEmoji: string,
  iconUrl?: string | null,
  iconId?: string | null,
  iconColor?: string | null
): {
  type: "emoji" | "image" | "svg";
  value: string;
  color?: string;
} {
  switch (iconType) {
    case "upload":
      if (iconUrl) {
        return { type: "image", value: iconUrl };
      }
      // Fallback to emoji
      return { type: "emoji", value: iconEmoji };

    case "library":
      if (iconId) {
        const icon = getVectorIcon(iconId);
        if (icon) {
          return { type: "svg", value: icon.path, color: iconColor || "#5C6AC4" };
        }
      }
      // Fallback to emoji
      return { type: "emoji", value: iconEmoji };

    case "emoji":
    default:
      return { type: "emoji", value: iconEmoji };
  }
}
