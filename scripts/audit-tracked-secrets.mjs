#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const tokenPatterns = [
  [
    "Shopify access token",
    /\bshpat_[A-Za-z0-9]{20,}\b/g,
    (value) => !/^shpat_x+$/i.test(value),
  ],
  ["GitHub access token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, () => true],
  [
    "AWS access key",
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    (value) => !value.endsWith("EXAMPLE"),
  ],
  ["private key", /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g, () => true],
];

const databaseUrl =
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:'"`/]+:([^\s@'"`/]+)@([^\s:'"`/]+)/g;
const httpUrl = /\bhttps?:\/\/[^\s'"`<>\\]+/gi;
const placeholder =
  /^(?:x|pass(?:word)?|postgres|test|fake|example|placeholder|dummy|changeme|ci(?:[-_].*)?|your[-_].*)$/i;
const quotedAssignment =
  /(?:^|[({,;])\s*(?:(?:export\s+)?(?:const|let|var)\s+)?([A-Za-z_$][\w$.-]*)\s*(?:\??:\s*[^=,;\r\n]+)?\s*=\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|`([^`\r\n]*)`)/gm;
const quotedProperty =
  /(?:^|[({,])\s*(?:"([A-Za-z_$][\w$.-]*)"|'([A-Za-z_$][\w$.-]*)'|([A-Za-z_$][\w$.-]*))\s*:\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|`([^`\r\n]*)`)/gm;
const unquotedEnvironmentAssignment =
  /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*([^\s#;]+)\s*(?:#.*)?$/;
const unquotedProperty =
  /^\s*["']?([A-Za-z_$][\w$.-]*)["']?\s*:\s*([A-Za-z0-9._~+/@%=-]{3,})\s*(?:#.*)?$/;

const metadataWords = new Set([
  "arn",
  "budget",
  "column",
  "columns",
  "count",
  "default",
  "digest",
  "encrypted",
  "endpoint",
  "environment",
  "env",
  "event",
  "events",
  "exchange",
  "expires",
  "expired",
  "expiration",
  "expiry",
  "field",
  "fields",
  "hash",
  "header",
  "headers",
  "id",
  "ids",
  "label",
  "length",
  "is",
  "name",
  "names",
  "parameter",
  "parameters",
  "path",
  "pattern",
  "prefix",
  "rare",
  "refresh",
  "refreshed",
  "regex",
  "salt",
  "schema",
  "status",
  "ttl",
  "type",
  "types",
  "url",
  "urls",
  "validation",
  "version",
  "versions",
]);

function wordsInKey(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function credentialKind(key) {
  const words = wordsInKey(key);
  const joined = words.join("_");
  if (
    words.some((word) =>
      [
        "currency",
        "english",
        "japanese",
        "linguistic",
        "natural",
        "none",
        "target",
      ].includes(word),
    )
  ) {
    return null;
  }
  let kind = null;
  let sensitiveIndex = -1;

  if (
    joined === "aws_secret_access_key" ||
    (words.includes("aws") && words.includes("secret"))
  ) {
    kind = "AWS secret";
    sensitiveIndex = words.lastIndexOf("key");
    if (sensitiveIndex < 0) sensitiveIndex = words.lastIndexOf("secret");
  } else {
    const apiKeyIndex = words.findIndex(
      (word, index) =>
        word === "apikey" || (word === "api" && words[index + 1] === "key"),
    );
    if (apiKeyIndex >= 0) {
      kind = "API key";
      sensitiveIndex =
        words[apiKeyIndex] === "api" ? apiKeyIndex + 1 : apiKeyIndex;
    } else {
      sensitiveIndex = words.findLastIndex((word) =>
        ["password", "passwd", "pwd", "secret", "token"].includes(word),
      );
      if (sensitiveIndex >= 0) {
        const word = words[sensitiveIndex];
        kind = ["password", "passwd", "pwd"].includes(word) ? "password" : word;
      }
    }
  }

  if (!kind) return null;
  if (words.slice(sensitiveIndex + 1).some((word) => metadataWords.has(word))) {
    return null;
  }
  return kind;
}

function isTestLikeFile(file) {
  return (
    /(?:^|\/)(?:__tests__|docs?|examples?|fixtures?|test|tests)(?:\/|$)/i.test(
      file,
    ) ||
    /\.(?:spec|test)\.[^.]+$/i.test(file) ||
    /(?:^|\/)test(?:[-_.]|$)/i.test(file) ||
    /\.(?:md|mdx)$/i.test(file) ||
    /(?:^|\/)\.github\/workflows\//i.test(file)
  );
}

function looksCredentialShaped(value) {
  if (value.length < 16 || /\s/.test(value)) return false;
  const characterClasses = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(
    (pattern) => pattern.test(value),
  ).length;
  return characterClasses >= 3 || /[A-Za-z0-9]{20,}/.test(value);
}

function isPlaceholderLiteral(rawValue, file) {
  const value = rawValue.trim();
  const lower = value.toLowerCase();
  if (!value) return true;
  if (
    /\$\{|\{\{|\}\}|<\/?(?:your|replace|secret|token|password|api[-_ ]?key)/i.test(
      value,
    ) ||
    /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(value) ||
    /^(?:process|deno)\.env\b/i.test(value) ||
    /^(?:os\.)?getenv\b/i.test(value)
  ) {
    return true;
  }
  if (/^(?:x+|\*+|redacted|masked)$/i.test(value)) return true;
  if (
    /^(?:bearer|basic|none|null|undefined|password\d*|pass(?:word)?|secret|token|api[-_ ]?key|key)$/i.test(
      value,
    )
  ) {
    return true;
  }

  const pieces = lower.split(/[^a-z0-9]+/).filter(Boolean);
  const explicitMarker = pieces.some((piece) =>
    [
      "changeme",
      "dummy",
      "example",
      "fake",
      "invalid",
      "masked",
      "mock",
      "placeholder",
      "redacted",
      "replace",
      "replaceable",
      "sample",
      "testing",
      "your",
    ].includes(piece),
  );
  if (
    explicitMarker ||
    /(?:^|[-_ ])(?:not[-_ ]?(?:real|used|set)|for[-_ ]?tests?[-_ ]?only)(?:$|[-_ ])/i.test(
      value,
    ) ||
    lower.includes("example") ||
    /^(?:ci|test|your)(?:$|[-_ ])/i.test(value)
  ) {
    return true;
  }

  if (
    /^[A-Za-z][A-Za-z0-9_.:/-]*$/.test(value) &&
    pieces.some((piece) =>
      [
        "apikey",
        "key",
        "password",
        "passwd",
        "pwd",
        "secret",
        "token",
      ].includes(piece),
    ) &&
    !/[0-9]/.test(value)
  ) {
    return true;
  }

  if (
    isTestLikeFile(file) &&
    (pieces.some((piece) =>
      [
        "correct",
        "expected",
        "fixture",
        "mocked",
        "unit",
        "valid",
        "wrong",
      ].includes(piece),
    ) ||
      !looksCredentialShaped(value))
  ) {
    return true;
  }
  return false;
}

function credentialAssignmentLabels(body, file) {
  const labels = new Set();
  const consider = (key, value) => {
    const kind = credentialKind(key);
    if (
      kind &&
      !(isTestLikeFile(file) && /^process\.env\./i.test(key)) &&
      !(isTestLikeFile(file) && wordsInKey(key).includes("csrf")) &&
      !isPlaceholderLiteral(value, file) &&
      !(
        kind === "token" &&
        wordsInKey(key).length === 1 &&
        !looksCredentialShaped(value)
      )
    ) {
      labels.add(`hardcoded ${kind} literal assigned to ${key}`);
    }
  };

  quotedAssignment.lastIndex = 0;
  for (const match of body.matchAll(quotedAssignment)) {
    const following = body.slice(match.index + match[0].length).trimStart()[0];
    if (following === "+") continue;
    consider(match[1], match[2] ?? match[3] ?? match[4] ?? "");
  }

  quotedProperty.lastIndex = 0;
  for (const match of body.matchAll(quotedProperty)) {
    consider(
      match[1] ?? match[2] ?? match[3],
      match[4] ?? match[5] ?? match[6] ?? "",
    );
  }

  const unquotedEnvironmentFile =
    /(?:^|\/)(?:Dockerfile|[^/]*\.env(?:\.[^/]*)?|[^/]+\.(?:bash|sh|zsh))$/i.test(
      file,
    );
  const unquotedPropertyFile = /\.(?:toml|ya?ml)$/i.test(file);
  if (unquotedEnvironmentFile || unquotedPropertyFile) {
    for (const line of body.split(/\r?\n/)) {
      if (unquotedEnvironmentFile) {
        const environmentMatch = line.match(unquotedEnvironmentAssignment);
        if (environmentMatch)
          consider(environmentMatch[1], environmentMatch[2]);
      }
      if (unquotedPropertyFile) {
        const propertyMatch = line.match(unquotedProperty);
        if (propertyMatch) consider(propertyMatch[1], propertyMatch[2]);
      }
    }
  }
  return labels;
}

function urlCredentialLabels(body, file) {
  const labels = new Set();
  httpUrl.lastIndex = 0;

  for (const match of body.matchAll(httpUrl)) {
    let url;
    try {
      url = new URL(match[0]);
    } catch {
      continue;
    }

    for (const [key, value] of url.searchParams) {
      const kind = credentialKind(key);
      if (!kind || isPlaceholderLiteral(value, file)) continue;
      labels.add(`URL query contains hardcoded ${kind} value`);
    }
  }

  return labels;
}

function labelsInBody(body, file) {
  const labels = new Set();

  for (const [label, pattern, isConcrete] of tokenPatterns) {
    pattern.lastIndex = 0;
    for (const match of body.matchAll(pattern)) {
      if (isConcrete(match[0])) {
        labels.add(label);
        break;
      }
    }
  }

  databaseUrl.lastIndex = 0;
  for (const match of body.matchAll(databaseUrl)) {
    let password = match[1];
    try {
      password = decodeURIComponent(password);
    } catch {
      // A malformed percent escape is still assessed as a literal value.
    }
    const host = match[2];
    if (
      !placeholder.test(password) &&
      !/[${}<>]/.test(password) &&
      !/^(?:localhost|127\.0\.0\.1|host)$/i.test(host) &&
      !/[${}<>]/.test(host)
    ) {
      labels.add("database URL with embedded password");
      break;
    }
  }

  for (const label of credentialAssignmentLabels(body, file)) labels.add(label);
  for (const label of urlCredentialLabels(body, file)) labels.add(label);
  return labels;
}

function runSelfTest() {
  const querySecretKey = "secret";
  const queryTokenKey = "access_token";
  const mcpUrl = "https://mcp.example.test/connect";
  const cases = [
    {
      file: "src/config.ts",
      body: 'const password = "opaque-material-47f9a2bc";',
      expected: ["hardcoded password literal assigned to password"],
    },
    {
      file: "src/config.py",
      body: "client_secret = 'opaque-material-47f9a2bc'",
      expected: ["hardcoded secret literal assigned to client_secret"],
    },
    {
      file: "config.yml",
      body: 'apiKey: "opaque-material-47f9a2bc"',
      expected: ["hardcoded API key literal assigned to apiKey"],
    },
    {
      file: "deploy.env",
      body: "AWS_SECRET_ACCESS_KEY=opaqueMaterial47f9a2bc",
      expected: [
        "hardcoded AWS secret literal assigned to AWS_SECRET_ACCESS_KEY",
      ],
    },
    {
      file: "test/auth.test.ts",
      body: 'const token = "opaque-material-47f9a2bc";',
      expected: ["hardcoded token literal assigned to token"],
    },
    {
      file: "src/config.ts",
      body: 'const password = process.env.DATABASE_PASSWORD;\nconst secretName = "production-secret-name";',
      expected: [],
    },
    {
      file: "test/auth.test.ts",
      body: 'const password = "correct-test-password";\nconst token = "valid-fixture-token";',
      expected: [],
    },
    {
      file: ".github/workflows/ci.yml",
      body: 'NEXTAUTH_SECRET: "ci-fake-secret-not-used"',
      expected: [],
    },
    {
      file: "docs/example.yml",
      body: 'api_key: "<your-api-key>"',
      expected: [],
    },
    {
      file: "src/status.ts",
      body: 'console.log("Encryption Secret:", configured ? "set" : "missing");',
      expected: [],
    },
    {
      file: "test/auth.test.ts",
      body: 'const result = { csrfToken: "csrf-fixture-1234" };',
      expected: [],
    },
    {
      file: ".mcp.json",
      body: JSON.stringify({
        url: `${mcpUrl}?id=plugin-123&${querySecretKey}=opaque-material-47f9a2bc`,
      }),
      expected: ["URL query contains hardcoded secret value"],
    },
    {
      file: "src/config.ts",
      body: `const endpoint = "${mcpUrl}?${queryTokenKey}=OpaqueToken47f9a2bc!";`,
      expected: ["URL query contains hardcoded token value"],
    },
    {
      file: ".mcp.json",
      body: JSON.stringify({
        url: `${mcpUrl}?${querySecretKey}=\${MCP_SECRET}&id=plugin-123`,
      }),
      expected: [],
    },
    {
      file: "src/config.ts",
      body: `const endpoint = "${mcpUrl}?id=plugin-123&mode=preview";`,
      expected: [],
    },
  ];

  for (const testCase of cases) {
    assert.deepEqual(
      [...labelsInBody(testCase.body, testCase.file)].sort(),
      [...testCase.expected].sort(),
      `tracked-secret self-test failed for ${testCase.file}`,
    );
  }

  const shapedTokenBody = [
    `shpat_${"x".repeat(24)}`,
    `shpat_${"A".repeat(24)}`,
  ].join("\n");
  assert(
    labelsInBody(shapedTokenBody, "docs/tokens.txt").has(
      "Shopify access token",
    ),
  );
}

runSelfTest();
if (process.argv.includes("--self-test")) {
  console.log("Tracked-secret audit self-test passed.");
  process.exit(0);
}

const files = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
const findings = [];

for (const file of files) {
  let body;
  try {
    if (statSync(file).size > 2_000_000) continue;
    body = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (body.includes("\0")) continue;

  for (const label of labelsInBody(body, file)) findings.push({ file, label });
}

if (findings.length > 0) {
  console.error("Tracked credential material found:");
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.label}`);
  }
  console.error(
    "Values are intentionally omitted. Move credentials to managed environment variables and rotate them.",
  );
  process.exit(1);
}

console.log(`Tracked-secret audit passed (${files.length} files checked).`);
