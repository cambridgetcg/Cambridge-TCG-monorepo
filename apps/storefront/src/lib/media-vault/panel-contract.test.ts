import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("standalone collector media panel", () => {
  const panel = source("src/components/account/CollectorMediaVaultPanel.tsx");
  const executablePanel = panel.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("uses direct authenticated server upload without exposing storage details", () => {
    expect(panel).toContain('fetch("/api/account/media-vault"');
    expect(panel).toContain('body: file');
    expect(executablePanel).not.toContain("FormData");
    expect(executablePanel).not.toContain("presign");
    expect(executablePanel).not.toContain("objectKey");
    expect(executablePanel).not.toContain("bucket");
    expect(executablePanel).not.toContain("publicUrl");
  });

  it("is not mounted on passport or portfolio pages by this change", () => {
    const passport = source("src/app/account/profile/page.tsx");
    const portfolio = source("src/app/account/portfolio/page.tsx");
    expect(passport).not.toContain("CollectorMediaVaultPanel");
    expect(portfolio).not.toContain("CollectorMediaVaultPanel");
  });
});
