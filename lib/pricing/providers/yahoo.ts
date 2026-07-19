import type {
  CurrentQuote,
  DailyPrice,
  PricingProvider,
  PricingRequestOptions,
} from "../types";

const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

type YahooChart = {
  chart?: {
    error?: { description?: string } | null;
    result?: Array<{
      meta?: {
        currency?: string;
        regularMarketPrice?: number;
        regularMarketTime?: number;
        marketState?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{ close?: Array<number | null> }>;
        adjclose?: Array<{ adjclose?: Array<number | null> }>;
      };
    }>;
  };
};

function cleanSymbols(symbols: string[]) {
  return [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
}

function unixDate(date: string) {
  const value = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(value)) throw new Error(`Invalid market-data date: ${date}`);
  return Math.floor(value / 1000);
}

function dateFromUnix(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

async function chart(
  symbol: string,
  query: URLSearchParams,
  options?: PricingRequestOptions,
) {
  const response = await fetch(`${CHART_URL}/${encodeURIComponent(symbol)}?${query}`, {
    signal: options?.signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Yahoo Finance returned ${response.status} for ${symbol}.`);
  }
  const payload = await response.json() as YahooChart;
  const error = payload.chart?.error;
  const result = payload.chart?.result?.[0];
  if (error || !result) {
    throw new Error(error?.description || `Yahoo Finance has no data for ${symbol}.`);
  }
  return result;
}

export const yahooProvider: PricingProvider = {
  id: "yahoo",
  name: "Yahoo Finance",
  requiresApiKey: false,

  async getCurrentQuotes(symbols, options) {
    const uniqueSymbols = cleanSymbols(symbols);
    const results = await Promise.allSettled(uniqueSymbols.map(async (symbol) => {
      const result = await chart(symbol, new URLSearchParams({
        interval: "1d",
        range: "5d",
      }), options);
      const closes = result.indicators?.quote?.[0]?.close || [];
      const fallbackPrice = [...closes].reverse().find(
        (price): price is number => typeof price === "number" && Number.isFinite(price),
      );
      const price = result.meta?.regularMarketPrice ?? fallbackPrice;
      if (typeof price !== "number" || !Number.isFinite(price)) {
        throw new Error(`Yahoo Finance has no current price for ${symbol}.`);
      }
      return {
        symbol,
        price,
        currency: result.meta?.currency || "USD",
        asOf: new Date((result.meta?.regularMarketTime || Date.now() / 1000) * 1000).toISOString(),
        marketState: result.meta?.marketState,
      } satisfies CurrentQuote;
    }));

    const quotes = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    if (uniqueSymbols.length && !quotes.length) {
      const failure = results.find((result) => result.status === "rejected");
      throw failure && failure.status === "rejected"
        ? failure.reason
        : new Error("Yahoo Finance did not return any quotes.");
    }
    return quotes;
  },

  async getDailyPrices(symbol, startDate, endDate, options) {
    const end = endDate || new Date().toISOString().slice(0, 10);
    const result = await chart(symbol.trim().toUpperCase(), new URLSearchParams({
      interval: "1d",
      period1: String(unixDate(startDate)),
      period2: String(unixDate(end) + 86_400),
      events: "div,splits",
    }), options);
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const adjusted = result.indicators?.adjclose?.[0]?.adjclose || [];

    return timestamps.flatMap((timestamp, index) => {
      const close = closes[index];
      const adjustedClose = adjusted[index] ?? close;
      if (
        typeof close !== "number" ||
        typeof adjustedClose !== "number" ||
        !Number.isFinite(close) ||
        !Number.isFinite(adjustedClose)
      ) return [];
      return [{
        date: dateFromUnix(timestamp),
        close,
        adjustedClose,
      } satisfies DailyPrice];
    });
  },
};
