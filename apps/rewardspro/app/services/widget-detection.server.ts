/**
 * Widget Detection Service
 *
 * Detects whether the theme app extension (widget) is enabled
 * by querying the theme's settings_data.json file via GraphQL.
 *
 * Includes in-memory caching to prevent excessive API calls.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

// App extension identifiers - check for various naming patterns
// The app handle in Shopify can be "rewards-pro" or "rewardspro-theme-extension"
const APP_HANDLES = [
  "rewards-pro",
  "rewardspro-theme-extension",
  "rewardspro",
];
const WIDGET_BLOCKS = [
  "membership_widget",
];

// ============================================
// IN-MEMORY CACHE
// ============================================

interface CachedWidgetStatus {
  result: WidgetDetectionResult;
  cachedAt: number;
}

// Cache TTL: 5 minutes (widget status changes infrequently)
const CACHE_TTL_MS = 5 * 60 * 1000;

// In-memory cache keyed by shop domain
const widgetStatusCache = new Map<string, CachedWidgetStatus>();

/**
 * Get cached widget status if available and not expired
 */
function getCachedStatus(shop: string): WidgetDetectionResult | null {
  const cached = widgetStatusCache.get(shop);
  if (!cached) return null;

  const age = Date.now() - cached.cachedAt;
  if (age > CACHE_TTL_MS) {
    widgetStatusCache.delete(shop);
    return null;
  }

  console.log(`[Widget Detection] Using cached status for ${shop} (age: ${Math.round(age / 1000)}s)`);
  return cached.result;
}

/**
 * Set cached widget status
 */
function setCachedStatus(shop: string, result: WidgetDetectionResult): void {
  widgetStatusCache.set(shop, {
    result,
    cachedAt: Date.now(),
  });
}

/**
 * Clear cached status for a shop (useful after theme changes)
 */
export function clearWidgetStatusCache(shop: string): void {
  widgetStatusCache.delete(shop);
  console.log(`[Widget Detection] Cleared cache for ${shop}`);
}

export interface WidgetDetectionResult {
  isEnabled: boolean;
  blockType: 'app_embed' | 'section' | 'none';
  themeName: string | null;
  themeId: string | null;
  lastChecked: Date;
  error: string | null;
}

/**
 * Get the main/active theme ID
 */
