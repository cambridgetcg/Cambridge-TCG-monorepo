import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// GitBook API configuration
const GITBOOK_API_KEY = process.env.GITBOOK_API_KEY;
const GITBOOK_ORG_ID = process.env.GITBOOK_ORG_ID || "VJBnfwGxopYM3L5yD24u";
const GITBOOK_SITE_ID = process.env.GITBOOK_SITE_ID || "site_woFqX";
const GITBOOK_API_URL = `https://api.gitbook.com/v1/orgs/${GITBOOK_ORG_ID}/sites/${GITBOOK_SITE_ID}/ask`;

// Enable debug logging
const DEBUG = process.env.NODE_ENV !== "production" || process.env.GITBOOK_DEBUG === "true";

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

    if (DEBUG) {
      console.log(`[GitBook Debug] API URL: ${GITBOOK_API_URL}`);
      console.log(`[GitBook Debug] Org ID: ${GITBOOK_ORG_ID}`);
      console.log(`[GitBook Debug] Site ID: ${GITBOOK_SITE_ID}`);
      console.log(`[GitBook Debug] API Key configured: ${GITBOOK_API_KEY ? "Yes (length: " + GITBOOK_API_KEY.length + ")" : "No"}`);
    }

    // Make request to GitBook API
    // See: https://gitbook.com/docs/developers/gitbook-api/api-reference/docs-sites/site-ai-ask
    const requestBody = {
      question,
      scope: "all",
    };

    if (DEBUG) {
      console.log(`[GitBook Debug] Request body:`, JSON.stringify(requestBody, null, 2));
    }

    const gitbookResponse = await fetch(GITBOOK_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GITBOOK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (DEBUG) {
      console.log(`[GitBook Debug] Response status: ${gitbookResponse.status}`);
      const headers: Record<string, string> = {};
      gitbookResponse.headers.forEach((value, key) => { headers[key] = value; });
      console.log(`[GitBook Debug] Response headers:`, headers);
    }

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

    // Always log raw response info for debugging
    console.log(`[GitBook Assistant] Raw response length: ${responseText.length}`);
    console.log(`[GitBook Assistant] Raw response (first 1000 chars):`, responseText.substring(0, 1000));

    // Parse the streamed response (Server-Sent Events format)
    const lines = responseText.split('\n').filter(line => line.trim());
    let answer = "";
    let followupQuestions: string[] = [];
    let sources: any[] = [];

    console.log(`[GitBook Assistant] Number of lines in response: ${lines.length}`);

    // Log first few raw lines for debugging
    console.log(`[GitBook Assistant] First 5 raw lines:`);
    lines.slice(0, 5).forEach((line, i) => {
      console.log(`  Line ${i}: ${line.substring(0, 300)}`);
    });

    // Track all event types we see for debugging
    const eventTypes: string[] = [];
    let currentEvent = "";

    for (const line of lines) {
      // Handle event type lines
      if (line.startsWith('event: ')) {
        currentEvent = line.substring(7).trim();
        eventTypes.push(currentEvent);
        console.log(`[GitBook Assistant] SSE event type: ${currentEvent}`);
        continue;
      }

      if (line.startsWith('data: ')) {
        try {
          const jsonStr = line.substring(6);

          // Skip empty data
          if (!jsonStr.trim() || jsonStr.trim() === '[DONE]') {
            continue;
          }

          const data = JSON.parse(jsonStr);

          // Track event types from data payload too
          if (data.type && !eventTypes.includes(data.type)) {
            eventTypes.push(data.type);
          }

          console.log(`[GitBook Assistant] Parsed SSE data type: ${data.type || currentEvent}, keys: [${Object.keys(data).join(", ")}]`);

          // Handle different event types from GitBook
          if ((data.type === "answer" || currentEvent === "answer") && data.answer) {
            console.log(`[GitBook Assistant] Answer object keys: [${Object.keys(data.answer).join(", ")}]`);
            if (data.answer.answer) {
              console.log(`[GitBook Assistant] Inner answer keys: [${Object.keys(data.answer.answer).join(", ")}]`);
            }

            // Try multiple paths to find the answer
            if (data.answer.answer?.markdown) {
              answer = data.answer.answer.markdown;
            } else if (data.answer.markdown) {
              answer = data.answer.markdown;
            } else if (data.answer.text) {
              answer = data.answer.text;
            } else if (typeof data.answer === "string") {
              answer = data.answer;
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

          // Handle streaming text chunks (event: message or type: message/text/chunk)
          if (data.type === "text" || data.type === "message" || data.type === "chunk" || currentEvent === "message") {
            const textContent = data.text || data.content || data.message || data.delta?.content || data.choices?.[0]?.delta?.content;
            if (textContent) {
              answer += textContent;
              console.log(`[GitBook Assistant] Appending text chunk (${textContent.length} chars)`);
            }
          }

          // Check for completion events that might contain the full answer
          if (data.type === "complete" || data.type === "done" || currentEvent === "done") {
            console.log(`[GitBook Assistant] Completion event: ${JSON.stringify(data).substring(0, 500)}`);
            // Try to extract answer from completion event
            if (data.answer && !answer) {
              answer = data.answer.answer?.markdown || data.answer.markdown || data.answer.text || "";
            }
            if (data.followupQuestions && followupQuestions.length === 0) {
              followupQuestions = data.followupQuestions;
            }
            if (data.sources && sources.length === 0) {
              sources = data.sources;
            }
          }
        } catch (e) {
          // Log parse errors with more context
          console.warn(`[GitBook Assistant] Failed to parse SSE line (event: ${currentEvent}): ${line.substring(0, 300)}`);
        }
      } else if (line.trim() && !line.startsWith(':')) {
        console.log(`[GitBook Assistant] Other line type: ${line.substring(0, 100)}`);
      }
    }

    // Always log event types summary for debugging
    console.log(`[GitBook Assistant] SSE event types received: [${eventTypes.join(", ")}]`);
    console.log(`[GitBook Assistant] Extracted answer length: ${answer.length}, sources: ${sources.length}, followups: ${followupQuestions.length}`);

    // If we couldn't parse the streamed response, try parsing as regular JSON
    // This handles non-streaming responses from GitBook
    if (!answer && responseText && !responseText.includes('data: ')) {
      try {
        const jsonResponse = JSON.parse(responseText);
        console.log(`[GitBook Assistant] Parsed as JSON, keys: [${Object.keys(jsonResponse).join(", ")}]`);

        // Try multiple paths to extract the answer
        if (jsonResponse.answer?.answer?.markdown) {
          answer = jsonResponse.answer.answer.markdown;
        } else if (jsonResponse.answer?.markdown) {
          answer = jsonResponse.answer.markdown;
        } else if (jsonResponse.answer?.text) {
          answer = jsonResponse.answer.text;
        } else if (jsonResponse.text) {
          answer = jsonResponse.text;
        } else if (jsonResponse.markdown) {
          answer = jsonResponse.markdown;
        } else if (typeof jsonResponse.answer === "string") {
          answer = jsonResponse.answer;
        }

        if (jsonResponse.answer?.followupQuestions) {
          followupQuestions = jsonResponse.answer.followupQuestions;
        } else if (jsonResponse.followupQuestions) {
          followupQuestions = jsonResponse.followupQuestions;
        }

        if (jsonResponse.answer?.sources) {
          sources = jsonResponse.answer.sources;
        } else if (jsonResponse.sources) {
          sources = jsonResponse.sources;
        }
      } catch (e) {
        console.error("[GitBook Assistant] Failed to parse as JSON:", e);
      }
    }

    console.log(`[GitBook Assistant] Final result - answer length: ${answer.length}, sources: ${sources.length}, followups: ${followupQuestions.length}`);

    if (!answer) {
      console.warn(`[GitBook Assistant] WARNING: No answer extracted from response`);
      console.log(`[GitBook Assistant] Full response for debugging:`, responseText);
    }

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
