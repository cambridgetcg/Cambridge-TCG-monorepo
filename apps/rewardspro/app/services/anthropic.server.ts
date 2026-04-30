/**
 * Bedrock-backed Claude Service
 *
 * Provides AI-powered content generation for email templates via AWS Bedrock.
 * Uses the same Messages API surface as the direct Anthropic SDK, just routed
 * through Bedrock — credentials come from the existing AWS_ACCESS_KEY_ID env
 * (no separate ANTHROPIC_API_KEY needed) and billing flows through AWS.
 *
 * Supports streaming responses for real-time content preview.
 */

import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import { buildSystemPrompt, buildUserPrompt } from "./anthropic-prompts.server";

// ============================================================================
// CONFIGURATION
// ============================================================================

// Bedrock inference profile id. Sonnet 4.6 (latest in 4.x family) in eu-north-1
// requires the EU cross-region inference profile (the bare model id only works
// for older provisioned-throughput setups).
const BEDROCK_MODEL = "eu.anthropic.claude-sonnet-4-6";
const MAX_TOKENS = 1024;
const AWS_REGION = (process.env.AWS_REGION || "eu-north-1").trim();

// Lazy-initialized client. Credentials picked up from the AWS default chain
// (env vars on Vercel, or local profile in dev).
let bedrockClient: AnthropicBedrock | null = null;

function getClient(): AnthropicBedrock {
  if (!bedrockClient) {
    bedrockClient = new AnthropicBedrock({
      awsRegion: AWS_REGION,
    });
  }
  return bedrockClient;
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
 * Stream content generation from Claude via Bedrock.
 * Yields chunks as they arrive for real-time display.
 */
export async function* streamGeneration(
  request: AIGenerationRequest
): AsyncGenerator<StreamChunk> {
  const client = getClient();

  const systemPrompt = buildSystemPrompt(request.context);
  const userPrompt = buildUserPrompt(request.action, request.prompt, request.context);

  console.log(
    `[Bedrock] Starting stream generation for ${request.shop}, action: ${request.action}`
  );

  try {
    const stream = await client.messages.stream({
      model: BEDROCK_MODEL,
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
      `[Bedrock] Stream complete. Input tokens: ${finalMessage.usage.input_tokens}, Output tokens: ${finalMessage.usage.output_tokens}`
    );
  } catch (error) {
    console.error("[Bedrock] Stream error:", error);
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
 * Generate content without streaming (for quick operations).
 */
export async function generateContent(
  request: AIGenerationRequest
): Promise<{ content: string; usage: { input: number; output: number } }> {
  const client = getClient();

  const systemPrompt = buildSystemPrompt(request.context);
  const userPrompt = buildUserPrompt(request.action, request.prompt, request.context);

  console.log(
    `[Bedrock] Non-streaming generation for ${request.shop}, action: ${request.action}`
  );

  try {
    const response = await client.messages.create({
      model: BEDROCK_MODEL,
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
      `[Bedrock] Generation complete. Input: ${response.usage.input_tokens}, Output: ${response.usage.output_tokens}`
    );

    return {
      content,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    };
  } catch (error) {
    console.error("[Bedrock] Generation error:", error);
    throw error;
  }
}

// ============================================================================
// SUBJECT LINE GENERATION
// ============================================================================

/**
 * Generate multiple subject line variations.
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
 * Enhance existing content based on instruction.
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
