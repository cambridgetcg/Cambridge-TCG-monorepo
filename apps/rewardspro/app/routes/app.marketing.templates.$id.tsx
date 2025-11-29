import { json, LoaderFunctionArgs, ActionFunctionArgs, redirect } from "@remix-run/node";
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
  HashtagIcon,
  DesktopIcon,
  MobileIcon,
  UndoIcon,
  RedoIcon,
  DeleteIcon,
  PlusIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  MinusIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { v4 as uuidv4 } from "uuid";

// ============================================
// TYPES
// ============================================

interface ContentBlock {
  id: string;
  type: "text" | "image" | "button" | "divider" | "spacer" | "html";
  content: Record<string, any>;
}

interface TemplateStyles {
  backgroundColor: string;
  contentWidth: string;
  fontFamily: string;
  primaryColor: string;
  textColor: string;
  linkColor: string;
}

interface Template {
  id: string;
  name: string;
  type: string;
  subject: string;
  previewText: string | null;
  bodyHtml: string;
  createdAt: string;
  updatedAt: string;
}

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
    const template = await db.emailTemplate.findFirst({
      where: {
        id: templateId,
        shop,
      },
    });

    if (!template) {
      throw new Response("Template not found", { status: 404 });
    }

    console.log("[Template Edit] Loaded template:", template.name);
    return json({
      template: {
        id: template.id,
        name: template.name,
        type: template.type,
        subject: template.subject || "",
        previewText: template.previewText,
        bodyHtml: template.bodyHtml || "",
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error("[Template Edit] Error:", error);
    if (error instanceof Response) throw error;
    throw new Response(error.message, { status: 500 });
  }
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
      await db.emailTemplate.deleteMany({
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

  if (!name || !type || !subject) {
    return json({ error: "Name, type, and subject are required" }, { status: 400 });
  }

  try {
    await db.emailTemplate.updateMany({
      where: { id: templateId, shop },
      data: {
        name,
        type,
        subject,
        previewText: previewText || "",
        bodyHtml: bodyHtml || generateDefaultHtml(),
        bodyText: stripHtml(bodyHtml || ""),
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
  const { template } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  // Template metadata
  const [name, setName] = useState(template.name);
  const [type, setType] = useState(template.type);
  const [subject, setSubject] = useState(template.subject);
  const [previewText, setPreviewText] = useState(template.previewText || "");

  // Editor state - parse existing HTML to blocks on mount
  const [blocks, setBlocks] = useState<ContentBlock[]>(() =>
    parseHtmlToBlocks(template.bodyHtml)
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [activeTab, setActiveTab] = useState(0);

  // Styles - extract from existing HTML
  const [styles, setStyles] = useState<TemplateStyles>(() =>
    parseStylesFromHtml(template.bodyHtml)
  );

  // History for undo/redo
  const [history, setHistory] = useState<ContentBlock[][]>([blocks]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Delete modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

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

  const moveBlock = useCallback(
    (blockId: string, direction: "up" | "down") => {
      const index = blocks.findIndex((b) => b.id === blockId);
      if (index === -1) return;
      if (direction === "up" && index === 0) return;
      if (direction === "down" && index === blocks.length - 1) return;

      const newBlocks = [...blocks];
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      [newBlocks[index], newBlocks[swapIndex]] = [newBlocks[swapIndex], newBlocks[index]];
      setBlocks(newBlocks);
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
    const formData = new FormData();
    formData.append("name", name);
    formData.append("type", type);
    formData.append("subject", subject);
    formData.append("previewText", previewText);
    formData.append("bodyHtml", generateHtml());
    submit(formData, { method: "post" });
  }, [name, type, subject, previewText, generateHtml, submit]);

  const handleDelete = useCallback(() => {
    const formData = new FormData();
    formData.append("_action", "delete");
    submit(formData, { method: "post" });
  }, [submit]);

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId);

  const tabs = [
    { id: "content", content: "Content", accessibilityLabel: "Content blocks" },
    { id: "styles", content: "Styles", accessibilityLabel: "Template styles" },
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
        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical" title="Error">
              <p>{actionData.error}</p>
            </Banner>
          </Layout.Section>
        )}

        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success" title="Success">
              <p>{actionData.message || "Template saved successfully"}</p>
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
              <InlineStack gap="400" wrap={false}>
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Template Name"
                    value={name}
                    onChange={setName}
                    placeholder="e.g., Welcome Email"
                    autoComplete="off"
                    requiredIndicator
                  />
                </div>
                <div style={{ width: 200 }}>
                  <Select
                    label="Template Type"
                    options={TEMPLATE_TYPES}
                    value={type}
                    onChange={setType}
                  />
                </div>
              </InlineStack>
              <InlineStack gap="400" wrap={false}>
                <div style={{ flex: 1 }}>
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
                <div style={{ flex: 1 }}>
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "260px 1fr 280px",
              gap: "16px",
              minHeight: "500px",
            }}
          >
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
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      Template Styles
                    </Text>
                    <TextField
                      label="Background Color"
                      value={styles.backgroundColor}
                      onChange={(v) => setStyles({ ...styles, backgroundColor: v })}
                      autoComplete="off"
                    />
                    <TextField
                      label="Content Width (px)"
                      value={styles.contentWidth}
                      onChange={(v) => setStyles({ ...styles, contentWidth: v })}
                      autoComplete="off"
                      type="number"
                    />
                    <TextField
                      label="Primary Color"
                      value={styles.primaryColor}
                      onChange={(v) => setStyles({ ...styles, primaryColor: v })}
                      autoComplete="off"
                    />
                    <TextField
                      label="Text Color"
                      value={styles.textColor}
                      onChange={(v) => setStyles({ ...styles, textColor: v })}
                      autoComplete="off"
                    />
                    <Select
                      label="Font Family"
                      options={[
                        { label: "Arial", value: "Arial, sans-serif" },
                        { label: "Helvetica", value: "Helvetica, sans-serif" },
                        { label: "Georgia", value: "Georgia, serif" },
                        { label: "Verdana", value: "Verdana, sans-serif" },
                      ]}
                      value={styles.fontFamily}
                      onChange={(v) => setStyles({ ...styles, fontFamily: v })}
                    />
                  </BlockStack>
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
                      <BlockStack gap="0">
                        {blocks.map((block, index) => (
                          <div
                            key={block.id}
                            onClick={() => setSelectedBlockId(block.id)}
                            style={{
                              cursor: "pointer",
                              outline:
                                selectedBlockId === block.id
                                  ? "2px solid #2563eb"
                                  : "1px dashed transparent",
                              outlineOffset: "2px",
                              borderRadius: "4px",
                              padding: "4px",
                              position: "relative",
                              transition: "outline 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              if (selectedBlockId !== block.id) {
                                e.currentTarget.style.outline = "1px dashed #cbd5e1";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (selectedBlockId !== block.id) {
                                e.currentTarget.style.outline = "1px dashed transparent";
                              }
                            }}
                          >
                            {selectedBlockId === block.id && (
                              <div
                                style={{
                                  position: "absolute",
                                  top: "-28px",
                                  right: "0",
                                  display: "flex",
                                  gap: "2px",
                                  backgroundColor: "#2563eb",
                                  borderRadius: "4px",
                                  padding: "2px",
                                  zIndex: 10,
                                }}
                              >
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    size="micro"
                                    icon={ChevronUpIcon}
                                    onClick={() => moveBlock(block.id, "up")}
                                    disabled={index === 0}
                                    accessibilityLabel="Move up"
                                  />
                                </div>
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    size="micro"
                                    icon={ChevronDownIcon}
                                    onClick={() => moveBlock(block.id, "down")}
                                    disabled={index === blocks.length - 1}
                                    accessibilityLabel="Move down"
                                  />
                                </div>
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    size="micro"
                                    icon={DeleteIcon}
                                    tone="critical"
                                    onClick={() => removeBlock(block.id)}
                                    accessibilityLabel="Delete"
                                  />
                                </div>
                              </div>
                            )}
                            <BlockPreview block={block} styles={styles} />
                          </div>
                        ))}
                      </BlockStack>
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
    default:
      return {};
  }
}

function BlockPreview({ block, styles }: { block: ContentBlock; styles: TemplateStyles }) {
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
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
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
          </a>
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
        <div dangerouslySetInnerHTML={{ __html: block.content.html }} />
      ) : (
        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
          <Text as="p" tone="subdued" alignment="center" variant="bodySm">
            Add HTML in settings
          </Text>
        </Box>
      );
    default:
      return (
        <Text as="p" tone="subdued">
          Unknown block
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
        <TextField
          label="Text Content"
          value={block.content.text || ""}
          onChange={(v) => onUpdate({ text: v })}
          multiline={4}
          autoComplete="off"
        />
      );
    case "button":
      return (
        <BlockStack gap="200">
          <TextField
            label="Button Text"
            value={block.content.text || ""}
            onChange={(v) => onUpdate({ text: v })}
            autoComplete="off"
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
          <TextField
            label="Alt Text"
            value={block.content.alt || ""}
            onChange={(v) => onUpdate({ alt: v })}
            autoComplete="off"
          />
        </BlockStack>
      );
    case "divider":
      return (
        <BlockStack gap="200">
          <TextField
            label="Color"
            value={block.content.color || "#dddddd"}
            onChange={(v) => onUpdate({ color: v })}
            autoComplete="off"
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
    default:
      return (
        <Text as="p" tone="subdued">
          No settings available
        </Text>
      );
  }
}
