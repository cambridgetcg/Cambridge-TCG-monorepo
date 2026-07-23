/**
 * BlockPreview Component
 *
 * Renders a visual preview of each block type in the editor.
 */

import type { BlockPreviewProps } from "./types";
import { sanitizeEmailHtml } from "~/utils/html-sanitizer";

export function BlockPreview({ block, styles, isOverlay }: BlockPreviewProps) {
  const { type, content } = block;

  const baseStyle: React.CSSProperties = {
    fontFamily: styles.fontFamily || "Arial, sans-serif",
    padding: isOverlay ? "12px" : undefined,
  };

  switch (type) {
    case "text":
      return (
        <div style={baseStyle}>
          <p
            style={{
              margin: 0,
              padding: "12px",
              color: styles.textColor,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {content.text || "Enter your text here..."}
          </p>
        </div>
      );

    case "image":
      return (
        <div style={{ ...baseStyle, padding: "12px", textAlign: "center" }}>
          {content.url ? (
            <img
              src={content.url}
              alt={content.alt || ""}
              style={{
                maxWidth: "100%",
                height: "auto",
                borderRadius: "4px",
              }}
            />
          ) : (
            <div
              style={{
                background: "#f3f4f6",
                padding: "40px",
                borderRadius: "8px",
                color: "#9ca3af",
              }}
            >
              Click to add image
            </div>
          )}
        </div>
      );

    case "button":
      return (
        <div style={{ ...baseStyle, padding: "12px", textAlign: "center" }}>
          <span
            style={{
              display: "inline-block",
              padding: "12px 24px",
              backgroundColor: styles.primaryColor || "#000",
              color: "#ffffff",
              borderRadius: "6px",
              textDecoration: "none",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {content.text || "Button"}
          </span>
        </div>
      );

    case "divider":
      return (
        <div style={{ ...baseStyle, padding: "12px 0" }}>
          <hr
            style={{
              border: "none",
              borderTop: `${content.thickness || 1}px solid ${content.color || "#dddddd"}`,
              margin: 0,
            }}
          />
        </div>
      );

    case "spacer":
      return (
        <div
          style={{
            ...baseStyle,
            height: `${content.height || 20}px`,
            background: isOverlay ? "transparent" : "repeating-linear-gradient(45deg, transparent, transparent 5px, #f3f4f6 5px, #f3f4f6 10px)",
          }}
        />
      );

    case "html":
      return (
        <div
          style={{ ...baseStyle, padding: "12px" }}
          dangerouslySetInnerHTML={{
            __html: sanitizeEmailHtml(content.html || "<p>Custom HTML</p>"),
          }}
        />
      );

    case "product":
      return (
        <div
          style={{
            ...baseStyle,
            padding: "12px",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            display: "flex",
            gap: "16px",
            alignItems: "center",
          }}
        >
          {content.showImage !== false && (
            <div
              style={{
                width: "80px",
                height: "80px",
                background: content.imageUrl ? `url(${content.imageUrl}) center/cover` : "#f3f4f6",
                borderRadius: "4px",
                flexShrink: 0,
              }}
            />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>
              {content.title || "Product Name"}
            </div>
            {content.showPrice !== false && content.price && (
              <div style={{ color: styles.primaryColor, fontWeight: 500 }}>
                {content.price}
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
                fontSize: "14px",
              }}
            >
              {content.buttonText || "Shop Now"}
            </div>
          </div>
        </div>
      );

    case "social":
      const platforms = content.links || [];
      const iconSize = content.iconSize === "small" ? 24 : content.iconSize === "large" ? 40 : 32;
      return (
        <div
          style={{
            ...baseStyle,
            padding: "12px",
            textAlign: content.alignment || "center",
          }}
        >
          {platforms.length === 0 ? (
            <div style={{ color: "#9ca3af" }}>Add social links</div>
          ) : (
            <div style={{ display: "inline-flex", gap: "12px" }}>
              {platforms.map((link: { platform: string; url: string }, i: number) => (
                <SocialIcon key={i} platform={link.platform} size={iconSize} />
              ))}
            </div>
          )}
        </div>
      );

    case "countdown":
      return (
        <div
          style={{
            ...baseStyle,
            padding: "20px",
            backgroundColor: content.backgroundColor || "#000",
            color: content.textColor || "#fff",
            textAlign: "center",
            borderRadius: "8px",
          }}
        >
          <div style={{ fontSize: "14px", marginBottom: "8px" }}>
            {content.label || "Sale ends in"}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: "16px" }}>
            {["Days", "Hours", "Min", "Sec"].map((unit) => (
              <div key={unit} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "28px", fontWeight: 700 }}>00</div>
                <div style={{ fontSize: "12px", opacity: 0.8 }}>{unit}</div>
              </div>
            ))}
          </div>
        </div>
      );

    case "testimonial":
      const stars = content.rating ? "★".repeat(content.rating) + "☆".repeat(5 - content.rating) : "";
      return (
        <div
          style={{
            ...baseStyle,
            padding: "20px",
            backgroundColor: content.style === "card" ? "#f9fafb" : "transparent",
            border: content.style === "bordered" ? "1px solid #e5e7eb" : "none",
            borderRadius: "8px",
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
            "{content.quote || "Customer testimonial goes here..."}"
          </blockquote>
          <div style={{ fontWeight: 600 }}>{content.author || "Customer Name"}</div>
          {content.authorTitle && (
            <div style={{ fontSize: "14px", color: "#6b7280" }}>
              {content.authorTitle}
            </div>
          )}
        </div>
      );

    case "hero":
      const heights = { small: "200px", medium: "300px", large: "400px" };
      return (
        <div
          style={{
            ...baseStyle,
            position: "relative",
            height: heights[content.height as keyof typeof heights] || "300px",
            backgroundImage: content.imageUrl ? `url(${content.imageUrl})` : undefined,
            backgroundColor: content.imageUrl ? undefined : "#e5e7eb",
            backgroundSize: "cover",
            backgroundPosition: "center",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          {/* Overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: content.overlayColor || "#000",
              opacity: (content.overlayOpacity || 50) / 100,
            }}
          />
          {/* Content */}
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
            <h2 style={{ margin: "0 0 8px", fontSize: "28px", fontWeight: 700 }}>
              {content.headingText || "Your Heading"}
            </h2>
            {content.subheadingText && (
              <p style={{ margin: "0 0 16px", fontSize: "16px", opacity: 0.9 }}>
                {content.subheadingText}
              </p>
            )}
            {content.buttonText && (
              <span
                style={{
                  display: "inline-block",
                  padding: "12px 24px",
                  backgroundColor: styles.primaryColor || "#fff",
                  color: "#000",
                  borderRadius: "6px",
                  fontWeight: 600,
                }}
              >
                {content.buttonText}
              </span>
            )}
          </div>
        </div>
      );

    case "columns":
      return (
        <div
          style={{
            ...baseStyle,
            display: "grid",
            gridTemplateColumns: getColumnRatio(content.columnRatio),
            gap: `${content.gap || 20}px`,
            padding: "12px",
          }}
        >
          <div
            style={{
              background: "#f9fafb",
              padding: "20px",
              borderRadius: "4px",
              minHeight: "80px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#9ca3af",
            }}
          >
            Left Column
          </div>
          <div
            style={{
              background: "#f9fafb",
              padding: "20px",
              borderRadius: "4px",
              minHeight: "80px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#9ca3af",
            }}
          >
            Right Column
          </div>
        </div>
      );

    default:
      return (
        <div style={{ ...baseStyle, padding: "12px", color: "#9ca3af" }}>
          Unknown block type: {type}
        </div>
      );
  }
}

// Helper to convert column ratio to CSS grid
function getColumnRatio(ratio: string): string {
  switch (ratio) {
    case "33-67":
      return "1fr 2fr";
    case "67-33":
      return "2fr 1fr";
    case "50-50":
    default:
      return "1fr 1fr";
  }
}

// Simple social icon component
function SocialIcon({ platform, size }: { platform: string; size: number }) {
  const colors: Record<string, string> = {
    facebook: "#1877f2",
    instagram: "#e4405f",
    twitter: "#1da1f2",
    tiktok: "#000000",
    youtube: "#ff0000",
    linkedin: "#0a66c2",
    pinterest: "#bd081c",
  };

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: colors[platform] || "#6b7280",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: size * 0.5,
        fontWeight: 700,
      }}
    >
      {platform.charAt(0).toUpperCase()}
    </div>
  );
}

export default BlockPreview;
