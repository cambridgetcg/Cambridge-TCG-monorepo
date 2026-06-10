/**
 * SortableBlockList Component
 *
 * Provides drag-and-drop sorting context for email blocks using @dnd-kit.
 */

import { useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { ContentBlock, TemplateStyles } from "./types";
import { DraggableBlock } from "./DraggableBlock";
import { BlockPreview } from "./BlockPreview";

interface SortableBlockListProps {
  blocks: ContentBlock[];
  selectedBlockId: string | null;
  styles: TemplateStyles;
  onBlocksReorder: (blocks: ContentBlock[]) => void;
  onBlockSelect: (id: string | null) => void;
  onBlockUpdate: (id: string, content: Record<string, any>) => void;
  onBlockDelete: (id: string) => void;
  onBlockDuplicate: (id: string) => void;
}

export function SortableBlockList({
  blocks,
  selectedBlockId,
  styles,
  onBlocksReorder,
  onBlockSelect,
  onBlockUpdate,
  onBlockDelete,
  onBlockDuplicate,
}: SortableBlockListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Configure sensors for mouse/touch and keyboard
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get the currently dragged block for overlay
  const activeBlock = activeId
    ? blocks.find((b) => b.id === activeId)
    : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (over && active.id !== over.id) {
        const oldIndex = blocks.findIndex((b) => b.id === active.id);
        const newIndex = blocks.findIndex((b) => b.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newBlocks = [...blocks];
          const [removed] = newBlocks.splice(oldIndex, 1);
          newBlocks.splice(newIndex, 0, removed);
          onBlocksReorder(newBlocks);
        }
      }
    },
    [blocks, onBlocksReorder]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext
        items={blocks.map((b) => b.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="sortable-block-list">
          {blocks.map((block, index) => (
            <DraggableBlock
              key={block.id}
              block={block}
              isSelected={selectedBlockId === block.id}
              isDragging={activeId === block.id}
              styles={styles}
              isFirst={index === 0}
              isLast={index === blocks.length - 1}
              onSelect={() => onBlockSelect(block.id)}
              onUpdate={(content) => onBlockUpdate(block.id, content)}
              onDelete={() => onBlockDelete(block.id)}
              onDuplicate={() => onBlockDuplicate(block.id)}
            />
          ))}
        </div>
      </SortableContext>

      {/* Drag overlay - shows dragged item */}
      <DragOverlay dropAnimation={null}>
        {activeBlock ? (
          <div
            style={{
              opacity: 0.9,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
              borderRadius: "8px",
              background: "white",
            }}
          >
            <BlockPreview block={activeBlock} styles={styles} isOverlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export default SortableBlockList;
