import { json, redirect } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useActionData, useSubmit } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  TextField,
  Select,
  Button,
  Banner,
  Text,
  Box,
  Divider,
  Icon,
  Tabs,
  Badge,
  Modal,
} from "@shopify/polaris";
import {
  TextIcon,
  ImageIcon,
  ButtonIcon,
  CodeIcon,
  ProductIcon,
  LinkIcon,
  HashtagIcon,
  DesktopIcon,
  MobileIcon,
  UndoIcon,
  RedoIcon,
  PlusIcon,
  MinusIcon,
  ClockIcon,
  ChatIcon,
  LayoutColumns2Icon,
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { v4 as uuidv4 } from "uuid";
import { sanitizeEmailHtml } from "~/utils/html-sanitizer";
import { SortableBlockList } from "~/components/EmailEditor";
import type { ContentBlock, TemplateStyles } from "~/components/EmailEditor/types";
import { BrandKitPanel } from "~/components/BrandKit";
import { useAutosave, formatRelativeTime } from "~/hooks/useAutosave";
import { ColorPickerFieldInline } from "~/components/ColorPickerField";
import { TextFieldWithVariables } from "~/components/TextFieldWithVariables";
import { AIAssistantPanel } from "~/components/AIEmailAssistant";

// ============================================
// TYPES
// ============================================

// ============================================
// LOADER
// ============================================

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  console.log("[Template Edit] Loader started");
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const templateId = params.id;

  if (!templateId) {
    throw new Response("Template ID is required", { status: 400 });
  }

  try {
    const [template, shopSettings] = await Promise.all([
      prisma.emailTemplate.findFirst({
        where: {
          id: templateId,
          shop,
        },
      }),
      prisma.shopSettings.findUnique({
        where: { shop },
        select: {
          brandKitEnabled: true,
          emailPrimaryColor: true,
          emailSecondaryColor: true,
          emailBackgroundColor: true,
          emailContentBgColor: true,
          emailLinkColor: true,
          emailFontFamily: true,
          emailLogo: true,
        },
      }),
    ]);

    if (!template) {
      throw new Response("Template not found", { status: 404 });
    }

    const brandKit: BrandKit | null = shopSettings?.brandKitEnabled
      ? {
          primaryColor: shopSettings.emailPrimaryColor || "#000000",
          secondaryColor: shopSettings.emailSecondaryColor || "#666666",
          backgroundColor: shopSettings.emailBackgroundColor || "#f4f4f4",
          contentBgColor: shopSettings.emailContentBgColor || "#ffffff",
          textColor: "#333333",
          linkColor: shopSettings.emailLinkColor || "#0066cc",
          fontFamily: shopSettings.emailFontFamily || "Arial, sans-serif",
          logoUrl: shopSettings.emailLogo || undefined,
        }
      : null;

    console.log("[Template Edit] Loaded template:", template.name);
    return json({
      template: {
        id: template.id,
        name: template.name,
        type: template.type,
        subject: template.subject || "",
        previewText: template.previewText,
        bodyHtml: template.bodyHtml || "",
        content: template.content as { blocks: ContentBlock[]; styles: TemplateStyles } | null,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      },
      brandKit,
      brandKitEnabled: shopSettings?.brandKitEnabled || false,
    });
  } catch (error: any) {
    console.error("[Template Edit] Error:", error);
    if (error instanceof Response) throw error;
    throw new Response(error.message, { status: 500 });
  }
};

