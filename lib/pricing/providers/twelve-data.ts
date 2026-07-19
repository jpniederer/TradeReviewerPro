import type {
  CurrentQuote,
  DailyPrice,
  PricingProvider,
  PricingRequestOptions,
} from "../types";

const API_URL = "https://api.twelvedata.com";

type TwelveError = { status?: string; message?: string };
type TwelveQuote = TwelveError & {
  symbol?: string;
  close?: string;
  currency?: string;
  timestamp?: number;
};
type TwelveSeries = TwelveError & {
  values?: Array<{ datetime?: string; close?: string }>;
};

function requireKey(options?: PricingRequestOptions) {
  const key = options?.apiKey?.trim();
  if (!key) throw new Error("A Twelve Data API key is required.");
  return key;
}

function errorMessage(payload: TwelveError, fallback: string) {
  return payload.status === "error" ? payload.message || fallback : "";
}

function isMissingSymbol(message: string) {
  return /symbol.*invalid|not found|not available|no data|does not exist/i.test(message);
}

export const twelveDataProvider: PricingProvider = {
  id: "twelve-data",
  name: "Twelve Data",
  requiresApiKey: true,

  async getCurrentQuotes(symbols, options) {
    const uniqueSymbols = [...new Set(
      symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
    )];
    if (!uniqueSymbols.length) return [];
    await options?.beforeRequest?.(uniqueSymbols.length);
    const query = new URLSearchParams({
      symbol: uniqueSymbols.join(","),
      apikey: requireKey(options),
    });
    const response = await fetch(`${API_URL}/quote?${query}`, { signal: options?.signal });
    if (!response.ok) throw new Error(`Twelve Data returned ${response.status}.`);
    const payload = await response.json() as TwelveQuote | Record<string, TwelveQuote>;
    const topLevelError = errorMessage(payload as TwelveError, "Twelve Data quote request failed.");
    if (topLevelError) {
      if (isMissingSymbol(topLevelError)) return [];
      throw new Error(topLevelError);
    }

    const records = uniqueSymbols.length === 1
      ? [payload as TwelveQuote]
      : Object.values(payload as Record<string, TwelveQuote>);
    return records.flatMap((quote) => {
      const price = Number(quote.close);
      if (!quote.symbol || !Number.isFinite(price)) return [];
      return [{
        symbol: quote.symbol.toUpperCase(),
        price,
        currency: quote.currency || "USD",
        asOf: new Date((quote.timestamp || Date.now() / 1000) * 1000).toISOString(),
      } satisfies CurrentQuote];
    });
  },

  async getDailyPrices(symbol, startDate, endDate, options) {
    await options?.beforeRequest?.(1);
    const query = new URLSearchParams({
      symbol: symbol.trim().toUpperCase(),
      interval: "1day",
      start_date: startDate,
      end_date: endDate || new Date().toISOString().slice(0, 10),
      outputsize: "5000",
      order: "asc",
      adjust: "all",
      apikey: requireKey(options),
    });
    const response = await fetch(`${API_URL}/time_series?${query}`, { signal: options?.signal });
    if (!response.ok) throw new Error(`Twelve Data returned ${response.status}.`);
    const payload = await response.json() as TwelveSeries;
    const error = errorMessage(payload, "Twelve Data history request failed.");
    if (error) {
      if (isMissingSymbol(error)) return [];
      throw new Error(error);
    }

    return (payload.values || []).flatMap((bar) => {
      const close = Number(bar.close);
      if (!bar.datetime || !Number.isFinite(close)) return [];
      return [{
        date: bar.datetime.slice(0, 10),
        close,
        adjustedClose: close,
      } satisfies DailyPrice];
    });
  },
};
