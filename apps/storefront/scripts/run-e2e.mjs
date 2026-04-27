// E2E runner. The test scripts use @/ path aliases (matching the
// app's tsconfig) and dynamic imports of internal libs that
// transitively pull in @/lib/*. node alone doesn't resolve those;
// jiti does, but only when given an alias map.
//
// Usage:  node scripts/run-e2e.mjs scripts/test-notifications.mts
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createJiti } from "jiti";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/run-e2e.mjs <script-path>");
  process.exit(2);
}

const jiti = createJiti(pathToFileURL(projectRoot + "/").href, {
  alias: { "@": path.join(projectRoot, "src") },
  interopDefault: true,
  fsCache: false,
  // Some tests import named utilities from .tsx component files.
  // jsx: true tells jiti to parse JSX rather than choking on `<Foo>`.
  jsx: true,
});

const absTarget = path.resolve(projectRoot, target);
await jiti.import(absTarget);
