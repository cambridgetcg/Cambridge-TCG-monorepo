/**
 * Widget Detection Service
 *
 * Detects whether the theme app extension (widget) is enabled
 * by querying the theme's settings_data.json file via GraphQL.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

// App extension identifiers
const APP_EXTENSION_HANDLE = "rewardspro-theme-extension";
const MEMBERSHIP_WIDGET_BLOCK = "membership_widget";

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
    const cleanedContent = fileContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    return JSON.parse(cleanedContent);
  } catch (error) {
    console.error("[Widget Detection] Error fetching theme settings:", error);
    return null;
  }
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
        const isOurApp = block.type.includes(APP_EXTENSION_HANDLE) ||
                         block.type.includes(MEMBERSHIP_WIDGET_BLOCK);

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
        const isOurApp = section.type.includes(APP_EXTENSION_HANDLE) ||
                         section.type.includes(MEMBERSHIP_WIDGET_BLOCK);

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
          const isOurApp = block.type.includes(APP_EXTENSION_HANDLE) ||
                           block.type.includes(MEMBERSHIP_WIDGET_BLOCK);

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
 */
export async function detectWidgetStatus(admin: AdminApiContext): Promise<WidgetDetectionResult> {
  console.log("[Widget Detection] Starting widget detection...");

  try {
    // Step 1: Get the main theme
    const mainTheme = await getMainThemeId(admin);

    if (!mainTheme) {
      return {
        isEnabled: false,
        blockType: 'none',
        themeName: null,
        themeId: null,
        lastChecked: new Date(),
        error: "Could not find main theme",
      };
    }

    console.log(`[Widget Detection] Main theme: ${mainTheme.name} (${mainTheme.id})`);

    // Step 2: Get theme settings
    const settingsData = await getThemeSettings(admin, mainTheme.id);

    if (!settingsData) {
      return {
        isEnabled: false,
        blockType: 'none',
        themeName: mainTheme.name,
        themeId: mainTheme.id,
        lastChecked: new Date(),
        error: "Could not read theme settings",
      };
    }

    // Step 3: Check if app embed is enabled
    const { isEnabled, blockType } = checkAppEmbedEnabled(settingsData);

    console.log(`[Widget Detection] Result: isEnabled=${isEnabled}, blockType=${blockType}`);

    return {
      isEnabled,
      blockType,
      themeName: mainTheme.name,
      themeId: mainTheme.id,
      lastChecked: new Date(),
      error: null,
    };
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
