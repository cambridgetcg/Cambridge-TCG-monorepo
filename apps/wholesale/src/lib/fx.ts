/**
 * Fetch GBP-base exchange rates from the European Central Bank's daily
 * reference-rate XML. ECB statistics permit commercial and non-commercial
 * reuse with source attribution.
 *
 * ECB quotes currencies per EUR. Cambridge transforms them to units per GBP:
 * target_per_gbp = target_per_eur / gbp_per_eur.
 */

import { XMLParser } from "fast-xml-parser";

export const ECB_DAILY_RATES_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
export const ECB_REUSE_POLICY_URL =
  "https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html";

interface EcbQuote {
  currency?: string;
  rate?: string | number;
}

interface EcbDailyCube {
  time?: string;
  Cube?: EcbQuote | EcbQuote[];
}

interface EcbDocument {
  "gesmes:Envelope"?: {
    Cube?: {
      Cube?: EcbDailyCube;
    };
  };
}

export interface EcbGbpRate {
  currency: string;
  rate: number;
  as_of: string;
  source: "ecb.europa.eu";
}

/** Parse one target rate from ECB's EUR-base daily XML and rebase to GBP. */
export function parseEcbGbpRate(xml: string, code: string): EcbGbpRate | null {
  const currency = code.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return null;

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
  });
  const document = parser.parse(xml) as EcbDocument;
  const daily = document["gesmes:Envelope"]?.Cube?.Cube;
  const quotes = daily?.Cube
    ? Array.isArray(daily.Cube)
      ? daily.Cube
      : [daily.Cube]
    : [];

  const perEur: Record<string, number> = { EUR: 1 };
  for (const quote of quotes) {
    const quoteCurrency = quote.currency?.toUpperCase();
    const quoteRate = Number(quote.rate);
    if (quoteCurrency && Number.isFinite(quoteRate) && quoteRate > 0) {
      perEur[quoteCurrency] = quoteRate;
    }
  }

  const gbpPerEur = perEur.GBP;
  const targetPerEur = currency === "GBP" ? gbpPerEur : perEur[currency];
  if (!daily?.time || !gbpPerEur || !targetPerEur) return null;

  return {
    currency,
    rate: currency === "GBP" ? 1 : Number((targetPerEur / gbpPerEur).toFixed(12)),
    as_of: daily.time,
    source: "ecb.europa.eu",
  };
}

/** Fetch units of `code` per GBP from the ECB daily reference rates. */
export async function fetchGbpRate(code: string): Promise<number> {
  const upper = code.toUpperCase();
  const res = await fetch(ECB_DAILY_RATES_URL, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    throw new Error(`ECB daily FX feed returned HTTP ${res.status}`);
  }

  const parsed = parseEcbGbpRate(await res.text(), upper);
  if (!parsed) {
    throw new Error(`ECB daily FX feed has no valid GBP/${upper} rate`);
  }
  return parsed.rate;
}

export async function fetchGbpJpyRate(): Promise<number> {
  return fetchGbpRate("JPY");
}

export async function fetchGbpUsdRate(): Promise<number> {
  return fetchGbpRate("USD");
}
