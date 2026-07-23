interface JsonSourceContext {
  source?: string;
}

type JsonReviverWithSource = (
  this: unknown,
  key: string,
  value: unknown,
  context?: JsonSourceContext,
) => unknown;

type JsonParseWithSource = (
  text: string,
  reviver: JsonReviverWithSource,
) => unknown;

/**
 * PostgreSQL jsonb preserves JSON numbers exactly, while JavaScript numbers do
 * not. Node 24 exposes each primitive's original token to JSON.parse revivers.
 * Keep ordinary safe integers numeric and preserve every other JSON number as
 * its exact source spelling so provider identifiers are never rounded.
 */
export function parseExactJson(text: string): unknown {
  return (JSON.parse as JsonParseWithSource)(
    text,
    (_key, value, context) => {
      if (typeof value !== "number" || context?.source === undefined) {
        return value;
      }
      return Number.isSafeInteger(value) &&
        /^-?(?:0|[1-9]\d*)$/.test(context.source)
        ? value
        : context.source;
    },
  );
}
