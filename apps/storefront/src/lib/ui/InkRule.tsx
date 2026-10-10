/**
 * InkRule — a static decorative divider, usable in server and client trees.
 */

import * as React from "react";

interface InkRuleProps {
  /** Use the accent color instead of the standard border color. */
  accent?: boolean;
  className?: string;
}

export function InkRule({ accent = false, className = "" }: InkRuleProps) {
  return (
    <span
      aria-hidden="true"
      className={`wardrobe-draw ${accent ? "wardrobe-draw--accent" : ""} w-full ${className}`}
    />
  );
}
