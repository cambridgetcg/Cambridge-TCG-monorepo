import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appDirectory = resolve(process.cwd(), "app");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(path);
    }

    return entry.isFile() && path.endsWith(".tsx") ? [path] : [];
  });
}

describe("form control labels", () => {
  it("does not hide controls behind empty accessible labels", () => {
    const emptyLabel =
      /\blabel\s*=\s*(?:["']\s*["']|\{\s*["']\s*["']\s*\})/;
    const emptyChoiceListTitle =
      /<ChoiceList\b[\s\S]{0,300}?\btitle\s*=\s*(?:["']\s*["']|\{\s*["']\s*["']\s*\})/;

    const violations = sourceFiles(appDirectory).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      const problems = [];

      if (emptyLabel.test(source)) {
        problems.push("empty label");
      }
      if (emptyChoiceListTitle.test(source)) {
        problems.push("empty ChoiceList title");
      }

      return problems.length > 0
        ? [`${relative(appDirectory, file)}: ${problems.join(", ")}`]
        : [];
    });

    expect(violations).toEqual([]);
  });
});
