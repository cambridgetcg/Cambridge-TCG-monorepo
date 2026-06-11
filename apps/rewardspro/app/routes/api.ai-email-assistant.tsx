/**
 * AI Email Assistant API Route
 *
 * Provides streaming AI content generation for email templates.
 * Supports: generate, enhance, and subject_lines actions.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  streamGeneration,
  generateSubjectLines,
  type AIGenerationRequest,
  type AIAction,
  type AIContext,
} from "~/services/anthropic.server";

// ============================================================================
// REQUEST VALIDATION
// ============================================================================

interface RequestBody {
  action: AIAction;
  prompt: string;
  context: AIContext;
}

function validateRequest(body: unknown): RequestBody {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const { action, prompt, context } = body as Record<string, unknown>;

  // Validate action
  if (!action || !["generate", "enhance", "subject_lines"].includes(action as string)) {
    throw new Error("Invalid action. Must be: generate, enhance, or subject_lines");
  }

  // Validate prompt
  if (!prompt || typeof prompt !== "string") {
    throw new Error("Prompt is required");
  }

  if (prompt.length > 2000) {
    throw new Error("Prompt too long (max 2000 characters)");
  }

  // Validate context
  if (!context || typeof context !== "object") {
    throw new Error("Context is required");
  }

  const { templateType } = context as Record<string, unknown>;
  if (!templateType || typeof templateType !== "string") {
    throw new Error("templateType is required in context");
  }

  return {
    action: action as AIAction,
    prompt: prompt as string,
    context: context as AIContext,
  };
}

// ============================================================================
// STREAMING ACTION HANDLER
// ============================================================================

export async function action({ request }: ActionFunctionArgs) {
  // 1. Authenticate
  const { session } = await authenticate.admin(request);
  if (!session?.shop) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Check if Anthropic is configured
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return new Response(
      JSON.stringify({ error: "AI features not configured" }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // 3. Parse and validate request
  let validatedRequest: RequestBody;
  try {
    const body = await request.json();
    validatedRequest = validateRequest(body);
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Invalid request",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const { action: requestAction, prompt, context } = validatedRequest;

  console.log(
    `[AI Assistant] Request from ${session.shop}: action=${requestAction}, templateType=${context.templateType}`
  );

  // 4. Handle subject_lines action (non-streaming)
  if (requestAction === "subject_lines") {
    try {
      const subjectLines = await generateSubjectLines({
        shop: session.shop,
        action: requestAction,
        prompt,
        context,
      });

      return new Response(JSON.stringify({ subjectLines }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("[AI Assistant] Subject lines error:", error);
      return new Response(
        JSON.stringify({
          error: "Failed to generate subject lines",
          details: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  // 5. Handle streaming actions (generate, enhance)
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const generationRequest: AIGenerationRequest = {
          shop: session.shop,
          action: requestAction,
          prompt,
          context,
        };

        for await (const chunk of streamGeneration(generationRequest)) {
          const data = JSON.stringify(chunk);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));

          if (chunk.type === "error") {
            break;
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        console.error("[AI Assistant] Stream error:", error);
        const errorData = JSON.stringify({
          type: "error",
          error: error instanceof Error ? error.message : "Stream failed",
        });
        controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// ============================================================================
// LOADER (Block GET requests)
// ============================================================================

export async function loader() {
  return new Response("Method not allowed", { status: 405 });
}
