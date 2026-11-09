import { describe, expect, it } from "vitest";

import { detectWidgetStatus } from "~/services/widget-detection.server";

// App embeds in settings_data.json: shopify://apps/<app handle>/blocks/<block file name>/<uuid>
const MEMBERSHIP_EMBED = "shopify://apps/rewards-pro/blocks/membership_widget/0b5c2f0e-1111-4c3a-9e58-6d2f3a1b7c01";
const MISSIONS_EMBED = "shopify://apps/rewards-pro/blocks/missions_widget/0b5c2f0e-2222-4c3a-9e58-6d2f3a1b7c02";

type Block = { type: string; disabled?: boolean };

/** An Admin API client whose main theme has these app embeds in settings_data.json */
function adminWithEmbeds(blocks: Record<string, Block>) {
  const settingsData = { current: { blocks } };
  return {
    graphql: async (query: string) => ({
      json: async () =>
        query.includes("GetMainTheme")
          ? { data: { themes: { nodes: [{ id: "gid://shopify/OnlineStoreTheme/1", name: "Dawn", role: "MAIN" }] } } }
          : { data: { theme: { files: { nodes: [{ body: { content: JSON.stringify(settingsData) } }] } } } },
    }),
  } as unknown as Parameters<typeof detectWidgetStatus>[0];
}

describe("widget detection: the membership widget embed", () => {
  it("is on when its app embed is on in the main theme", async () => {
    const result = await detectWidgetStatus(adminWithEmbeds({ a: { type: MEMBERSHIP_EMBED, disabled: false } }));

    expect(result.membershipWidgetEnabled).toBe(true);
  });

  it("is not on when only the missions embed is on, though that still counts as one of the app's blocks", async () => {
    const result = await detectWidgetStatus(
      adminWithEmbeds({ a: { type: MISSIONS_EMBED, disabled: false }, b: { type: MEMBERSHIP_EMBED, disabled: true } }),
    );

    expect(result.isEnabled).toBe(true);
    expect(result.membershipWidgetEnabled).toBe(false);
  });

  it("is not on when its embed is switched off", async () => {
    const result = await detectWidgetStatus(adminWithEmbeds({ a: { type: MEMBERSHIP_EMBED, disabled: true } }));

    expect(result.isEnabled).toBe(false);
    expect(result.membershipWidgetEnabled).toBe(false);
  });
});