// Re-export BrandKit type for use in loader
type BrandKit = {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  contentBgColor: string;
  textColor: string;
  linkColor: string;
  fontFamily: string;
  logoUrl?: string;
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const templateId = params.id;

  if (!templateId) {
    return json({ error: "Template ID is required" }, { status: 400 });
  }

  const formData = await request.formData();
  const actionType = formData.get("_action") as string;

  if (actionType === "delete") {
    try {
      await prisma.emailTemplate.deleteMany({
        where: { id: templateId, shop },
      });
      return redirect("/app/marketing/templates");
    } catch (error: any) {
      return json({ error: error.message }, { status: 500 });
    }
  }

  const name = formData.get("name") as string;
  const type = formData.get("type") as string;
  const subject = formData.get("subject") as string;
  const previewText = formData.get("previewText") as string;
  const bodyHtml = formData.get("bodyHtml") as string;
  const contentJson = formData.get("content") as string;

  if (!name || !type || !subject) {
    return json({ error: "Name, type, and subject are required" }, { status: 400 });
  }

  // Parse content JSON
  let content: any = null;
  try {
    if (contentJson) {
      content = JSON.parse(contentJson);
    }
  } catch (e) {
    console.error("[Template Edit] Error parsing content JSON:", e);
  }

  try {
    await prisma.emailTemplate.updateMany({
      where: { id: templateId, shop },
      data: {
        name,
        type,
        subject,
        previewText: previewText || "",
        bodyHtml: bodyHtml || generateDefaultHtml(),
        bodyText: stripHtml(bodyHtml || ""),
        content,
        updatedAt: new Date(),
      },
    });

    return json({ success: true, message: "Template saved successfully" });
  } catch (error: any) {
    console.error("[Template Edit] Error updating:", error);
    return json({ error: error.message }, { status: 500 });
  }
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function generateDefaultHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; color: #333333;">Hello {{customer_name}},</h1>
              <p style="margin: 0 0 20px; color: #666666; line-height: 1.6;">
                Your email content goes here.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ============================================
// BLOCK DEFINITIONS
// ============================================

const BLOCK_TYPES = [
  { id: "text", label: "Text", icon: TextIcon, description: "Add text content" },
  { id: "image", label: "Image", icon: ImageIcon, description: "Add an image" },
  { id: "button", label: "Button", icon: ButtonIcon, description: "Add a CTA button" },
  { id: "divider", label: "Divider", icon: MinusIcon, description: "Add a divider line" },
  { id: "spacer", label: "Spacer", icon: HashtagIcon, description: "Add vertical space" },
  { id: "html", label: "HTML", icon: CodeIcon, description: "Add custom HTML" },
  { id: "hero", label: "Hero", icon: ImageIcon, description: "Full-width hero image with text" },
  { id: "testimonial", label: "Testimonial", icon: ChatIcon, description: "Customer quote with rating" },
  { id: "countdown", label: "Countdown", icon: ClockIcon, description: "Countdown timer display" },
  { id: "social", label: "Social", icon: LinkIcon, description: "Social media icons" },
  { id: "product", label: "Product", icon: ProductIcon, description: "Product display block" },
  { id: "columns", label: "Columns", icon: LayoutColumns2Icon, description: "Two-column layout" },
];

const TEMPLATE_TYPES = [
  { label: "Tier Welcome", value: "tier_welcome" },
  { label: "Tier Upgrade", value: "tier_upgrade" },
  { label: "Tier Downgrade", value: "tier_downgrade" },
  { label: "Reward Expiry", value: "reward_expiry" },
  { label: "Re-engagement", value: "inactive_reengagement" },
  { label: "Promotional", value: "promotional" },
  { label: "Transactional", value: "transactional" },
];

// ============================================
// HTML PARSER - Extract blocks from existing HTML
// ============================================

function parseHtmlToBlocks(html: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // Try to extract content from the email body
  // Look for content between the main content <td> tags
  const contentMatch = html.match(/<td[^>]*style="padding:\s*40px[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
  const content = contentMatch ? contentMatch[1] : html;

  // Extract paragraphs
  const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = paragraphRegex.exec(content)) !== null) {
    const innerContent = match[1].trim();

    // Check if it's a button
    const buttonMatch = innerContent.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (buttonMatch && innerContent.includes("background-color")) {
      blocks.push({
        id: uuidv4(),
        type: "button",
        content: { text: buttonMatch[2].trim(), url: buttonMatch[1], style: "primary" },
      });
      continue;
    }

    // Check if it's an image
    const imageMatch = innerContent.match(/<img[^>]*src="([^"]*)"[^>]*(?:alt="([^"]*)")?/i);
    if (imageMatch) {
      blocks.push({
        id: uuidv4(),
        type: "image",
        content: { url: imageMatch[1], alt: imageMatch[2] || "" },
      });
      continue;
    }

    // Regular text
    const textContent = innerContent.replace(/<[^>]*>/g, "").trim();
    if (textContent) {
      blocks.push({
        id: uuidv4(),
        type: "text",
        content: { text: textContent },
      });
    }
  }

  // Extract headers
  const headerRegex = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  while ((match = headerRegex.exec(content)) !== null) {
    const textContent = match[1].replace(/<[^>]*>/g, "").trim();
    if (textContent) {
      blocks.push({
        id: uuidv4(),
        type: "text",
        content: { text: textContent },
      });
    }
  }

  // Extract dividers
  if (content.includes("<hr")) {
    blocks.push({
      id: uuidv4(),
      type: "divider",
      content: { color: "#dddddd", thickness: 1 },
    });
  }

  // If no blocks found, add a default text block
  if (blocks.length === 0) {
    blocks.push({
      id: uuidv4(),
      type: "text",
      content: { text: "Edit your email content here..." },
    });
  }

  return blocks;
}

