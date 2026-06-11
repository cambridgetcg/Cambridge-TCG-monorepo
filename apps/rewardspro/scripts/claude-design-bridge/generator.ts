/**
 * Generator abstraction — swap the backend without changing callers.
 *
 * The default backend is Anthropic's API (the same model family that
 * powers Claude Design). If Claude Design ever exposes a direct API,
 * drop in a new `Generator` and leave the CLI untouched.
 */
import Anthropic from "@anthropic-ai/sdk";

export interface ExtractedCode {
  html: string;
  css: string;
  liquid: string;
}

export interface GenerationResult {
  text: string;
  code: ExtractedCode;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface Generator {
  generate(systemPrompt: string, userPrompt: string): Promise<GenerationResult>;
}

export class AnthropicGenerator implements Generator {
  constructor(
    private readonly model: string = "claude-opus-4-7",
    private readonly maxTokens: number = 8192
  ) {}

  async generate(systemPrompt: string, userPrompt: string): Promise<GenerationResult> {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return {
      text,
      code: extractCode(text),
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}

/**
 * Returns a fixed fixture. Useful for testing the pipeline without
 * burning tokens, and for snapshotting a known-good generation so
 * the scorer can be regression-tested.
 */
export class MockGenerator implements Generator {
  constructor(private readonly fixture: string) {}
  async generate(): Promise<GenerationResult> {
    return {
      text: this.fixture,
      code: extractCode(this.fixture),
      model: "mock",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}

/**
 * Pulls html / css / liquid fenced blocks out of a markdown-ish response.
 * Unlabeled fences that contain tag syntax are treated as HTML.
 */
export function extractCode(text: string): ExtractedCode {
  let html = "";
  let css = "";
  let liquid = "";
  const blocks = [...text.matchAll(/```(\w+)?\n([\s\S]*?)```/g)];
  for (const [, rawLang, body] of blocks) {
    const lang = (rawLang || "").toLowerCase();
    if (lang === "html") html += body + "\n";
    else if (lang === "css") css += body + "\n";
    else if (lang === "liquid") liquid += body + "\n";
    else if (lang === "" || lang === "text") {
      if (/<[a-z][\s\S]*?>/i.test(body)) html += body + "\n";
      else if (/\{[\s\S]*?:[\s\S]*?;[\s\S]*?\}/.test(body)) css += body + "\n";
    }
  }
  // Separate embedded <style> from the HTML body into the css bucket.
  const styleMatches = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
  for (const [full, body] of styleMatches) {
    css += body + "\n";
    html = html.replace(full, "");
  }
  return { html: html.trim(), css: css.trim(), liquid: liquid.trim() };
}
