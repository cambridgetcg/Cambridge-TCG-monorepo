/**
 * Anthropic Claude API Service
 *
 * Provides AI-powered content generation for email templates.
 * Supports streaming responses for real-time content preview.
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, buildUserPrompt } from "./anthropic-prompts.server";

// ============================================================================
// CONFIGURATION
// ============================================================================

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 1024;

function getAnthropicApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }
  return key;
}

// Lazy-initialized client
let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: getAnthropicApiKey(),
    });
  }
  return anthropicClient;
}

// ============================================================================
// TYPES
// ============================================================================

export type AIAction = "generate" | "enhance" | "subject_lines";

export interface AIContext {
  /** Template type (tier_welcome, promotional, etc.) */
  templateType: string;
  /** Shop name for brand context */
  shopName?: string;
  /** Current content for enhancement */
  currentContent?: string;
  /** Block type being generated */
  blockType?: string;
  /** Current subject line (for subject_lines action) */
  currentSubject?: string;
  /** Preview text (for subject_lines action) */
  previewText?: string;
}

export interface AIGenerationRequest {
  shop: string;
  action: AIAction;
  prompt: string;
  context: AIContext;
}

export interface StreamChunk {
  type: "text" | "done" | "error";
  content?: string;
  error?: string;
}

// ============================================================================
// STREAMING GENERATION
// ============================================================================

/**
 * Stream content generation from Claude API
 * Yields chunks as they arrive for real-time display
 */
export async function* streamGeneration(
  request: AIGenerationRequest
): AsyncGenerator<StreamChunk> {
  const client = getClient();

  const systemPrompt = buildSystemPrompt(request.context);
  const userPrompt = buildUserPrompt(request.action, request.prompt, request.context);

  console.log(
    `[Anthropic] Starting stream generation for ${request.shop}, action: ${request.action}`
  );

  try {
    const stream = await client.messages.stream({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield {
          type: "text",
          content: event.delta.text,
        };
      }
    }

    yield { type: "done" };

    // Log usage for tracking
    const finalMessage = await stream.finalMessage();
    console.log(
      `[Anthropic] Stream complete. Input tokens: ${finalMessage.usage.input_tokens}, Output tokens: ${finalMessage.usage.output_tokens}`
    );
  } catch (error) {
    console.error("[Anthropic] Stream error:", error);
    yield {
      type: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// NON-STREAMING GENERATION
// ============================================================================

/**
 * Generate content without streaming (for quick operations)
 */
export async function generateContent(
  request: AIGenerationRequest
): Promise<{ content: string; usage: { input: number; output: number } }> {
  const client = getClient();

  const systemPrompt = buildSystemPrompt(request.context);
  const userPrompt = buildUserPrompt(request.action, request.prompt, request.context);

  console.log(
    `[Anthropic] Non-streaming generation for ${request.shop}, action: ${request.action}`
  );

  try {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const textContent = response.content.find((block) => block.type === "text");
    const content = textContent?.type === "text" ? textContent.text : "";

    console.log(
      `[Anthropic] Generation complete. Input: ${response.usage.input_tokens}, Output: ${response.usage.output_tokens}`
    );

    return {
      content,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    };
  } catch (error) {
    console.error("[Anthropic] Generation error:", error);
    throw error;
  }
}

// ============================================================================
// SUBJECT LINE GENERATION
// ============================================================================

/**
 * Generate multiple subject line variations
 * Returns an array of subject line options
 */
export async function generateSubjectLines(
  request: AIGenerationRequest
): Promise<string[]> {
  const result = await generateContent({
    ...request,
    action: "subject_lines",
    prompt: request.prompt || "Generate compelling subject lines for this email",
  });

  // Parse the response into individual subject lines
  const lines = result.content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    // Remove numbered prefixes like "1." or "1)"
    .map((line) => line.replace(/^\d+[\.\)]\s*/, ""))
    // Remove bullet points
    .map((line) => line.replace(/^[-•]\s*/, ""))
    .filter((line) => line.length > 0 && line.length <= 80);

  // Return up to 5 subject lines
  return lines.slice(0, 5);
}

// ============================================================================
// CONTENT ENHANCEMENT
// ============================================================================

/**
 * Enhance existing content based on instruction
 */
export async function enhanceContent(
  shop: string,
  currentContent: string,
  instruction: string,
  context: AIContext
): Promise<string> {
  const result = await generateContent({
    shop,
    action: "enhance",
    prompt: instruction,
    context: {
      ...context,
      currentContent,
    },
  });

  return result.content;
}
