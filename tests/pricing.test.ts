import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PRICING_PROVIDER,
  getCurrentQuotes,
  getDailyPrices,
  getPricingProvider,
} from "../lib/pricing/index";
import { calculateCreditDelay } from "../lib/pricing/rate-limit";

test("defaults to Twelve Data and can return Yahoo quotes through the shared call", async () => {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requested.push(url);
    const symbol = url.includes("/AAPL?") ? "AAPL" : "MSFT";
    return new Response(JSON.stringify({
      chart: {
        error: null,
        result: [{
          meta: {
            currency: "USD",
            regularMarketPrice: symbol === "AAPL" ? 225.5 : 450.25,
            regularMarketTime: 1_721_347_200,
            marketState: "CLOSED",
          },
          indicators: { quote: [{ close: [1] }] },
        }],
      },
    }));
  };

  try {
    assert.equal(DEFAULT_PRICING_PROVIDER, "twelve-data");
    assert.equal(getPricingProvider().name, "Twelve Data");
    const quotes = await getCurrentQuotes(["aapl", "MSFT", "AAPL"], "yahoo");
    assert.deepEqual(quotes.map(({ symbol, price }) => ({ symbol, price })), [
      { symbol: "AAPL", price: 225.5 },
      { symbol: "MSFT", price: 450.25 },
    ]);
    assert.equal(requested.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns adjusted daily Yahoo prices through the shared history call", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    chart: {
      error: null,
      result: [{
        timestamp: [1_704_067_200, 1_704_153_600],
        indicators: {
          quote: [{ close: [470, 472] }],
          adjclose: [{ adjclose: [468.5, 470.25] }],
        },
      }],
    },
  }));

  try {
    const prices = await getDailyPrices("SPY", "2024-01-01", "2024-01-02", "yahoo");
    assert.deepEqual(prices, [
      { date: "2024-01-01", close: 470, adjustedClose: 468.5 },
      { date: "2024-01-02", close: 472, adjustedClose: 470.25 },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requires a user API key when Twelve Data is selected", async () => {
  await assert.rejects(
    getCurrentQuotes(["SPY"], "twelve-data"),
    /API key is required/,
  );
});

test("reserves the next credit window after eight Twelve Data credits", () => {
  const now = 100_000;
  const fullWindow = Array.from({ length: 8 }, (_, index) => now - 1_000 - index);

  assert.equal(calculateCreditDelay([], 8, now), 0);
  assert.equal(calculateCreditDelay(fullWindow, 1, now), 59_093);
  assert.throws(() => calculateCreditDelay([], 9, now), /more than 8 credits/);
});

test("treats a missing Twelve Data ticker as unavailable instead of failing the batch", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    status: "error",
    message: "The symbol parameter is invalid: GONE",
  }));

  try {
    assert.deepEqual(
      await getCurrentQuotes(["GONE"], "twelve-data", { apiKey: "test-key" }),
      [],
    );
    assert.deepEqual(
      await getDailyPrices("GONE", "2024-01-01", "2024-02-01", "twelve-data", { apiKey: "test-key" }),
      [],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
