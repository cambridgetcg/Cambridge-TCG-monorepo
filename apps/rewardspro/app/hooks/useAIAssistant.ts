/**
 * useAIAssistant Hook
 *
 * Manages AI content generation with SSE streaming support.
 * Handles streaming state, error handling, and abort functionality.
 */

import { useState, useCallback, useRef } from "react";

// ============================================================================
// TYPES
// ============================================================================

export type AIAction = "generate" | "enhance" | "subject_lines";

export interface AIContext {
  templateType: string;
  shopName?: string;
  currentContent?: string;
  blockType?: string;
  currentSubject?: string;
  previewText?: string;
}

interface StreamChunk {
  type: "text" | "done" | "error";
  content?: string;
  error?: string;
}

interface UseAIAssistantReturn {
  /** Generate or enhance content with streaming */
  generate: (prompt: string, context: AIContext, action?: AIAction) => Promise<void>;
  /** Generate subject line suggestions (non-streaming) */
  generateSubjects: (context: AIContext, prompt?: string) => Promise<string[]>;
  /** Current streamed content */
  streamedContent: string;
  /** Whether streaming is in progress */
  isStreaming: boolean;
  /** Error message if any */
  error: string | null;
  /** Abort the current stream */
  abort: () => void;
  /** Reset state */
  reset: () => void;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useAIAssistant(): UseAIAssistantReturn {
  const [streamedContent, setStreamedContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Reset all state
   */
  const reset = useCallback(() => {
    setStreamedContent("");
    setError(null);
    setIsStreaming(false);
  }, []);

  /**
   * Abort current streaming request
   */
  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  /**
   * Generate or enhance content with streaming
   */
  const generate = useCallback(
    async (prompt: string, context: AIContext, action: AIAction = "generate") => {
      // Abort any existing request
      abort();

      // Reset state
      setStreamedContent("");
      setError(null);
      setIsStreaming(true);

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch("/api/ai-email-assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            prompt,
            context,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Request failed: ${response.status}`);
        }

        // Handle SSE stream
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();

              if (data === "[DONE]") {
                setIsStreaming(false);
                return;
              }

              try {
                const chunk: StreamChunk = JSON.parse(data);

                if (chunk.type === "text" && chunk.content) {
                  setStreamedContent((prev) => prev + chunk.content);
                } else if (chunk.type === "error") {
                  throw new Error(chunk.error || "Stream error");
                } else if (chunk.type === "done") {
                  setIsStreaming(false);
                  return;
                }
              } catch (parseError) {
                // Skip invalid JSON
                console.warn("[useAIAssistant] Invalid chunk:", data);
              }
            }
          }
        }

        setIsStreaming(false);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Request was aborted, don't treat as error
          return;
        }

        console.error("[useAIAssistant] Error:", err);
        setError(err instanceof Error ? err.message : "Something went wrong");
        setIsStreaming(false);
      }
    },
    [abort]
  );

  /**
   * Generate subject line suggestions (non-streaming)
   */
  const generateSubjects = useCallback(
    async (context: AIContext, prompt?: string): Promise<string[]> => {
      setError(null);

      try {
        const response = await fetch("/api/ai-email-assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "subject_lines",
            prompt: prompt || "Generate compelling subject lines",
            context,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Request failed: ${response.status}`);
        }

        const data = await response.json();
        return data.subjectLines || [];
      } catch (err) {
        console.error("[useAIAssistant] Subject lines error:", err);
        setError(err instanceof Error ? err.message : "Failed to generate subjects");
        return [];
      }
    },
    []
  );

  return {
    generate,
    generateSubjects,
    streamedContent,
    isStreaming,
    error,
    abort,
    reset,
  };
}

export default useAIAssistant;
