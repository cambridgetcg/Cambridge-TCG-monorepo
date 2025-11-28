import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// GitBook API configuration
const GITBOOK_API_KEY = process.env.GITBOOK_API_KEY;
const GITBOOK_ORG_ID = process.env.GITBOOK_ORG_ID || "VJBnfwGxopYM3L5yD24u";
const GITBOOK_SITE_ID = process.env.GITBOOK_SITE_ID || "site_woFqX";
const GITBOOK_API_URL = `https://api.gitbook.com/v1/orgs/${GITBOOK_ORG_ID}/sites/${GITBOOK_SITE_ID}/ask`;

/**
 * API endpoint to proxy GitBook Assistant requests
 * This avoids CORS issues when calling GitBook API from Shopify embedded app
 */
export async function action({ request }: ActionFunctionArgs) {
  // Authenticate the request
  const { session } = await authenticate.admin(request);
  if (!session?.shop) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check if GitBook is configured
  if (!GITBOOK_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GitBook API key not configured" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const body = await request.json();
    const { question, context } = body;

    if (!question || typeof question !== "string") {
      return new Response(
        JSON.stringify({ error: "Question is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Limit question length
    if (question.length > 512) {
      return new Response(
        JSON.stringify({ error: "Question too long (max 512 characters)" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[GitBook Assistant] Question from ${session.shop}: ${question.substring(0, 100)}...`);

    // Make request to GitBook API
    const gitbookResponse = await fetch(GITBOOK_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GITBOOK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question,
        context: context || {},
        scope: {
          mode: "default",
        },
      }),
    });

    if (!gitbookResponse.ok) {
      const errorText = await gitbookResponse.text();
      console.error(`[GitBook Assistant] API error: ${gitbookResponse.status} - ${errorText}`);
      return new Response(
        JSON.stringify({
          error: "Failed to get response from GitBook",
          details: gitbookResponse.status === 401 ? "Invalid API key" : "API request failed"
        }),
        {
          status: gitbookResponse.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // GitBook returns a streamed response, we need to collect it
    const responseText = await gitbookResponse.text();

    // Parse the streamed response (Server-Sent Events format)
    const lines = responseText.split('\n').filter(line => line.trim());
    let answer = "";
    let followupQuestions: string[] = [];
    let sources: any[] = [];

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.substring(6));

          if (data.type === "answer" && data.answer) {
            if (data.answer.answer?.markdown) {
              answer = data.answer.answer.markdown;
            }
            if (data.answer.followupQuestions) {
              followupQuestions = data.answer.followupQuestions;
            }
            if (data.answer.sources) {
              sources = data.answer.sources.map((source: any) => ({
                type: source.type,
                page: source.page,
                reason: source.reason,
              }));
            }
          }
        } catch (e) {
          // Skip non-JSON lines
        }
      }
    }

    // If we couldn't parse the streamed response, try parsing as regular JSON
    if (!answer && responseText) {
      try {
        const jsonResponse = JSON.parse(responseText);
        if (jsonResponse.answer?.answer?.markdown) {
          answer = jsonResponse.answer.answer.markdown;
        }
        if (jsonResponse.answer?.followupQuestions) {
          followupQuestions = jsonResponse.answer.followupQuestions;
        }
        if (jsonResponse.answer?.sources) {
          sources = jsonResponse.answer.sources;
        }
      } catch (e) {
        console.error("[GitBook Assistant] Failed to parse response:", e);
      }
    }

    console.log(`[GitBook Assistant] Response received, answer length: ${answer.length}`);

    return new Response(
      JSON.stringify({
        answer,
        followupQuestions,
        sources,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[GitBook Assistant] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// Only allow POST requests
export async function loader() {
  return new Response("Method not allowed", { status: 405 });
}
