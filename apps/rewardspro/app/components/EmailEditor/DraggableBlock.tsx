/**
 * DraggableBlock Component
 *
 * Wrapper for individual blocks with drag handle and selection state.
 */

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ContentBlock, TemplateStyles } from "./types";
import { BlockPreview } from "./BlockPreview";
import { BlockToolbar } from "./BlockToolbar";

interface DraggableBlockProps {
  block: ContentBlock;
  isSelected: boolean;
  isDragging: boolean;
  styles: TemplateStyles;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onUpdate: (content: Record<string, any>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export function DraggableBlock({
  block,
  isSelected,
  isDragging,
  styles,
  isFirst,
  isLast,
  onSelect,
  onDelete,
  onDuplicate,
}: DraggableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`draggable-block ${isSelected ? "draggable-block--selected" : ""} ${isDragging ? "draggable-block--dragging" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Drag Handle */}
      <div
        className="draggable-block__handle"
        {...attributes}
        {...listeners}
        style={{
          position: "absolute",
          left: "-32px",
          top: "50%",
          transform: "translateY(-50%)",
          width: "24px",
          height: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "grab",
          opacity: isSelected ? 1 : 0,
          transition: "opacity 0.15s ease",
          color: "#6b7280",
        }}
      >
        <DragHandleIcon />
      </div>

      {/* Block Content */}
      <div className="draggable-block__content">
        <BlockPreview block={block} styles={styles} />
      </div>

      {/* Toolbar (visible when selected) */}
      {isSelected && (
        <BlockToolbar
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          isFirst={isFirst}
          isLast={isLast}
        />
      )}

      <style>{`
        .draggable-block {
          position: relative;
          margin: 8px 0;
          border-radius: 8px;
          border: 2px solid transparent;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        .draggable-block:hover {
          border-color: #e5e7eb;
        }

        .draggable-block:hover .draggable-block__handle {
          opacity: 0.5;
        }

        .draggable-block--selected {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .draggable-block--selected .draggable-block__handle {
          opacity: 1 !important;
        }

        .draggable-block--dragging {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .draggable-block__content {
          pointer-events: none;
        }

        .draggable-block--selected .draggable-block__content {
          pointer-events: auto;
        }
      `}</style>
    </div>
  );
}

// Drag handle icon (6-dot grip)
function DragHandleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <circle cx="5" cy="3" r="1.5" />
      <circle cx="11" cy="3" r="1.5" />
      <circle cx="5" cy="8" r="1.5" />
      <circle cx="11" cy="8" r="1.5" />
      <circle cx="5" cy="13" r="1.5" />
      <circle cx="11" cy="13" r="1.5" />
    </svg>
  );
}

export default DraggableBlock;
