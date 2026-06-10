/**
 * Email Editor Types
 *
 * Shared type definitions for the drag-and-drop email editor components.
 */

// Block types supported by the editor
export type BlockType =
  | "text"
  | "image"
  | "button"
  | "divider"
  | "spacer"
  | "html"
  | "product"
  | "social"
  | "countdown"
  | "testimonial"
  | "hero"
  | "columns";

// Content block structure
export interface ContentBlock {
  id: string;
  type: BlockType;
  content: Record<string, any>;
}

// Template styling options
export interface TemplateStyles {
  backgroundColor: string;
  contentWidth: string;
  fontFamily: string;
  primaryColor: string;
  textColor: string;
  linkColor?: string;
}

// Block type metadata for the palette
export interface BlockTypeInfo {
  id: BlockType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

// Sortable block props
export interface SortableBlockProps {
  block: ContentBlock;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (content: Record<string, any>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  styles: TemplateStyles;
}

// Block toolbar props
export interface BlockToolbarProps {
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}

// Block preview props
export interface BlockPreviewProps {
  block: ContentBlock;
  styles: TemplateStyles;
  isOverlay?: boolean;
}

// Personalization variable
export interface PersonalizationVariable {
  variable: string;
  label: string;
  description: string;
}

// Default content getters for each block type
export const DEFAULT_BLOCK_CONTENT: Record<BlockType, Record<string, any>> = {
  text: { text: "Enter your text here..." },
  image: { url: "", alt: "" },
  button: { text: "Click Here", url: "#", style: "primary" },
  divider: { color: "#dddddd", thickness: 1 },
  spacer: { height: 20 },
  html: { html: "" },
  product: {
    productId: "",
    variantId: "",
    title: "Select a product",
    imageUrl: null,
    price: "",
    showImage: true,
    showPrice: true,
    buttonText: "Shop Now",
  },
  social: {
    links: [],
    iconSize: "medium",
    alignment: "center",
  },
  countdown: {
    targetDate: "",
    label: "Sale ends in",
    expiredMessage: "Sale has ended",
    backgroundColor: "#000000",
    textColor: "#ffffff",
  },
  testimonial: {
    quote: "This is a great product!",
    author: "Customer Name",
    authorTitle: "Verified Buyer",
    rating: 5,
    style: "card",
  },
  hero: {
    imageUrl: "",
    overlayOpacity: 50,
    overlayColor: "#000000",
    headingText: "Your Heading Here",
    subheadingText: "",
    buttonText: "Learn More",
    buttonUrl: "#",
    height: "medium",
  },
  columns: {
    leftColumn: [],
    rightColumn: [],
    columnRatio: "50-50",
    gap: 20,
    stackOnMobile: true,
  },
};
