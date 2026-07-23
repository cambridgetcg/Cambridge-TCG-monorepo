import { json, redirect } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useNavigate, useActionData, useSubmit, useLoaderData } from "@remix-run/react";
import { useState, useCallback } from "react";
import { SortableBlockList } from "~/components/EmailEditor";
import type { ContentBlock, TemplateStyles } from "~/components/EmailEditor/types";
import { BrandKitPanel } from "~/components/BrandKit";
import { useAutosave, formatRelativeTime } from "~/hooks/useAutosave";
import { ColorPickerFieldInline } from "~/components/ColorPickerField";
import { TextFieldWithVariables } from "~/components/TextFieldWithVariables";
import { AIAssistantPanel } from "~/components/AIEmailAssistant";
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
  Tooltip,
  Collapsible,
} from "@shopify/polaris";
import {
  TextIcon,
  ImageIcon,
  ButtonIcon,
  CodeIcon,
  ProductIcon,
  LinkIcon,
  HashtagIcon,
  MobileIcon,
  DesktopIcon,
  UndoIcon,
  RedoIcon,
  PlusIcon,
  MinusIcon,
  EmailIcon,
  CheckIcon,
  QuestionCircleIcon,
  ClockIcon,
  ChatIcon,
  LayoutColumns2Icon,
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { v4 as uuidv4 } from "uuid";
import { guardInHouseRoute } from "~/services/marketing-mode.server";
import { sanitizeEmailHtml } from "~/utils/html-sanitizer";

// Types imported from ~/components/EmailEditor/types

// ============================================
// LOADER
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log("[Template New] Loader started");
  const { session } = await authenticate.admin(request);
  console.log("[Template New] Authenticated for shop:", session.shop);

  // Guard: Redirect Klaviyo mode users to main Marketing Hub
  const guardRedirect = await guardInHouseRoute(session.shop);
  if (guardRedirect) return guardRedirect;

  // Load brand kit settings from ShopSettings
  const shopSettings = await prisma.shopSettings.findUnique({
    where: { shop: session.shop },
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
  });

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

  return json({
    shop: session.shop,
    brandKit,
    brandKitEnabled: shopSettings?.brandKitEnabled || false,
  });
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

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const name = formData.get("name") as string;
  const type = formData.get("type") as string;
  const subject = formData.get("subject") as string;
  const previewText = formData.get("previewText") as string;
  const bodyHtml = formData.get("bodyHtml") as string;
  const contentJson = formData.get("content") as string;

  if (!name || !type || !subject) {
    return json({ error: "Name, type, and subject are required" }, { status: 400 });
  }

  // Parse block-based content structure (required field)
  let content: any = { blocks: [], styles: {} };
  try {
    if (contentJson) {
      content = JSON.parse(contentJson);
    }
  } catch (e) {
    console.error("[Template New] Error parsing content JSON:", e);
  }

  try {
    const templateId = uuidv4();
    await prisma.emailTemplate.create({
      data: {
        id: templateId,
        shop,
        name,
        type,
        subject,
        content, // Block-based content structure (required)
        previewText: previewText || "",
        bodyHtml: bodyHtml || generateDefaultHtml(),
        bodyText: stripHtml(bodyHtml || ""),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return redirect(`/app/marketing/templates/${templateId}`);
  } catch (error: any) {
    console.error("[Template New] Error creating template:", error);
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

// Template types with merchant-friendly descriptions
const TEMPLATE_TYPES = [
  {
    label: "Tier Welcome",
    value: "tier_welcome",
    description: "Sent when a customer joins a membership tier",
    trigger: "Automatic - when customer reaches tier spending threshold or purchases a tier"
  },
  {
    label: "Tier Upgrade",
    value: "tier_upgrade",
    description: "Celebrate when customers move to a higher tier",
    trigger: "Automatic - when customer qualifies for a better tier"
  },
  {
    label: "Tier Downgrade",
    value: "tier_downgrade",
    description: "Notify customers when their tier changes due to reduced spending",
    trigger: "Automatic - when customer no longer meets tier requirements"
  },
  {
    label: "Reward Expiry",
    value: "reward_expiry",
    description: "Remind customers about expiring rewards or store credit",
    trigger: "Automatic - sent before rewards expire"
  },
  {
    label: "Re-engagement",
    value: "inactive_reengagement",
    description: "Win back customers who haven't purchased recently",
    trigger: "Automatic - based on your inactivity settings"
  },
  {
    label: "Promotional",
    value: "promotional",
    description: "Marketing emails for sales, events, or announcements",
    trigger: "Manual - you choose when to send"
  },
  {
    label: "Transactional",
    value: "transactional",
    description: "Order confirmations, shipping updates, etc.",
    trigger: "Automatic - triggered by customer actions"
  },
];

// Starter templates to help merchants get started quickly
const STARTER_TEMPLATES = [
  {
    id: "welcome",
    name: "Welcome New Member",
    type: "tier_welcome",
    subject: "Welcome to {{tier_name}}, {{customer_name}}!",
    previewText: "You're now part of our loyalty program",
    blocks: [
      { id: "1", type: "text", content: { text: "Hi {{customer_name}}," } },
      { id: "2", type: "text", content: { text: "Welcome to {{tier_name}}! We're thrilled to have you as a valued member of our loyalty program." } },
      { id: "3", type: "text", content: { text: "As a {{tier_name}} member, you'll enjoy {{cashback_rate}} cashback on every purchase. Your current store credit balance is {{store_credit}}." } },
      { id: "4", type: "button", content: { text: "Start Shopping", url: "{{shop_url}}", style: "primary" } },
      { id: "5", type: "text", content: { text: "Thanks for being part of our community!\n\n- The {{shop_name}} Team" } },
    ],
  },
  {
    id: "upgrade",
    name: "Tier Upgrade Celebration",
    type: "tier_upgrade",
    subject: "Congratulations! You've been upgraded to {{tier_name}}",
    previewText: "You've unlocked new benefits",
    blocks: [
      { id: "1", type: "text", content: { text: "Great news, {{customer_name}}!" } },
      { id: "2", type: "text", content: { text: "Thanks to your loyalty, you've been upgraded to {{tier_name}}! This means you now enjoy even better rewards." } },
      { id: "3", type: "text", content: { text: "Your new cashback rate: {{cashback_rate}} on every purchase" } },
      { id: "4", type: "button", content: { text: "See My Benefits", url: "{{shop_url}}", style: "primary" } },
    ],
  },
  {
    id: "expiry",
    name: "Reward Expiry Reminder",
    type: "reward_expiry",
    subject: "{{customer_name}}, your {{store_credit}} expires soon",
    previewText: "Don't miss out on your rewards",
    blocks: [
      { id: "1", type: "text", content: { text: "Hi {{customer_name}}," } },
      { id: "2", type: "text", content: { text: "Just a friendly reminder that your store credit of {{store_credit}} will expire soon. Don't let it go to waste!" } },
      { id: "3", type: "button", content: { text: "Use My Credit Now", url: "{{shop_url}}", style: "primary" } },
    ],
  },
  {
    id: "winback",
    name: "We Miss You",
    type: "inactive_reengagement",
    subject: "{{customer_name}}, we miss you at {{shop_name}}",
    previewText: "Come back and see what's new",
    blocks: [
      { id: "1", type: "text", content: { text: "Hi {{customer_name}}," } },
      { id: "2", type: "text", content: { text: "It's been a while since your last visit. We've missed you!" } },
      { id: "3", type: "text", content: { text: "As a {{tier_name}} member, you still have {{store_credit}} waiting for you, plus {{cashback_rate}} cashback on your next purchase." } },
      { id: "4", type: "button", content: { text: "Shop Now", url: "{{shop_url}}", style: "primary" } },
    ],
  },
  {
    id: "blank",
    name: "Start from Scratch",
    type: "promotional",
    subject: "",
    previewText: "",
    blocks: [],
  },
];

// Personalization variables with merchant-friendly explanations
const PERSONALIZATION_VARIABLES = [
  {
    variable: "{{customer_name}}",
    label: "Customer Name",
    description: "Customer's first name (e.g., 'Sarah')",
    example: "Sarah"
  },
  {
    variable: "{{tier_name}}",
    label: "Tier Name",
    description: "Customer's current membership tier (e.g., 'Gold')",
    example: "Gold"
  },
  {
    variable: "{{store_credit}}",
    label: "Store Credit",
    description: "Customer's available store credit with currency (e.g., '$25.00')",
    example: "$25.00"
  },
  {
    variable: "{{shop_name}}",
    label: "Shop Name",
    description: "Your store's name",
    example: "My Store"
  },
  {
    variable: "{{cashback_rate}}",
    label: "Cashback Rate",
    description: "Customer's tier cashback percentage (e.g., '5%')",
    example: "5%"
  },
  {
    variable: "{{shop_url}}",
    label: "Shop URL",
    description: "Link to your store's homepage",
    example: "https://mystore.com"
  },
];

// ============================================
// COMPONENT
// ============================================

export default function CreateEmailTemplate() {
  const navigate = useNavigate();
  const actionData = useActionData<typeof action>();
  const loaderData = useLoaderData<typeof loader>();
  const submit = useSubmit();

  // Step tracking for guided experience
  const [currentStep, setCurrentStep] = useState<"choose" | "customize">("choose");
  const [selectedStarterTemplate, setSelectedStarterTemplate] = useState<string | null>(null);

  // Template metadata
  const [name, setName] = useState("");
  const [type, setType] = useState("promotional");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");

  // Editor state
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [activeTab, setActiveTab] = useState(0);
  const [showVariablesHelp, setShowVariablesHelp] = useState(false);

  // Validation state
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Styles
  const [styles, setStyles] = useState<TemplateStyles>({
    backgroundColor: "#f4f4f4",
    contentWidth: "600",
    fontFamily: "Arial, sans-serif",
    primaryColor: "#000000",
    textColor: "#333333",
    linkColor: "#0066cc",
  });

  // History for undo/redo
  const [history, setHistory] = useState<ContentBlock[][]>([blocks]);
  const [historyIndex, setHistoryIndex] = useState(0);

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
      templateKey: "new",
      onRecover: (draft) => {
        setName(draft.name);
        setType(draft.type);
        setSubject(draft.subject);
        setPreviewText(draft.previewText);
        setBlocks(draft.blocks);
        setStyles(draft.styles as TemplateStyles);
        setCurrentStep("customize");
      },
    }
  );

  // Select a starter template
  const selectStarterTemplate = useCallback((templateId: string) => {
    const template = STARTER_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setSelectedStarterTemplate(templateId);
      setType(template.type);
      setSubject(template.subject);
      setPreviewText(template.previewText);
      setBlocks(template.blocks.map(b => ({ ...b, id: uuidv4() })) as any);
      if (template.id !== "blank") {
        setName(template.name);
      }
      setCurrentStep("customize");
      setHistory([template.blocks] as any);
      setHistoryIndex(0);
    }
  }, []);

  // Validate form
  const validateForm = useCallback(() => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Give your template a name so you can find it later";
    if (!subject.trim()) errors.subject = "Subject line is required - this is what customers see in their inbox";
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [name, subject]);

  const saveToHistory = useCallback((newBlocks: ContentBlock[]) => {
    setHistory(prev => [...prev.slice(0, historyIndex + 1), newBlocks]);
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const addBlock = useCallback((blockType: string) => {
    const newBlock: ContentBlock = {
      id: uuidv4(),
      type: blockType as ContentBlock["type"],
      content: getDefaultContent(blockType),
    };
    const newBlocks = [...blocks, newBlock];
    setBlocks(newBlocks);
    setSelectedBlockId(newBlock.id);
    saveToHistory(newBlocks);
  }, [blocks, saveToHistory]);

  const removeBlock = useCallback((blockId: string) => {
    const newBlocks = blocks.filter((b) => b.id !== blockId);
    setBlocks(newBlocks);
    setSelectedBlockId(null);
    saveToHistory(newBlocks);
  }, [blocks, saveToHistory]);

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

  const updateBlock = useCallback((blockId: string, content: Record<string, any>) => {
    const newBlocks = blocks.map((b) =>
      b.id === blockId ? { ...b, content: { ...b.content, ...content } } : b
    );
    setBlocks(newBlocks);
  }, [blocks]);

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
    const contentHtml = blocks.map((block) => {
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
    }).join("\n");

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
    if (!validateForm()) return;

    // Clear autosave draft on submit (redirect will happen on success)
    clearDraft();

    const formData = new FormData();
    formData.append("name", name);
    formData.append("type", type);
    formData.append("subject", subject);
    formData.append("previewText", previewText);
    formData.append("bodyHtml", generateHtml());
    // Include block-based content structure (required by schema)
    formData.append("content", JSON.stringify({ blocks, styles }));
    submit(formData, { method: "post" });
  }, [name, type, subject, previewText, generateHtml, blocks, styles, submit, validateForm, clearDraft]);

  // Insert variable at cursor position (for text fields)
  const insertVariable = useCallback((variable: string) => {
    // Copy to clipboard for easy pasting
    navigator.clipboard.writeText(variable);
  }, []);

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

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId);

  // Get selected block content for AI enhancement
  const selectedBlockContent = selectedBlock?.type === "text" ? (selectedBlock as any).content.text : undefined;

  // Get current template type info
  const currentTemplateType = TEMPLATE_TYPES.find(t => t.value === type);

  const tabs = [
    { id: "content", content: "Content", accessibilityLabel: "Content blocks" },
    { id: "styles", content: "Styles", accessibilityLabel: "Template styles" },
    { id: "ai", content: "AI", accessibilityLabel: "AI Assistant" },
  ];

  // Step 1: Choose a starting template
  if (currentStep === "choose") {
    return (
      <Page
        title="Create Email Template"
        subtitle="Choose a starting point for your email"
        backAction={{ content: "Templates", onAction: () => navigate("/app/marketing/templates") }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">Quick Start Templates</Text>
                  <Text as="p" tone="subdued">
                    Pick a template to get started quickly, or start from scratch
                  </Text>
                </BlockStack>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: "16px" }}>
                  {STARTER_TEMPLATES.map((template) => {
                    const templateType = TEMPLATE_TYPES.find(t => t.value === template.type);
                    return (
                      <Box
                        key={template.id}
                        padding="400"
                        background={selectedStarterTemplate === template.id ? "bg-surface-selected" : "bg-surface-secondary"}
                        borderRadius="200"
                        borderWidth="025"
                        borderColor={selectedStarterTemplate === template.id ? "border-success" : "border"}
                      >
                        <BlockStack gap="300">
                          <InlineStack align="space-between" blockAlign="start">
                            <BlockStack gap="100">
                              <Text as="h3" variant="headingSm">{template.name}</Text>
                              <Badge tone="info">{templateType?.label || template.type}</Badge>
                            </BlockStack>
                            {template.id !== "blank" && (
                              <Icon source={EmailIcon} tone="base" />
                            )}
                          </InlineStack>
                          {template.id !== "blank" ? (
                            <BlockStack gap="100">
                              <Text as="p" variant="bodySm" tone="subdued">
                                Subject: {template.subject}
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {template.blocks.length} content blocks
                              </Text>
                            </BlockStack>
                          ) : (
                            <Text as="p" variant="bodySm" tone="subdued">
                              Create a custom email from scratch
                            </Text>
                          )}
                          <Button
                            fullWidth
                            variant={template.id === "blank" ? "secondary" : "primary"}
                            onClick={() => selectStarterTemplate(template.id)}
                          >
                            {template.id === "blank" ? "Start Fresh" : "Use This Template"}
                          </Button>
                        </BlockStack>
                      </Box>
                    );
                  })}
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Template Type Explanations */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Template Types Explained</Text>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: "12px" }}>
                  {TEMPLATE_TYPES.map((templateType) => (
                    <Box key={templateType.value} padding="300" background="bg-surface-secondary" borderRadius="150">
                      <BlockStack gap="100">
                        <Text as="h4" variant="headingSm">{templateType.label}</Text>
                        <Text as="p" variant="bodySm">{templateType.description}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">{templateType.trigger}</Text>
                      </BlockStack>
                    </Box>
                  ))}
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // Step 2: Customize the template
  return (
    <Page
      title="Create Email Template"
      subtitle={currentTemplateType ? `${currentTemplateType.label} - ${currentTemplateType.description}` : "Design your email"}
      backAction={{ content: "Back", onAction: () => setCurrentStep("choose") }}
      primaryAction={{
        content: "Save Template",
        disabled: !name || !subject,
        onAction: handleSubmit,
        icon: CheckIcon,
      }}
      secondaryActions={[
        {
          content: "Choose Different Template",
          onAction: () => setCurrentStep("choose"),
        }
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

        {hasDraft && (
          <Layout.Section>
            <Banner
              title="Unsaved draft found"
              tone="warning"
              action={{ content: "Recover draft", onAction: recoverDraft }}
              secondaryAction={{ content: "Dismiss", onAction: dismissDraft }}
            >
              <p>
                You have an unsaved draft from {draftSavedAt ? formatRelativeTime(draftSavedAt) : "earlier"}.
                Would you like to recover it?
              </p>
            </Banner>
          </Layout.Section>
        )}

        {/* Inbox Preview - Shows how the email will appear in customer's inbox */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Inbox Preview</Text>
                <Text as="span" variant="bodySm" tone="subdued">How customers will see your email</Text>
              </InlineStack>
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Box padding="200" background="bg-fill-success" borderRadius="100">
                      <Text as="span" variant="bodySm" fontWeight="bold">
                        {name ? name.charAt(0).toUpperCase() : "S"}
                      </Text>
                    </Box>
                    <BlockStack gap="0">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        {name || "Your Store Name"}
                      </Text>
                      <Text as="p" variant="bodyMd">
                        {subject || "Your subject line will appear here"}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {previewText || "Preview text helps customers decide to open your email..."}
                      </Text>
                    </BlockStack>
                  </InlineStack>
                </BlockStack>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Template Settings - Simplified and with better guidance */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Email Details</Text>
              <InlineStack gap="400" wrap>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <TextField
                    label="Template Name"
                    value={name}
                    onChange={(v) => { setName(v); setValidationErrors({ ...validationErrors, name: "" }); }}
                    placeholder="e.g., Welcome Email"
                    autoComplete="off"
                    requiredIndicator
                    error={validationErrors.name}
                    helpText="Internal name to help you identify this template"
                  />
                </div>
                <div style={{ flex: "1 1 200px" }}>
                  <Select
                    label="Template Type"
                    options={TEMPLATE_TYPES.map(t => ({ label: t.label, value: t.value }))}
                    value={type}
                    onChange={setType}
                    helpText={currentTemplateType?.trigger}
                  />
                </div>
              </InlineStack>
              <TextField
                label="Subject Line"
                value={subject}
                onChange={(v) => { setSubject(v); setValidationErrors({ ...validationErrors, subject: "" }); }}
                placeholder="e.g., Welcome to {{tier_name}}!"
                autoComplete="off"
                requiredIndicator
                error={validationErrors.subject}
                helpText="The first thing customers see - make it count! Use personalization variables to make it personal."
              />
              <TextField
                label="Preview Text"
                value={previewText}
                onChange={setPreviewText}
                placeholder="A short summary that appears after the subject line in most email clients"
                autoComplete="off"
                helpText="This text appears after the subject line in most email apps. Keep it under 100 characters."
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Personalization Variables - Expandable with examples */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingMd">Personalization</Text>
                  <Tooltip content="Click a variable to copy it, then paste into your subject or content">
                    <Icon source={QuestionCircleIcon} tone="subdued" />
                  </Tooltip>
                </InlineStack>
                <Button
                  variant="plain"
                  onClick={() => setShowVariablesHelp(!showVariablesHelp)}
                >
                  {showVariablesHelp ? "Hide Details" : "Show Details"}
                </Button>
              </InlineStack>
              <InlineStack gap="200" wrap>
                {PERSONALIZATION_VARIABLES.map((v) => (
                  <Tooltip key={v.variable} content={`${v.description} - Click to copy`}>
                    <Button
                      variant="secondary"
                      size="slim"
                      onClick={() => insertVariable(v.variable)}
                    >
                      {v.variable}
                    </Button>
                  </Tooltip>
                ))}
              </InlineStack>
              <Collapsible open={showVariablesHelp} id="variables-help">
                <Box paddingBlockStart="200">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: "8px" }}>
                    {PERSONALIZATION_VARIABLES.map((v) => (
                      <Box key={v.variable} padding="200" background="bg-surface-secondary" borderRadius="100">
                        <BlockStack gap="050">
                          <Text as="span" variant="bodySm" fontWeight="semibold">{v.label}</Text>
                          <Text as="span" variant="bodySm" tone="subdued">{v.description}</Text>
                          <Text as="span" variant="bodySm" tone="magic">Example: {v.example}</Text>
                        </BlockStack>
                      </Box>
                    ))}
                  </div>
                </Box>
              </Collapsible>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Editor - Simplified 2-column on smaller screens */}
        <Layout.Section>
          <div className="rp-editor-grid">
            {/* Left Sidebar - Blocks */}
            <Card>
              <BlockStack gap="300">
                <Tabs tabs={tabs} selected={activeTab} onSelect={setActiveTab} fitted />

                {activeTab === 0 && (
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">Add Content</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Click to add a block to your email</Text>
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
                            <Text as="span" variant="bodySm" tone="subdued">
                              {blockType.description}
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
                  <Text as="span" variant="bodySm" tone="subdued">
                    Click any block to edit it
                  </Text>
                  <InlineStack gap="100">
                    <Button
                      icon={DesktopIcon}
                      pressed={previewMode === "desktop"}
                      onClick={() => setPreviewMode("desktop")}
                      accessibilityLabel="Desktop preview"
                      size="slim"
                    />
                    <Button
                      icon={MobileIcon}
                      pressed={previewMode === "mobile"}
                      onClick={() => setPreviewMode("mobile")}
                      accessibilityLabel="Mobile preview"
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
                        <BlockStack gap="300">
                          <Text as="p" tone="subdued" alignment="center">
                            Your email is empty
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                            Add content blocks from the panel on the left to build your email
                          </Text>
                        </BlockStack>
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
                <Text as="h3" variant="headingMd">Edit Block</Text>
                {selectedBlock ? (
                  <BlockSettings
                    block={selectedBlock}
                    onUpdate={(content) => updateBlock(selectedBlock.id, content)}
                  />
                ) : (
                  <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="200">
                      <Text as="p" tone="subdued" alignment="center" variant="bodySm">
                        No block selected
                      </Text>
                      <Text as="p" tone="subdued" alignment="center" variant="bodySm">
                        Click on a block in the preview to edit its content
                      </Text>
                    </BlockStack>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </div>
        </Layout.Section>

        {/* Tips for better emails */}
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Tips for Better Emails</Text>
              <InlineStack gap="400" wrap>
                <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                  <Text as="p" variant="bodySm">Keep subject lines under 50 characters</Text>
                </Box>
                <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                  <Text as="p" variant="bodySm">Use personalization to increase open rates</Text>
                </Box>
                <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                  <Text as="p" variant="bodySm">Include one clear call-to-action button</Text>
                </Box>
                <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                  <Text as="p" variant="bodySm">Test on mobile - most emails are read on phones</Text>
                </Box>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
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
        <p style={{ margin: "0 0 16px", color: styles.textColor, lineHeight: 1.6, fontFamily: styles.fontFamily }}>
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
      return <Text as="p" tone="subdued">Unknown block type: {block.type}</Text>;
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
          {/* Simple link management - could be enhanced with dedicated UI */}
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
      return <Text as="p" tone="subdued">No settings available</Text>;
  }
}
