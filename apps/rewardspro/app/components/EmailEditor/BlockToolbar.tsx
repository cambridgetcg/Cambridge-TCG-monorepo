/**
 * BlockToolbar Component
 *
 * Floating action toolbar for selected blocks.
 */

import { Button, ButtonGroup, Tooltip } from "@shopify/polaris";
import { DeleteIcon, DuplicateIcon } from "@shopify/polaris-icons";
import type { BlockToolbarProps } from "./types";

export function BlockToolbar({
  onDelete,
  onDuplicate,
}: BlockToolbarProps) {
  return (
    <div
      className="block-toolbar"
      style={{
        position: "absolute",
        top: "-40px",
        right: "8px",
        zIndex: 10,
        background: "white",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
        padding: "4px",
      }}
    >
      <ButtonGroup>
        <Tooltip content="Duplicate block">
          <Button
            icon={DuplicateIcon}
            onClick={() => {
              onDuplicate();
            }}
            accessibilityLabel="Duplicate block"
            size="slim"
          />
        </Tooltip>
        <Tooltip content="Delete block">
          <Button
            icon={DeleteIcon}
            onClick={() => {
              onDelete();
            }}
            accessibilityLabel="Delete block"
            size="slim"
            tone="critical"
          />
        </Tooltip>
      </ButtonGroup>
    </div>
  );
}

export default BlockToolbar;
