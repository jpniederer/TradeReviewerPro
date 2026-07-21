import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Transaction } from "../lib/importers/robinhood";
import { getCachedCurrentQuotes, getCachedDailyPrices, readCachedCurrentQuotes, readCachedDailyPrices } from "../lib/pricing/cache";
import { pricingProviders, type CurrentQuote, type DailyPrice, type PricingProviderId } from "../lib/pricing";
import { waitForTwelveDataCredits } from "../lib/pricing/rate-limit";

type Setter<T> = Dispatch<SetStateAction<T>>;

type UsePricingOptions = {
  transactions: Transaction[];
  isDemo: boolean;
  holdingSymbols: string;
  provider: PricingProviderId;
  apiKey: string;
  refreshVersion: number;
  handledRefreshVersionRef: MutableRefObject<number>;
  quotesReadyForHistory: boolean;
  setCurrentQuotes: Setter<Record<string, CurrentQuote>>;
  setQuotesLoaded: Setter<boolean>;
  setQuoteFetchInProgress: Setter<boolean>;
  setQuotesReadyForHistory: Setter<boolean>;
  setQuoteStatus: Setter<string>;
  setHistoryStatus: Setter<string>;
  setPricingError: Setter<string>;
  setSpyPriceCount: Setter<number>;
  setSpyPrices: Setter<DailyPrice[]>;
};

export function usePricing(options: UsePricingOptions) {
  const { transactions, isDemo, holdingSymbols, provider, apiKey, refreshVersion, handledRefreshVersionRef, quotesReadyForHistory, setCurrentQuotes, setQuotesLoaded, setQuoteFetchInProgress, setQuotesReadyForHistory, setQuoteStatus, setHistoryStatus, setPricingError, setSpyPriceCount, setSpyPrices } = options;

  useEffect(() => {
    if (isDemo || !holdingSymbols) return;
    const controller = new AbortController();
    const symbols = ["SPY", ...holdingSymbols.split(",")];
    const canFetch = !pricingProviders[provider].requiresApiKey || Boolean(apiKey);
    const refresh = refreshVersion > handledRefreshVersionRef.current;
    if (refresh) handledRefreshVersionRef.current = refreshVersion;
    const waitForCredits = async (credits: number) => {
      if (provider !== "twelve-data") return;
      await waitForTwelveDataCredits(credits, controller.signal, (milliseconds) => {
        if (!controller.signal.aborted) setQuoteStatus(`Current quotes queued for the next credit window (${Math.max(1, Math.ceil(milliseconds / 1000))}s)`);
      });
    };
    void (async () => {
      try {
        const quotes = canFetch
          ? await getCachedCurrentQuotes(symbols, provider, { apiKey: provider === "twelve-data" ? apiKey : undefined, signal: controller.signal, beforeRequest: waitForCredits }, { refresh })
          : await readCachedCurrentQuotes(symbols, provider);
        if (controller.signal.aborted) return;
        setCurrentQuotes(Object.fromEntries(quotes.map((quote) => [quote.symbol, quote])));
        setQuotesLoaded(true);
        setQuoteFetchInProgress(false);
        setQuotesReadyForHistory(true);
        const pricedHoldings = quotes.filter((quote) => quote.symbol !== "SPY").length;
        const unavailable = Math.max(0, symbols.length - quotes.length);
        setQuoteStatus(`${pricedHoldings} of ${symbols.length - 1} priority holdings priced and saved${unavailable ? ` · ${unavailable} ticker${unavailable === 1 ? "" : "s"} unavailable` : ""}`);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setQuoteFetchInProgress(false);
        setPricingError(caught instanceof Error ? caught.message : "Market prices could not be updated.");
      }
    })();
    return () => controller.abort();
  }, [apiKey, handledRefreshVersionRef, holdingSymbols, isDemo, provider, refreshVersion, setCurrentQuotes, setPricingError, setQuoteFetchInProgress, setQuoteStatus, setQuotesLoaded, setQuotesReadyForHistory, transactions]);

  useEffect(() => {
    if (!quotesReadyForHistory || isDemo || !transactions.length) return;
    const controller = new AbortController();
    const canFetch = !pricingProviders[provider].requiresApiKey || Boolean(apiKey);
    const earliestDate = transactions.reduce((earliest, transaction) => transaction.date < earliest ? transaction.date : earliest, transactions[0].date);
    const endDate = new Date().toISOString().slice(0, 10);
    const request = canFetch
      ? getCachedDailyPrices("SPY", earliestDate, endDate, provider, {
          apiKey: provider === "twelve-data" ? apiKey : undefined,
          signal: controller.signal,
          beforeRequest: async (credits: number) => {
            if (provider !== "twelve-data") return;
            await waitForTwelveDataCredits(credits, controller.signal, (milliseconds) => {
              if (!controller.signal.aborted) setHistoryStatus(`SPY history queued for the next credit window (${Math.max(1, Math.ceil(milliseconds / 1000))}s)`);
            });
          },
        })
      : readCachedDailyPrices("SPY", earliestDate, endDate, provider);
    void request.then((prices) => {
      if (controller.signal.aborted) return;
      setSpyPriceCount(prices.length);
      setSpyPrices(prices);
      setHistoryStatus(`${prices.length.toLocaleString()} SPY trading days cached`);
    }).catch((caught) => {
      if (!controller.signal.aborted) setPricingError(caught instanceof Error ? caught.message : "SPY history could not be updated.");
    });
    return () => controller.abort();
  }, [apiKey, isDemo, provider, quotesReadyForHistory, setHistoryStatus, setPricingError, setSpyPriceCount, setSpyPrices, transactions]);
}
