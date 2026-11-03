/**
 * What `shopify app deploy` and `shopify app build` bundle from the theme app
 * extension. The CLI takes every file one folder down and stops with "Your
 * theme app extension includes files in an unsupported directory" when a file
 * sits outside assets/, blocks/, locales/ or snippets/ and .shopifyignore
 * doesn't exclude it.
 */
import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

const EXTENSION = path.resolve(__dirname, "../../../extensions/theme-app-extension-rewardspro");
const SHOPIFY_FOLDERS = ["assets", "blocks", "locales", "snippets"];

const ignored = () => {
  const file = path.join(EXTENSION, ".shopifyignore");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
};

describe("theme app extension bundle", () => {
  const folders = fs.readdirSync(EXTENSION, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !SHOPIFY_FOLDERS.includes(name));

  it.each(folders)("%s/ is left out of the Shopify bundle", (folder) => {
    expect(ignored()).toContain(`${folder}/**`);
  });
});