function parseStylesFromHtml(html: string): TemplateStyles {
  const styles: TemplateStyles = {
    backgroundColor: "#f4f4f4",
    contentWidth: "600",
    fontFamily: "Arial, sans-serif",
    primaryColor: "#000000",
    textColor: "#333333",
    linkColor: "#0066cc",
  };

  // Extract background color
  const bgMatch = html.match(/background-color:\s*([#\w]+)/i);
  if (bgMatch) {
    styles.backgroundColor = bgMatch[1];
  }

  // Extract content width
  const widthMatch = html.match(/width="(\d+)"/i);
  if (widthMatch) {
    styles.contentWidth = widthMatch[1];
  }

  // Extract font family
  const fontMatch = html.match(/font-family:\s*([^;"]+)/i);
  if (fontMatch) {
    styles.fontFamily = fontMatch[1].trim();
  }

  // Extract text color
  const textColorMatch = html.match(/color:\s*([#\w]+)/i);
  if (textColorMatch) {
    styles.textColor = textColorMatch[1];
  }

  return styles;
}

// ============================================
// COMPONENT
// ============================================

export default function EditEmailTemplate() {
  const loaderData = useLoaderData<typeof loader>();
  const { template } = loaderData;
  const navigate = useNavigate();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  // Template metadata
  const [name, setName] = useState(template.name);
  const [type, setType] = useState(template.type);
  const [subject, setSubject] = useState(template.subject);
  const [previewText, setPreviewText] = useState(template.previewText || "");

  // Editor state - use saved content if available, otherwise parse from HTML
  const [blocks, setBlocks] = useState<ContentBlock[]>(() =>
    template.content?.blocks || parseHtmlToBlocks(template.bodyHtml)
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [activeTab, setActiveTab] = useState(0);

  // Styles - use saved content if available, otherwise parse from HTML
  const [styles, setStyles] = useState<TemplateStyles>(() =>
    template.content?.styles || parseStylesFromHtml(template.bodyHtml)
  );

  // History for undo/redo
  const [history, setHistory] = useState<ContentBlock[][]>([blocks]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Delete modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Autosave
  const {
    hasDraft,
    draftSavedAt,
    recoverDraft,
    dismissDraft,
    clearDraft,
  } = useAutosave(
    { name, type, subject, previewText, blocks, styles },
    {
      templateKey: template.id,
      onRecover: (draft) => {
        setName(draft.name);
        setType(draft.type);
        setSubject(draft.subject);
        setPreviewText(draft.previewText);
        setBlocks(draft.blocks);
        setStyles(draft.styles as TemplateStyles);
      },
    }
  );

  const saveToHistory = useCallback(
    (newBlocks: ContentBlock[]) => {
      setHistory((prev) => [...prev.slice(0, historyIndex + 1), newBlocks]);
      setHistoryIndex((prev) => prev + 1);
    },
    [historyIndex]
  );

  const addBlock = useCallback(
    (blockType: string) => {
      const newBlock: ContentBlock = {
        id: uuidv4(),
        type: blockType as ContentBlock["type"],
        content: getDefaultContent(blockType),
      };
      const newBlocks = [...blocks, newBlock];
      setBlocks(newBlocks);
      setSelectedBlockId(newBlock.id);
      saveToHistory(newBlocks);
    },
    [blocks, saveToHistory]
  );

  const removeBlock = useCallback(
    (blockId: string) => {
      const newBlocks = blocks.filter((b) => b.id !== blockId);
      setBlocks(newBlocks);
      setSelectedBlockId(null);
      saveToHistory(newBlocks);
    },
    [blocks, saveToHistory]
  );

  const updateBlock = useCallback(
    (blockId: string, content: Record<string, any>) => {
      const newBlocks = blocks.map((b) =>
        b.id === blockId ? { ...b, content: { ...b.content, ...content } } : b
      );
      setBlocks(newBlocks);
    },
    [blocks]
  );

  const reorderBlocks = useCallback((newBlocks: ContentBlock[]) => {
    setBlocks(newBlocks);
    saveToHistory(newBlocks);
  }, [saveToHistory]);

  const duplicateBlock = useCallback((blockId: string) => {
    const blockIndex = blocks.findIndex((b) => b.id === blockId);
    if (blockIndex === -1) return;
    const block = blocks[blockIndex];
    const newBlock: ContentBlock = {
      id: uuidv4(),
      type: block.type,
      content: { ...block.content },
    };
    const newBlocks = [...blocks];
    newBlocks.splice(blockIndex + 1, 0, newBlock);
    setBlocks(newBlocks);
    setSelectedBlockId(newBlock.id);
    saveToHistory(newBlocks);
  }, [blocks, saveToHistory]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setBlocks(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setBlocks(history[historyIndex + 1]);
    }
  }, [history, historyIndex]);

  const generateHtml = useCallback(() => {
    const contentHtml = blocks
      .map((block) => {
        switch (block.type) {
          case "text":
            return `<p style="margin: 0 0 20px; color: ${styles.textColor}; line-height: 1.6; font-family: ${styles.fontFamily};">${block.content.text || ""}</p>`;
          case "button":
            return `<p style="margin: 0 0 20px;"><a href="${block.content.url || "#"}" style="display: inline-block; padding: 12px 24px; background-color: ${styles.primaryColor}; color: #ffffff; text-decoration: none; border-radius: 4px; font-family: ${styles.fontFamily};">${block.content.text || "Click Here"}</a></p>`;
          case "image":
            return block.content.url
              ? `<p style="margin: 0 0 20px;"><img src="${block.content.url}" alt="${block.content.alt || ""}" style="max-width: 100%; height: auto; display: block;" /></p>`
              : "";
          case "divider":
            return `<hr style="border: none; border-top: 1px solid #dddddd; margin: 20px 0;" />`;
          case "spacer":
            return `<div style="height: ${block.content.height || 20}px;"></div>`;
          case "html":
            return block.content.html || "";
          default:
            return "";
        }
      })
      .join("\n");

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: ${styles.backgroundColor}; font-family: ${styles.fontFamily};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${styles.backgroundColor};">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="${styles.contentWidth}" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="padding: 40px;">
${contentHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }, [blocks, styles]);

  const handleSubmit = useCallback(() => {
    // Clear autosave draft on submit
    clearDraft();

    const formData = new FormData();
    formData.append("name", name);
    formData.append("type", type);
    formData.append("subject", subject);
    formData.append("previewText", previewText);
    formData.append("bodyHtml", generateHtml());
    formData.append("content", JSON.stringify({ blocks, styles }));
    submit(formData, { method: "post" });
  }, [name, type, subject, previewText, generateHtml, blocks, styles, submit, clearDraft]);

  // Apply brand kit to current styles
  const applyBrandKit = useCallback((brandKit: BrandKit) => {
    setStyles({
      ...styles,
      primaryColor: brandKit.primaryColor,
      backgroundColor: brandKit.backgroundColor,
      textColor: brandKit.textColor,
      linkColor: brandKit.linkColor,
      fontFamily: brandKit.fontFamily,
    });
  }, [styles]);

  // Update a single style property
  const updateStyle = useCallback((key: string, value: string) => {
    setStyles((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Apply AI-generated content to the editor
  const handleAIApplyContent = useCallback((content: string) => {
    // If a block is selected and it's a text block, update it
    if (selectedBlockId) {
      const block = blocks.find((b) => b.id === selectedBlockId);
      if (block && block.type === "text") {
        const newBlocks = blocks.map((b) =>
          b.id === selectedBlockId ? { ...b, content: { ...b.content, text: content } } : b
        );
        setBlocks(newBlocks);
        saveToHistory(newBlocks);
        return;
      }
    }
    // Otherwise, add as a new text block
    const newBlock: ContentBlock = {
      id: uuidv4(),
      type: "text",
      content: { text: content },
    };
    const newBlocks = [...blocks, newBlock];
    setBlocks(newBlocks);
    setSelectedBlockId(newBlock.id);
    saveToHistory(newBlocks);
  }, [selectedBlockId, blocks, saveToHistory]);

  const handleDelete = useCallback(() => {
    const formData = new FormData();
    formData.append("_action", "delete");
    submit(formData, { method: "post" });
  }, [submit]);

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId);

  // Get selected block content for AI enhancement
  const selectedBlockContent = selectedBlock?.type === "text" ? selectedBlock.content.text : undefined;

  const tabs = [
    { id: "content", content: "Content", accessibilityLabel: "Content blocks" },
    { id: "styles", content: "Styles", accessibilityLabel: "Template styles" },
    { id: "ai", content: "AI", accessibilityLabel: "AI Assistant" },
  ];

  return (
    <Page
      title={`Edit: ${template.name}`}
      subtitle="Modify your email template with the visual editor"
      backAction={{ content: "Templates", onAction: () => navigate("/app/marketing/templates") }}
      primaryAction={{
        content: "Save Changes",
        disabled: !name || !subject,
        onAction: handleSubmit,
      }}
      secondaryActions={[
        {
          content: "Delete",
          destructive: true,
          onAction: () => setDeleteModalOpen(true),
        },
      ]}
    >
      <Layout>
        {(actionData as any)?.error && (
          <Layout.Section>
            <Banner tone="critical" title="Error">
              <p>{(actionData as any).error}</p>
            </Banner>
          </Layout.Section>
        )}

        {(actionData as any)?.success && (
          <Layout.Section>
            <Banner tone="success" title="Success">
              <p>{(actionData as any).message || "Template saved successfully"}</p>
            </Banner>
          </Layout.Section>
        )}

        {hasDraft && (
          <Layout.Section>
            <Banner
              title="Unsaved changes found"
              tone="warning"
              action={{ content: "Recover changes", onAction: recoverDraft }}
              secondaryAction={{ content: "Dismiss", onAction: dismissDraft }}
            >
              <p>
                You have unsaved changes from {draftSavedAt ? formatRelativeTime(draftSavedAt) : "earlier"}.
                Would you like to recover them?
              </p>
            </Banner>
          </Layout.Section>
        )}

        {/* Template Settings */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Template Settings
              </Text>
              <InlineStack gap="400" wrap>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <TextField
                    label="Template Name"
                    value={name}
                    onChange={setName}
                    placeholder="e.g., Welcome Email"
                    autoComplete="off"
                    requiredIndicator
                  />
                </div>
                <div style={{ flex: "1 1 200px" }}>
                  <Select
                    label="Template Type"
                    options={TEMPLATE_TYPES}
                    value={type}
                    onChange={setType}
                  />
                </div>
              </InlineStack>
              <InlineStack gap="400" wrap>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <TextField
                    label="Subject Line"
                    value={subject}
                    onChange={setSubject}
                    placeholder="e.g., Welcome to {{tier_name}}!"
                    autoComplete="off"
                    requiredIndicator
                    helpText="Use {{customer_name}}, {{tier_name}}, {{store_credit}} for personalization"
                  />
                </div>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <TextField
                    label="Preview Text"
                    value={previewText}
                    onChange={setPreviewText}
                    placeholder="Text shown in inbox preview"
                    autoComplete="off"
                  />
                </div>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Editor */}
        <Layout.Section>
          <div className="rp-editor-grid">
            {/* Left Sidebar - Blocks */}
            <Card>
              <BlockStack gap="300">
                <Tabs tabs={tabs} selected={activeTab} onSelect={setActiveTab} fitted />

                {activeTab === 0 && (
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      Add Content
                    </Text>
                    {BLOCK_TYPES.map((blockType) => (
                      <Box
                        key={blockType.id}
                        padding="200"
                        background="bg-surface-secondary"
                        borderRadius="150"
                      >
                        <InlineStack gap="200" blockAlign="center" wrap={false}>
                          <Icon source={blockType.icon} tone="base" />
                          <BlockStack gap="0">
                            <Text as="span" variant="bodySm" fontWeight="medium">
                              {blockType.label}
                            </Text>
                          </BlockStack>
                          <div style={{ marginLeft: "auto" }}>
                            <Button
                              size="slim"
                              icon={PlusIcon}
                              onClick={() => addBlock(blockType.id)}
                              accessibilityLabel={`Add ${blockType.label}`}
                            />
                          </div>
                        </InlineStack>
                      </Box>
                    ))}
                  </BlockStack>
                )}

                {activeTab === 1 && (
                  <BrandKitPanel
                    brandKit={loaderData.brandKit}
                    currentStyles={styles as any}
                    onApplyBrandKit={applyBrandKit}
                    onStyleChange={updateStyle}
                    brandKitEnabled={loaderData.brandKitEnabled}
                  />
                )}

                {activeTab === 2 && (
                  <AIAssistantPanel
                    templateType={type}
                    shopName={(loaderData as any).shop?.replace(".myshopify.com", "") || ""}
                    currentSubject={subject}
                    previewText={previewText}
                    selectedBlockContent={selectedBlockContent}
                    onApplyContent={handleAIApplyContent}
                    onUpdateSubject={setSubject}
                  />
                )}
              </BlockStack>
            </Card>

            {/* Center - Preview */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="100">
                    <Button
                      icon={UndoIcon}
                      onClick={undo}
                      disabled={historyIndex === 0}
                      accessibilityLabel="Undo"
                      size="slim"
                    />
                    <Button
                      icon={RedoIcon}
                      onClick={redo}
                      disabled={historyIndex === history.length - 1}
                      accessibilityLabel="Redo"
                      size="slim"
                    />
                  </InlineStack>
                  <InlineStack gap="100">
                    <Button
                      icon={DesktopIcon}
                      pressed={previewMode === "desktop"}
                      onClick={() => setPreviewMode("desktop")}
                      accessibilityLabel="Desktop"
                      size="slim"
                    />
                    <Button
                      icon={MobileIcon}
                      pressed={previewMode === "mobile"}
                      onClick={() => setPreviewMode("mobile")}
                      accessibilityLabel="Mobile"
                      size="slim"
                    />
                  </InlineStack>
                </InlineStack>

                <Divider />

                <div
                  style={{
                    backgroundColor: styles.backgroundColor,
                    padding: "16px",
                    borderRadius: "8px",
                    minHeight: "350px",
                    overflow: "auto",
                  }}
                >
                  <div
                    style={{
                      maxWidth: previewMode === "mobile" ? "320px" : `${styles.contentWidth}px`,
                      margin: "0 auto",
                      backgroundColor: "#ffffff",
                      borderRadius: "8px",
                      padding: "32px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    }}
                  >
                    {blocks.length === 0 ? (
                      <Box padding="600">
                        <Text as="p" tone="subdued" alignment="center">
                          Add content blocks from the left panel
                        </Text>
                      </Box>
                    ) : (
                      <div style={{ paddingLeft: "40px" }}>
                        <SortableBlockList
                          blocks={blocks}
                          selectedBlockId={selectedBlockId}
                          styles={styles}
                          onBlocksReorder={reorderBlocks}
                          onBlockSelect={setSelectedBlockId}
                          onBlockUpdate={updateBlock}
                          onBlockDelete={removeBlock}
                          onBlockDuplicate={duplicateBlock}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </BlockStack>
            </Card>

            {/* Right Sidebar - Block Settings */}
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  Block Settings
                </Text>
                {selectedBlock ? (
                  <BlockSettings
                    block={selectedBlock}
                    onUpdate={(content) => updateBlock(selectedBlock.id, content)}
                  />
                ) : (
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <Text as="p" tone="subdued" alignment="center" variant="bodySm">
                      Select a block to edit
                    </Text>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </div>
        </Layout.Section>

        {/* Variables Reference */}
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Personalization Variables
              </Text>
              <InlineStack gap="100" wrap>
                <Badge tone="info">{"{{customer_name}}"}</Badge>
                <Badge tone="info">{"{{tier_name}}"}</Badge>
                <Badge tone="info">{"{{store_credit}}"}</Badge>
                <Badge tone="info">{"{{shop_name}}"}</Badge>
                <Badge tone="info">{"{{cashback_rate}}"}</Badge>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete template?"
        primaryAction={{
          content: "Delete",
          destructive: true,
          onAction: handleDelete,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setDeleteModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Are you sure you want to delete "{template.name}"? This action cannot be undone.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

// ============================================
// HELPERS
// ============================================

function getDefaultContent(blockType: string): Record<string, any> {
  switch (blockType) {
    case "text":
      return { text: "Enter your text here..." };
    case "button":
      return { text: "Click Here", url: "#", style: "primary" };
    case "image":
      return { url: "", alt: "" };
    case "divider":
      return { color: "#dddddd", thickness: 1 };
    case "spacer":
      return { height: 20 };
    case "html":
      return { html: "" };
    case "hero":
      return {
        imageUrl: "",
        overlayOpacity: 50,
        overlayColor: "#000000",
        headingText: "Your Heading Here",
        subheadingText: "",
        buttonText: "Learn More",
        buttonUrl: "#",
        height: "medium",
      };
    case "testimonial":
      return {
        quote: "This product exceeded my expectations!",
        author: "Happy Customer",
        authorTitle: "Verified Buyer",
        rating: 5,
        style: "card",
      };
    case "countdown":
      return {
        targetDate: "",
        label: "Sale ends in",
        expiredMessage: "Sale has ended",
        backgroundColor: "#000000",
        textColor: "#ffffff",
      };
    case "social":
      return {
        links: [],
        iconSize: "medium",
        alignment: "center",
      };
    case "product":
      return {
        productId: "",
        variantId: "",
        title: "Select a product",
        imageUrl: null,
        price: "",
        showImage: true,
        showPrice: true,
        buttonText: "Shop Now",
      };
    case "columns":
      return {
        leftColumn: [],
        rightColumn: [],
        columnRatio: "50-50",
        gap: 20,
        stackOnMobile: true,
      };
    default:
      return {};
  }
}

function _BlockPreview({ block, styles }: { block: ContentBlock; styles: TemplateStyles }) {
  switch (block.type) {
    case "text":
      return (
        <p
          style={{
            margin: "0 0 16px",
            color: styles.textColor,
            lineHeight: 1.6,
            fontFamily: styles.fontFamily,
          }}
        >
          {block.content.text || "Enter text..."}
        </p>
      );
    case "button":
      return (
        <p style={{ margin: "0 0 16px" }}>
          <span
            style={{
              display: "inline-block",
              padding: "12px 24px",
              backgroundColor: styles.primaryColor,
              color: "#ffffff",
              textDecoration: "none",
              borderRadius: "4px",
              fontFamily: styles.fontFamily,
            }}
          >
            {block.content.text || "Click Here"}
          </span>
        </p>
      );
    case "image":
      return block.content.url ? (
        <p style={{ margin: "0 0 16px" }}>
          <img
            src={block.content.url}
            alt={block.content.alt || ""}
            style={{ maxWidth: "100%", height: "auto", display: "block" }}
          />
        </p>
      ) : (
        <Box padding="600" background="bg-surface-secondary" borderRadius="200">
          <Text as="p" tone="subdued" alignment="center" variant="bodySm">
            Add image URL in settings
          </Text>
        </Box>
      );
    case "divider":
      return (
        <hr
          style={{
            border: "none",
            borderTop: `${block.content.thickness || 1}px solid ${block.content.color || "#dddddd"}`,
            margin: "16px 0",
          }}
        />
      );
    case "spacer":
      return <div style={{ height: `${block.content.height || 20}px` }} />;
    case "html":
      return block.content.html ? (
        // SECURITY: Sanitize HTML to prevent XSS attacks
        <div dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(block.content.html) }} />
      ) : (
        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
          <Text as="p" tone="subdued" alignment="center" variant="bodySm">
            Add HTML in settings
          </Text>
        </Box>
      );
    case "hero": {
      const heights = { small: "150px", medium: "200px", large: "280px" };
      return (
        <div
          style={{
            position: "relative",
            height: heights[block.content.height as keyof typeof heights] || "200px",
            backgroundImage: block.content.imageUrl ? `url(${block.content.imageUrl})` : undefined,
            backgroundColor: block.content.imageUrl ? undefined : "#e5e7eb",
            backgroundSize: "cover",
            backgroundPosition: "center",
            borderRadius: "8px",
            overflow: "hidden",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: block.content.overlayColor || "#000",
              opacity: (block.content.overlayOpacity || 50) / 100,
            }}
          />
          <div
            style={{
              position: "relative",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              padding: "24px",
              textAlign: "center",
              color: "#fff",
            }}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: "24px", fontWeight: 700 }}>
              {block.content.headingText || "Your Heading"}
            </h2>
            {block.content.subheadingText && (
              <p style={{ margin: "0 0 16px", fontSize: "14px", opacity: 0.9 }}>
                {block.content.subheadingText}
              </p>
            )}
            {block.content.buttonText && (
              <span
                style={{
                  display: "inline-block",
                  padding: "10px 20px",
                  backgroundColor: styles.primaryColor || "#fff",
                  color: "#000",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "14px",
                }}
              >
                {block.content.buttonText}
              </span>
            )}
          </div>
        </div>
      );
    }
    case "testimonial": {
      const stars = block.content.rating ? "★".repeat(block.content.rating) + "☆".repeat(5 - block.content.rating) : "";
      return (
        <div
          style={{
            padding: "20px",
            backgroundColor: block.content.style === "card" ? "#f9fafb" : "transparent",
            border: block.content.style === "bordered" ? "1px solid #e5e7eb" : "none",
            borderRadius: "8px",
            marginBottom: "16px",
          }}
        >
          {stars && (
            <div style={{ color: "#f59e0b", marginBottom: "8px" }}>{stars}</div>
          )}
          <blockquote
            style={{
              margin: 0,
              fontSize: "16px",
              fontStyle: "italic",
              color: styles.textColor,
              marginBottom: "12px",
            }}
          >
            "{block.content.quote || "Customer testimonial goes here..."}"
          </blockquote>
          <div style={{ fontWeight: 600 }}>{block.content.author || "Customer Name"}</div>
          {block.content.authorTitle && (
            <div style={{ fontSize: "14px", color: "#6b7280" }}>
              {block.content.authorTitle}
            </div>
          )}
        </div>
      );
    }
    case "countdown":
      return (
        <div
          style={{
            padding: "20px",
            backgroundColor: block.content.backgroundColor || "#000",
            color: block.content.textColor || "#fff",
            textAlign: "center",
            borderRadius: "8px",
            marginBottom: "16px",
          }}
        >
          <div style={{ fontSize: "14px", marginBottom: "8px" }}>
            {block.content.label || "Sale ends in"}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: "16px" }}>
            {["Days", "Hours", "Min", "Sec"].map((unit) => (
              <div key={unit} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "24px", fontWeight: 700 }}>00</div>
                <div style={{ fontSize: "11px", opacity: 0.8 }}>{unit}</div>
              </div>
            ))}
          </div>
        </div>
      );
    case "social": {
      const platforms = block.content.links || [];
      return (
        <div
          style={{
            padding: "16px",
            textAlign: block.content.alignment || "center",
            marginBottom: "16px",
          }}
        >
          {platforms.length === 0 ? (
            <Text as="p" tone="subdued">Add social links in settings</Text>
          ) : (
            <div style={{ display: "inline-flex", gap: "12px" }}>
              {platforms.map((link: { platform: string; url: string }, i: number) => (
                <div
                  key={i}
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    backgroundColor: "#6b7280",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: "14px",
                    fontWeight: 700,
                  }}
                >
                  {link.platform.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    case "product":
      return (
        <div
          style={{
            padding: "16px",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            display: "flex",
            gap: "16px",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          {block.content.showImage !== false && (
            <div
              style={{
                width: "80px",
                height: "80px",
                background: block.content.imageUrl ? `url(${block.content.imageUrl}) center/cover` : "#f3f4f6",
                borderRadius: "4px",
                flexShrink: 0,
              }}
            />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>
              {block.content.title || "Product Name"}
            </div>
            {block.content.showPrice !== false && block.content.price && (
              <div style={{ color: styles.primaryColor, fontWeight: 500 }}>
                {block.content.price}
              </div>
            )}
            <div
              style={{
                display: "inline-block",
                marginTop: "8px",
                padding: "6px 12px",
                backgroundColor: styles.primaryColor || "#000",
                color: "#fff",
                borderRadius: "4px",
                fontSize: "13px",
              }}
            >
              {block.content.buttonText || "Shop Now"}
            </div>
          </div>
        </div>
      );
    case "columns":
      return (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: block.content.columnRatio === "33-67" ? "1fr 2fr" : block.content.columnRatio === "67-33" ? "2fr 1fr" : "1fr 1fr",
            gap: `${block.content.gap || 20}px`,
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              background: "#f9fafb",
              padding: "20px",
              borderRadius: "4px",
              minHeight: "60px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#9ca3af",
              fontSize: "13px",
            }}
          >
            Left Column
          </div>
          <div
            style={{
              background: "#f9fafb",
              padding: "20px",
              borderRadius: "4px",
              minHeight: "60px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#9ca3af",
              fontSize: "13px",
            }}
          >
            Right Column
          </div>
        </div>
      );
    default:
      return (
        <Text as="p" tone="subdued">
          Unknown block type: {block.type}
        </Text>
      );
  }
}

function BlockSettings({
  block,
  onUpdate,
}: {
  block: ContentBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  switch (block.type) {
    case "text":
      return (
        <TextFieldWithVariables
          label="Text Content"
          value={block.content.text || ""}
          onChange={(v) => onUpdate({ text: v })}
          multiline={4}
          placeholder="Enter your text here. Use {{variables}} for personalization."
        />
      );
    case "button":
      return (
        <BlockStack gap="200">
          <TextFieldWithVariables
            label="Button Text"
            value={block.content.text || ""}
            onChange={(v) => onUpdate({ text: v })}
            placeholder="e.g., Shop Now"
          />
          <TextField
            label="Button URL"
            value={block.content.url || ""}
            onChange={(v) => onUpdate({ url: v })}
            autoComplete="off"
            placeholder="https://..."
          />
        </BlockStack>
      );
    case "image":
      return (
        <BlockStack gap="200">
          <TextField
            label="Image URL"
            value={block.content.url || ""}
            onChange={(v) => onUpdate({ url: v })}
            autoComplete="off"
            placeholder="https://..."
          />
          <TextFieldWithVariables
            label="Alt Text"
            value={block.content.alt || ""}
            onChange={(v) => onUpdate({ alt: v })}
            placeholder="Describe the image for accessibility"
          />
        </BlockStack>
      );
    case "divider":
      return (
        <BlockStack gap="200">
          <ColorPickerFieldInline
            label="Color"
            color={block.content.color || "#dddddd"}
            onChange={(v) => onUpdate({ color: v })}
          />
          <TextField
            label="Thickness (px)"
            value={String(block.content.thickness || 1)}
            onChange={(v) => onUpdate({ thickness: parseInt(v) || 1 })}
            autoComplete="off"
            type="number"
          />
        </BlockStack>
      );
    case "spacer":
      return (
        <TextField
          label="Height (px)"
          value={String(block.content.height || 20)}
          onChange={(v) => onUpdate({ height: parseInt(v) || 20 })}
          autoComplete="off"
          type="number"
        />
      );
    case "html":
      return (
        <TextField
          label="HTML Code"
          value={block.content.html || ""}
          onChange={(v) => onUpdate({ html: v })}
          multiline={6}
          autoComplete="off"
          monospaced
        />
      );
    case "hero":
      return (
        <BlockStack gap="200">
          <TextField
            label="Image URL"
            value={block.content.imageUrl || ""}
            onChange={(v) => onUpdate({ imageUrl: v })}
            autoComplete="off"
            placeholder="https://..."
          />
          <TextFieldWithVariables
            label="Heading"
            value={block.content.headingText || ""}
            onChange={(v) => onUpdate({ headingText: v })}
            placeholder="e.g., Welcome, {{customer_name}}!"
          />
          <TextFieldWithVariables
            label="Subheading"
            value={block.content.subheadingText || ""}
            onChange={(v) => onUpdate({ subheadingText: v })}
            placeholder="Optional subheading text"
          />
          <TextFieldWithVariables
            label="Button Text"
            value={block.content.buttonText || ""}
            onChange={(v) => onUpdate({ buttonText: v })}
            placeholder="e.g., Shop Now"
          />
          <TextField
            label="Button URL"
            value={block.content.buttonUrl || ""}
            onChange={(v) => onUpdate({ buttonUrl: v })}
            autoComplete="off"
            placeholder="https://..."
          />
          <Select
            label="Height"
            options={[
              { label: "Small", value: "small" },
              { label: "Medium", value: "medium" },
              { label: "Large", value: "large" },
            ]}
            value={block.content.height || "medium"}
            onChange={(v) => onUpdate({ height: v })}
          />
          <TextField
            label="Overlay Opacity (%)"
            value={String(block.content.overlayOpacity || 50)}
            onChange={(v) => onUpdate({ overlayOpacity: parseInt(v) || 50 })}
            autoComplete="off"
            type="number"
          />
        </BlockStack>
      );
    case "testimonial":
      return (
        <BlockStack gap="200">
          <TextFieldWithVariables
            label="Quote"
            value={block.content.quote || ""}
            onChange={(v) => onUpdate({ quote: v })}
            multiline={3}
            placeholder="Customer testimonial goes here..."
          />
          <TextFieldWithVariables
            label="Author Name"
            value={block.content.author || ""}
            onChange={(v) => onUpdate({ author: v })}
            placeholder="e.g., {{customer_name}}"
          />
          <TextFieldWithVariables
            label="Author Title"
            value={block.content.authorTitle || ""}
            onChange={(v) => onUpdate({ authorTitle: v })}
            placeholder="e.g., {{tier_name}} Member"
          />
          <Select
            label="Rating"
            options={[
              { label: "No rating", value: "0" },
              { label: "1 star", value: "1" },
              { label: "2 stars", value: "2" },
              { label: "3 stars", value: "3" },
              { label: "4 stars", value: "4" },
              { label: "5 stars", value: "5" },
            ]}
            value={String(block.content.rating || 5)}
            onChange={(v) => onUpdate({ rating: parseInt(v) })}
          />
          <Select
            label="Style"
            options={[
              { label: "Simple", value: "simple" },
              { label: "Card", value: "card" },
              { label: "Bordered", value: "bordered" },
            ]}
            value={block.content.style || "card"}
            onChange={(v) => onUpdate({ style: v })}
          />
        </BlockStack>
      );
    case "countdown":
      return (
        <BlockStack gap="200">
          <TextField
            label="Target Date"
            value={block.content.targetDate || ""}
            onChange={(v) => onUpdate({ targetDate: v })}
            autoComplete="off"
            type="datetime-local"
            helpText="When the countdown should end"
          />
          <TextFieldWithVariables
            label="Label"
            value={block.content.label || ""}
            onChange={(v) => onUpdate({ label: v })}
            placeholder="e.g., Sale ends in"
          />
          <TextFieldWithVariables
            label="Expired Message"
            value={block.content.expiredMessage || ""}
            onChange={(v) => onUpdate({ expiredMessage: v })}
            placeholder="e.g., Sale has ended"
          />
          <ColorPickerFieldInline
            label="Background Color"
            color={block.content.backgroundColor || "#000000"}
            onChange={(v) => onUpdate({ backgroundColor: v })}
          />
          <ColorPickerFieldInline
            label="Text Color"
            color={block.content.textColor || "#ffffff"}
            onChange={(v) => onUpdate({ textColor: v })}
          />
        </BlockStack>
      );
    case "social":
      return (
        <BlockStack gap="200">
          <Text as="p" variant="bodySm" tone="subdued">
            Add social media links. Icons will be displayed for each platform.
          </Text>
          <Select
            label="Icon Size"
            options={[
              { label: "Small", value: "small" },
              { label: "Medium", value: "medium" },
              { label: "Large", value: "large" },
            ]}
            value={block.content.iconSize || "medium"}
            onChange={(v) => onUpdate({ iconSize: v })}
          />
          <Select
            label="Alignment"
            options={[
              { label: "Left", value: "left" },
              { label: "Center", value: "center" },
              { label: "Right", value: "right" },
            ]}
            value={block.content.alignment || "center"}
            onChange={(v) => onUpdate({ alignment: v })}
          />
          <TextField
            label="Links (JSON)"
            value={JSON.stringify(block.content.links || [])}
            onChange={(v) => {
              try {
                onUpdate({ links: JSON.parse(v) });
              } catch (e) {
                // Invalid JSON, ignore
              }
            }}
            multiline={3}
            autoComplete="off"
            monospaced
            helpText='Format: [{"platform":"facebook","url":"https://..."}]'
          />
        </BlockStack>
      );
    case "product":
      return (
        <BlockStack gap="200">
          <TextFieldWithVariables
            label="Product Title"
            value={block.content.title || ""}
            onChange={(v) => onUpdate({ title: v })}
            placeholder="Product name"
          />
          <TextField
            label="Product Image URL"
            value={block.content.imageUrl || ""}
            onChange={(v) => onUpdate({ imageUrl: v })}
            autoComplete="off"
            placeholder="https://..."
          />
          <TextField
            label="Price"
            value={block.content.price || ""}
            onChange={(v) => onUpdate({ price: v })}
            autoComplete="off"
            placeholder="e.g., $29.99"
          />
          <TextFieldWithVariables
            label="Button Text"
            value={block.content.buttonText || "Shop Now"}
            onChange={(v) => onUpdate({ buttonText: v })}
            placeholder="e.g., Shop Now"
          />
        </BlockStack>
      );
    case "columns":
      return (
        <BlockStack gap="200">
          <Select
            label="Column Ratio"
            options={[
              { label: "50% / 50%", value: "50-50" },
              { label: "33% / 67%", value: "33-67" },
              { label: "67% / 33%", value: "67-33" },
            ]}
            value={block.content.columnRatio || "50-50"}
            onChange={(v) => onUpdate({ columnRatio: v })}
          />
          <TextField
            label="Gap (px)"
            value={String(block.content.gap || 20)}
            onChange={(v) => onUpdate({ gap: parseInt(v) || 20 })}
            autoComplete="off"
            type="number"
          />
          <Text as="p" variant="bodySm" tone="subdued">
            Two-column layout. Nested content editing coming soon.
          </Text>
        </BlockStack>
      );
    default:
      return (
        <Text as="p" tone="subdued">
          No settings available
        </Text>
      );
  }
}