async function getMainThemeId(admin: AdminApiContext): Promise<{ id: string; name: string } | null> {
  const query = `
    query GetMainTheme {
      themes(first: 10, roles: [MAIN]) {
        nodes {
          id
          name
          role
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(query);
    const data = await response.json();

    if (data.errors) {
      console.error("[Widget Detection] GraphQL errors getting themes:", data.errors);
      return null;
    }

    const mainTheme = data.data?.themes?.nodes?.[0];
    if (!mainTheme) {
      console.warn("[Widget Detection] No main theme found");
      return null;
    }

    return {
      id: mainTheme.id,
      name: mainTheme.name,
    };
  } catch (error) {
    console.error("[Widget Detection] Error fetching main theme:", error);
    return null;
  }
}

/**
 * Get the theme's settings_data.json content
 */
async function getThemeSettings(admin: AdminApiContext, themeId: string): Promise<any | null> {
  const query = `
    query GetThemeSettings($themeId: ID!) {
      theme(id: $themeId) {
        id
        name
        files(filenames: ["config/settings_data.json"], first: 1) {
          nodes {
            filename
            body {
              ... on OnlineStoreThemeFileBodyText {
                content
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(query, {
      variables: { themeId },
    });
    const data = await response.json();

    if (data.errors) {
      console.error("[Widget Detection] GraphQL errors getting theme settings:", data.errors);
      return null;
    }

    const fileContent = data.data?.theme?.files?.nodes?.[0]?.body?.content;
    if (!fileContent) {
      console.warn("[Widget Detection] No settings_data.json found");
      return null;
    }

    // Parse JSON, removing any comments first (Shopify themes sometimes have comments)
    // 1. Remove multi-line comments /* ... */
    // 2. Remove single-line comments // ...
    // 3. Find the actual JSON start (first '{')
    let cleanedContent = fileContent;
    cleanedContent = cleanedContent.replace(/\/\*[\s\S]*?\*\//g, '');
    cleanedContent = cleanedContent.replace(/\/\/.*$/gm, '');
    cleanedContent = cleanedContent.trim();

    const jsonStart = cleanedContent.indexOf('{');
    if (jsonStart > 0) {
      cleanedContent = cleanedContent.substring(jsonStart);
    }

    return JSON.parse(cleanedContent);
  } catch (error) {
    console.error("[Widget Detection] Error fetching theme settings:", error);
    return null;
  }
}

/**
 * Check if a block type belongs to our app
 */
function isOurAppBlock(blockType: string): boolean {
  // Check if the block type contains any of our app handles or widget block names
  const lowerType = blockType.toLowerCase();
  const matchesHandle = APP_HANDLES.some(handle => lowerType.includes(handle.toLowerCase()));
  const matchesWidget = WIDGET_BLOCKS.some(widget => lowerType.includes(widget.toLowerCase()));
  return matchesHandle || matchesWidget;
}

/**
 * Check if app embed block is enabled in theme settings
 */
function checkAppEmbedEnabled(settingsData: any): { isEnabled: boolean; blockType: 'app_embed' | 'section' | 'none' } {
  try {
    // Check in current theme settings
    const current = settingsData?.current;
    if (!current) {
      return { isEnabled: false, blockType: 'none' };
    }

    // Check blocks in the current settings for app embed blocks
    const blocks = current.blocks || {};

    for (const [blockId, blockData] of Object.entries(blocks)) {
      const block = blockData as any;

      // Check if this is our app's block
      // App embed blocks typically have type like "shopify://apps/<app-handle>/blocks/<block-name>/<uuid>"
      if (block.type && typeof block.type === 'string') {
        const isOurApp = isOurAppBlock(block.type);

        if (isOurApp) {
          // Check if disabled flag is false or not present (enabled by default)
          const isDisabled = block.disabled === true;

          console.log(`[Widget Detection] Found app block: ${blockId}`, {
            type: block.type,
            disabled: isDisabled,
          });

          if (!isDisabled) {
            return { isEnabled: true, blockType: 'app_embed' };
          }
        }
      }
    }

    // Also check sections for app blocks (some themes use section-based blocks)
    const sections = current.sections || {};
    for (const [sectionId, sectionData] of Object.entries(sections)) {
      const section = sectionData as any;

      if (section.type && typeof section.type === 'string') {
        const isOurApp = isOurAppBlock(section.type);

        if (isOurApp) {
          const isDisabled = section.disabled === true;

          if (!isDisabled) {
            return { isEnabled: true, blockType: 'section' };
          }
        }
      }

      // Check blocks within sections
      const sectionBlocks = section.blocks || {};
      for (const [blockId, blockData] of Object.entries(sectionBlocks)) {
        const block = blockData as any;

        if (block.type && typeof block.type === 'string') {
          const isOurApp = isOurAppBlock(block.type);

          if (isOurApp) {
            const isDisabled = block.disabled === true;

            if (!isDisabled) {
              return { isEnabled: true, blockType: 'section' };
            }
          }
        }
      }
    }

    return { isEnabled: false, blockType: 'none' };
  } catch (error) {
    console.error("[Widget Detection] Error parsing theme settings:", error);
    return { isEnabled: false, blockType: 'none' };
  }
}

/**
 * Detect if the widget is enabled in the merchant's theme
 * Uses in-memory caching (5 min TTL) to prevent excessive API calls
 *
 * @param admin - Shopify Admin API context
 * @param shop - Shop domain (for caching)
 * @param forceRefresh - Skip cache and fetch fresh data
 */
export async function detectWidgetStatus(
  admin: AdminApiContext,
  shop?: string,
  forceRefresh: boolean = false
): Promise<WidgetDetectionResult> {
  // Check cache first (if shop provided and not forcing refresh)
  if (shop && !forceRefresh) {
    const cached = getCachedStatus(shop);
    if (cached) {
      return cached;
    }
  }

  console.log("[Widget Detection] Starting widget detection...");

  try {
    // Step 1: Get the main theme
    const mainTheme = await getMainThemeId(admin);

    if (!mainTheme) {
      const result: WidgetDetectionResult = {
        isEnabled: false,
        blockType: 'none',
        themeName: null,
        themeId: null,
        lastChecked: new Date(),
        error: "Could not find main theme",
      };
      // Don't cache errors
      return result;
    }

    console.log(`[Widget Detection] Main theme: ${mainTheme.name} (${mainTheme.id})`);

    // Step 2: Get theme settings
    const settingsData = await getThemeSettings(admin, mainTheme.id);

    if (!settingsData) {
      const result: WidgetDetectionResult = {
        isEnabled: false,
        blockType: 'none',
        themeName: mainTheme.name,
        themeId: mainTheme.id,
        lastChecked: new Date(),
        error: "Could not read theme settings",
      };
      // Don't cache errors
      return result;
    }

    // Step 3: Check if app embed is enabled
    const { isEnabled, blockType } = checkAppEmbedEnabled(settingsData);

    console.log(`[Widget Detection] Result: isEnabled=${isEnabled}, blockType=${blockType}`);

    const result: WidgetDetectionResult = {
      isEnabled,
      blockType,
      themeName: mainTheme.name,
      themeId: mainTheme.id,
      lastChecked: new Date(),
      error: null,
    };

    // Cache successful result
    if (shop) {
      setCachedStatus(shop, result);
    }

    return result;
  } catch (error) {
    console.error("[Widget Detection] Error detecting widget status:", error);
    return {
      isEnabled: false,
      blockType: 'none',
      themeName: null,
      themeId: null,
      lastChecked: new Date(),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update the cached widget status in the database
 */
export async function updateWidgetStatusCache(
  db: any,
  shop: string,
  isEnabled: boolean
): Promise<void> {
  try {
    await db.shopSettings.update({
      where: { shop },
      data: { widgetIsActive: isEnabled },
    });
    console.log(`[Widget Detection] Updated widget status cache for ${shop}: ${isEnabled}`);
  } catch (error) {
    console.error("[Widget Detection] Error updating widget status cache:", error);
  }
}
