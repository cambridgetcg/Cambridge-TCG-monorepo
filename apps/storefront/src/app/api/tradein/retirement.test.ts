import { describe, expect, it } from "vitest";
import { GET as getStatus } from "./status/route";
import { POST as submitTradeIn } from "./submit/route";
import {
  PATCH as answerQuote,
  POST as issueQuote,
} from "./quote/route";
import { POST as sellForCredit } from "../market/sell-for-credit/route";
import { POST as requestQuote } from "../quotes/route";

function retiredRequest(path: string): Request {
  return new Request(`https://cambridgetcg.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Deliberately invalid JSON: the retired handlers must return before
    // trying to parse former trade-in submission content.
    body: "not-json-and-not-collected",
  });
}

describe("retired trade-in write boundary", () => {
  it("returns 410 from every legacy path without parsing submission content", async () => {
    const responses = await Promise.all([
      getStatus(),
      submitTradeIn(),
      issueQuote(),
      answerQuote(),
      sellForCredit(retiredRequest("/api/market/sell-for-credit")),
      requestQuote(retiredRequest("/api/quotes")),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      410, 410, 410, 410, 410, 410,
    ]);
    const responseCopy = (
      await Promise.all(responses.map((response) => response.text()))
    ).join(" ");
    expect(responseCopy).not.toMatch(/zero (?:trade-in )?submissions?|zero records?/i);
  });
});
