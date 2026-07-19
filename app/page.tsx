"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
import {
  DecisionMap,
  ExitTimingChart,
  OutcomeDistribution,
} from "../components/trade-insight-charts";
import {
  createPortfolioAccount,
  loadPortfolioAccounts,
  savePortfolioAccounts,
  type PortfolioAccount,
} from "../lib/accounts/store";
import { parseRobinhoodCsv, type Transaction as Tx } from "../lib/importers/robinhood";
import { buildHoldings, type Holding } from "../lib/portfolio/engine";
import { buildSpyBenchmark } from "../lib/portfolio/spy-benchmark";
import { getCachedCurrentQuotes, getCachedDailyPrices } from "../lib/pricing/cache";
import {
  DEFAULT_PRICING_PROVIDER,
  pricingProviders,
  type CurrentQuote,
  type DailyPrice,
  type PricingProviderId,
} from "../lib/pricing";
import { waitForTwelveDataCredits } from "../lib/pricing/rate-limit";
import { deleteLocalDatabase } from "../lib/storage/database";
import { analyzeTrades, type RatedTrade, type TradeSide } from "../lib/trade-review/analyzer";

type TradeSort = "date" | "ticker" | "side" | "amount" | "outcome" | "score";
type SortDirection = "asc" | "desc";

const demoHoldings: Holding[] = [
  { ticker: "NVDA", name: "NVIDIA", quantity: 48, avg: 62.31, price: 139.19, value: 6681.12, gain: 3690.24, returnPct: 123.4, color: "#182e26" },
  { ticker: "AAPL", name: "Apple", quantity: 21, avg: 143.18, price: 224.76, value: 4720.0, gain: 1713.18, returnPct: 57.0, color: "#c5d0c3" },
  { ticker: "MSFT", name: "Microsoft", quantity: 9, avg: 334.22, price: 446.18, value: 4015.62, gain: 1007.64, returnPct: 33.5, color: "#e88950" },
  { ticker: "AMZN", name: "Amazon", quantity: 16, avg: 154.03, price: 207.86, value: 3325.76, gain: 861.28, returnPct: 35.0, color: "#d9d7cd" },
  { ticker: "V", name: "Visa", quantity: 8, avg: 246.10, price: 312.45, value: 2499.60, gain: 530.80, returnPct: 27.0, color: "#a4af9e" },
];

const demoCurve = [24, 25, 23, 28, 31, 30, 35, 41, 39, 46, 48, 55, 53, 63, 60, 70, 73, 82, 79, 91, 96];
const spyCurve = [24, 25, 26, 27, 29, 30, 31, 34, 35, 37, 39, 42, 43, 46, 48, 51, 53, 56, 58, 61, 64];
const TRADE_PAGE_SIZE = 20;
const INITIAL_HOLDING_QUOTE_COUNT = 7;
const HOLDING_QUOTE_BATCH_SIZE = 8;
const EXITED_PRICE_BATCH_SIZE = 8;
const PRICING_PROVIDER_KEY = "trade-reviewer-pro:pricing-provider";
const TWELVE_DATA_KEY = "trade-reviewer-pro:twelve-data-key";
const QUOTE_HOLDING_LIMIT_KEY = "trade-reviewer-pro:quote-holding-limit";
const EXITED_TICKER_LIMIT_KEY = "trade-reviewer-pro:exited-ticker-limit";
const SELECTED_ACCOUNT_KEY = "trade-reviewer-pro:selected-account";

function storedPricingProvider(): PricingProviderId {
  if (typeof window === "undefined") return DEFAULT_PRICING_PROVIDER;
  return localStorage.getItem(PRICING_PROVIDER_KEY) === "twelve-data"
    ? "twelve-data"
    : DEFAULT_PRICING_PROVIDER;
}

function storedTwelveDataKey() {
  return typeof window === "undefined" ? "" : localStorage.getItem(TWELVE_DATA_KEY) || "";
}

function accountProgressKey(key: string, accountId?: string) {
  return accountId ? `${key}:${accountId}` : key;
}

function storedQuoteHoldingLimit(accountId?: string) {
  if (typeof window === "undefined") return INITIAL_HOLDING_QUOTE_COUNT;
  const stored = Number(
    localStorage.getItem(accountProgressKey(QUOTE_HOLDING_LIMIT_KEY, accountId)) ||
    localStorage.getItem(QUOTE_HOLDING_LIMIT_KEY),
  );
  return Number.isFinite(stored) && stored >= INITIAL_HOLDING_QUOTE_COUNT
    ? Math.floor(stored)
    : INITIAL_HOLDING_QUOTE_COUNT;
}

function storedExitedTickerLimit(accountId?: string) {
  if (typeof window === "undefined") return 0;
  const stored = Number(
    localStorage.getItem(accountProgressKey(EXITED_TICKER_LIMIT_KEY, accountId)) ||
    localStorage.getItem(EXITED_TICKER_LIMIT_KEY),
  );
  return Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;
}

const demoTransactions: Tx[] = [
  { id: "demo-1", brokerage: "robinhood", ticker: "NVDA", date: "2023-05-18", type: "buy", quantity: 20, price: 45.12, amount: 902.4, rawCode: "BUY", description: "NVIDIA" },
  { id: "demo-2", brokerage: "robinhood", ticker: "AAPL", date: "2023-08-09", type: "buy", quantity: 10, price: 150.31, amount: 1503.1, rawCode: "BUY", description: "Apple" },
  { id: "demo-3", brokerage: "robinhood", ticker: "MSFT", date: "2023-10-24", type: "buy", quantity: 5, price: 330.18, amount: 1650.9, rawCode: "BUY", description: "Microsoft" },
  { id: "demo-4", brokerage: "robinhood", ticker: "TSLA", date: "2024-01-12", type: "buy", quantity: 4, price: 250.42, amount: 1001.68, rawCode: "BUY", description: "Tesla" },
  { id: "demo-5", brokerage: "robinhood", ticker: "NVDA", date: "2024-06-18", type: "sell", quantity: 5, price: 120.04, amount: 600.2, rawCode: "SELL", description: "NVIDIA" },
  { id: "demo-6", brokerage: "robinhood", ticker: "AAPL", date: "2024-11-07", type: "sell", quantity: 10, price: 195.21, amount: 1952.1, rawCode: "SELL", description: "Apple" },
  { id: "demo-7", brokerage: "robinhood", ticker: "AMZN", date: "2025-02-21", type: "buy", quantity: 10, price: 130.16, amount: 1301.6, rawCode: "BUY", description: "Amazon" },
  { id: "demo-8", brokerage: "robinhood", ticker: "TSLA", date: "2025-05-05", type: "sell", quantity: 4, price: 190.08, amount: 760.32, rawCode: "SELL", description: "Tesla" },
  { id: "demo-9", brokerage: "robinhood", ticker: "AMZN", date: "2026-02-12", type: "sell", quantity: 5, price: 180.33, amount: 901.65, rawCode: "SELL", description: "Amazon" },
  { id: "demo-10", brokerage: "robinhood", ticker: "MSFT", date: "2026-07-10", type: "buy", quantity: 2, price: 410.42, amount: 820.84, rawCode: "BUY", description: "Microsoft" },
];

function money(value: number, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: digits,
  }).format(value);
}

function percent(value: number | null) {
  if (value === null) return "Not enough data";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function friendlyDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function scoreTone(score: number) {
  if (score >= 75) return "high";
  if (score >= 58) return "mid";
  return "low";
}

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function Sparkline({ points, muted = false }: { points: number[]; muted?: boolean }) {
  const min = Math.min(...points), max = Math.max(...points);
  return (
    <div className={`sparkline ${muted ? "muted" : ""}`} aria-hidden="true">
      {points.slice(1).map((point, i) => {
        const left = (i / (points.length - 2)) * 100;
        const bottom = ((point - min) / Math.max(1, max - min)) * 80 + 8;
        const prevBottom = ((points[i] - min) / Math.max(1, max - min)) * 80 + 8;
        const dx = 100 / (points.length - 1);
        const angle = Math.atan2(bottom - prevBottom, dx) * (-180 / Math.PI);
        const length = Math.sqrt(dx * dx + (bottom - prevBottom) ** 2);
        return <i key={i} style={{ left: `${left}%`, bottom: `${prevBottom}%`, width: `${length}%`, transform: `rotate(${angle}deg)` }} />;
      })}
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<"overview" | "review" | "holdings">("overview");
  const [accounts, setAccounts] = useState<PortfolioAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<"new" | "replace">("new");
  const [accountName, setAccountName] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tradeQuery, setTradeQuery] = useState("");
  const [tradeSide, setTradeSide] = useState<"all" | Lowercase<TradeSide>>("all");
  const [tradeSort, setTradeSort] = useState<TradeSort>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [tradePage, setTradePage] = useState(1);
  const [selectedTrade, setSelectedTrade] = useState<RatedTrade | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pricingProvider, setPricingProvider] = useState<PricingProviderId>(storedPricingProvider);
  const [draftProvider, setDraftProvider] = useState<PricingProviderId>(storedPricingProvider);
  const [twelveDataKey, setTwelveDataKey] = useState(storedTwelveDataKey);
  const [draftTwelveDataKey, setDraftTwelveDataKey] = useState(storedTwelveDataKey);
  const [currentQuotes, setCurrentQuotes] = useState<Record<string, CurrentQuote>>({});
  const [quotesLoaded, setQuotesLoaded] = useState(false);
  const [quoteStatus, setQuoteStatus] = useState("");
  const [historyStatus, setHistoryStatus] = useState("");
  const [pricingError, setPricingError] = useState("");
  const [spyPriceCount, setSpyPriceCount] = useState(0);
  const [spyPrices, setSpyPrices] = useState<DailyPrice[]>([]);
  const [quoteHoldingLimit, setQuoteHoldingLimit] = useState(storedQuoteHoldingLimit);
  const [quoteFetchInProgress, setQuoteFetchInProgress] = useState(false);
  const [quotesReadyForHistory, setQuotesReadyForHistory] = useState(false);
  const [exitedTickerLimit, setExitedTickerLimit] = useState(storedExitedTickerLimit);
  const [exitedDailyPrices, setExitedDailyPrices] = useState<Record<string, DailyPrice[]>>({});
  const [exitFetchInProgress, setExitFetchInProgress] = useState(
    () => storedExitedTickerLimit() > 0,
  );
  const [exitStatus, setExitStatus] = useState("");

  useEffect(() => {
    void loadPortfolioAccounts().then((stored) => {
      setAccounts(stored);
      if (!stored.length) return;
      const remembered = localStorage.getItem(SELECTED_ACCOUNT_KEY);
      const selected = stored.some((account) => account.id === remembered)
        ? remembered!
        : stored[0].id;
      setSelectedAccountId(selected);
      setQuoteHoldingLimit(storedQuoteHoldingLimit(selected));
      setExitedTickerLimit(storedExitedTickerLimit(selected));
      setQuoteFetchInProgress(true);
      setExitFetchInProgress(storedExitedTickerLimit(selected) > 0);
      const account = stored.find((item) => item.id === selected)!;
      setNotice(`Restored ${account.name} with ${account.transactions.length.toLocaleString()} private transactions.`);
    });
  }, []);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId),
    [accounts, selectedAccountId],
  );
  const transactions = useMemo(
    () => selectedAccount?.transactions || [],
    [selectedAccount],
  );

  const rebuilt = useMemo(() => buildHoldings(transactions), [transactions]);
  const isDemo = transactions.length === 0;
  const baseHoldings = isDemo ? demoHoldings : rebuilt.holdings;
  const holdings = useMemo(() => baseHoldings.map((holding) => {
    const quote = currentQuotes[holding.ticker];
    if (!quote) return holding;
    const value = holding.quantity * quote.price;
    const cost = holding.avg * holding.quantity;
    const gain = value - cost;
    return {
      ...holding,
      price: quote.price,
      value,
      gain,
      returnPct: cost ? (gain / cost) * 100 : 0,
    };
  }).sort((left, right) => right.value - left.value), [baseHoldings, currentQuotes]);
  const pricedHoldingSymbols = baseHoldings
    .slice(0, quoteHoldingLimit)
    .map((holding) => holding.ticker);
  const holdingSymbols = pricedHoldingSymbols.join(",");
  const pricedHoldingSet = new Set(pricedHoldingSymbols);
  const remainingQuoteCount = Math.max(0, baseHoldings.length - pricedHoldingSymbols.length);
  const nextQuoteBatchSize = Math.min(HOLDING_QUOTE_BATCH_SIZE, remainingQuoteCount);
  const pricingConfigurationError = pricingProviders[pricingProvider].requiresApiKey && !twelveDataKey
    ? "Add a Twelve Data API key in Settings to update market prices."
    : "";
  const displayedPricingError = pricingConfigurationError || pricingError;
  const pricingStatus = [quoteStatus, historyStatus, exitStatus].filter(Boolean).join(" · ");

  useEffect(() => {
    if (isDemo || !holdingSymbols) return;
    if (pricingProviders[pricingProvider].requiresApiKey && !twelveDataKey) {
      return;
    }

    const controller = new AbortController();
    const symbols = ["SPY", ...holdingSymbols.split(",")];
    const requestOptions = {
      apiKey: pricingProvider === "twelve-data" ? twelveDataKey : undefined,
      signal: controller.signal,
    };
    const waitForCredits = async (credits: number) => {
      if (pricingProvider !== "twelve-data") return;
      await waitForTwelveDataCredits(credits, controller.signal, (milliseconds) => {
        if (controller.signal.aborted) return;
        const seconds = Math.max(1, Math.ceil(milliseconds / 1000));
        setQuoteStatus(`Current quotes queued for the next credit window (${seconds}s)`);
      });
    };

    void (async () => {
      try {
        const quotes = await getCachedCurrentQuotes(symbols, pricingProvider, {
          ...requestOptions,
          beforeRequest: waitForCredits,
        });
        if (controller.signal.aborted) return;
        setCurrentQuotes(Object.fromEntries(quotes.map((quote) => [quote.symbol, quote])));
        setQuotesLoaded(true);
        setQuoteFetchInProgress(false);
        setQuotesReadyForHistory(true);
        const pricedHoldings = quotes.filter((quote) => quote.symbol !== "SPY").length;
        const unavailable = Math.max(0, symbols.length - quotes.length);
        setQuoteStatus(
          `${pricedHoldings} of ${symbols.length - 1} priority holdings priced` +
          `${unavailable ? ` · ${unavailable} ticker${unavailable === 1 ? "" : "s"} unavailable` : ""}`,
        );
      } catch (caught) {
        if (controller.signal.aborted) return;
        setQuoteFetchInProgress(false);
        setPricingError(caught instanceof Error ? caught.message : "Market prices could not be updated.");
      }
    })();
    return () => controller.abort();
  }, [holdingSymbols, isDemo, pricingProvider, transactions, twelveDataKey]);

  useEffect(() => {
    if (!quotesReadyForHistory || isDemo || !transactions.length) return;
    if (pricingProviders[pricingProvider].requiresApiKey && !twelveDataKey) return;

    const controller = new AbortController();
    const earliestDate = transactions.reduce(
      (earliest, transaction) => transaction.date < earliest ? transaction.date : earliest,
      transactions[0].date,
    );
    const endDate = new Date().toISOString().slice(0, 10);
    const options = {
      apiKey: pricingProvider === "twelve-data" ? twelveDataKey : undefined,
      signal: controller.signal,
      beforeRequest: async (credits: number) => {
        if (pricingProvider !== "twelve-data") return;
        await waitForTwelveDataCredits(credits, controller.signal, (milliseconds) => {
          if (controller.signal.aborted) return;
          setHistoryStatus(
            `SPY history queued for the next credit window (${Math.max(1, Math.ceil(milliseconds / 1000))}s)`,
          );
        });
      },
    };

    void getCachedDailyPrices(
      "SPY",
      earliestDate,
      endDate,
      pricingProvider,
      options,
    ).then((prices) => {
      if (controller.signal.aborted) return;
      setSpyPriceCount(prices.length);
      setSpyPrices(prices);
      setHistoryStatus(`${prices.length.toLocaleString()} SPY trading days cached`);
    }).catch((caught) => {
      if (controller.signal.aborted) return;
      setPricingError(caught instanceof Error ? caught.message : "SPY history could not be updated.");
    });
    return () => controller.abort();
  }, [isDemo, pricingProvider, quotesReadyForHistory, transactions, twelveDataKey]);

  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
  const unrealized = holdings.reduce((sum, h) => sum + h.gain, 0);
  const realized = isDemo ? 3248 : rebuilt.realized;
  const invested = Math.max(0, totalValue - unrealized);
  const totalGain = unrealized + realized;
  const returnPct = invested ? (totalGain / invested) * 100 : 0;
  const top = holdings[0];
  const topAllocationHoldings = holdings.slice(0, 5);
  const otherAllocationValue = holdings
    .slice(5)
    .reduce((sum, holding) => sum + holding.value, 0);
  const allocationItems = [
    ...topAllocationHoldings.map((holding) => ({
      ticker: holding.ticker,
      value: holding.value,
      color: holding.color,
    })),
    ...(otherAllocationValue > 0
      ? [{ ticker: "Other", value: otherAllocationValue, color: "#b6b4ac" }]
      : []),
  ];
  let allocationCursor = 0;
  const allocationGradient = totalValue > 0
    ? allocationItems.map((item) => {
        const start = allocationCursor;
        allocationCursor += (item.value / totalValue) * 100;
        return `${item.color} ${start}% ${allocationCursor}%`;
      }).join(",")
    : "#d8d5cb 0% 100%";
  const largestAllocationPct = top && totalValue > 0 ? (top.value / totalValue) * 100 : 0;
  const topFiveAllocationPct = totalValue > 0
    ? (topAllocationHoldings.reduce((sum, holding) => sum + holding.value, 0) / totalValue) * 100
    : 0;
  const ratedTrades = useMemo(
    () => analyzeTrades(isDemo ? demoTransactions : transactions, {
      currentPrices: Object.fromEntries(
        Object.values(currentQuotes).map((quote) => [quote.symbol, quote.price]),
      ),
      spyDailyPrices: spyPrices,
      exitedDailyPrices,
      asOfDate: currentQuotes.SPY?.asOf.slice(0, 10),
    }),
    [currentQuotes, exitedDailyPrices, isDemo, spyPrices, transactions],
  );
  const scoredTrades = ratedTrades.filter((trade) => trade.outcomePct !== null);
  const executionScore = scoredTrades.length
    ? Math.round(scoredTrades.reduce((sum, trade) => sum + trade.score, 0) / scoredTrades.length)
    : 0;
  const closedSales = ratedTrades.filter((trade) => trade.side === "Sell" && trade.outcomePct !== null);
  const profitableSales = closedSales.filter((trade) => (trade.outcomePct || 0) > 0);
  const heldTrades = ratedTrades.filter((trade) => trade.holdingDays !== null);
  const averageHoldingDays = heldTrades.length
    ? Math.round(heldTrades.reduce((sum, trade) => sum + (trade.holdingDays || 0), 0) / heldTrades.length)
    : 0;
  const spyBenchmark = useMemo(
    () => buildSpyBenchmark(
      isDemo ? demoTransactions : transactions,
      spyPrices,
      currentQuotes.SPY?.price,
    ),
    [currentQuotes.SPY?.price, isDemo, spyPrices, transactions],
  );
  const benchmarkedBuys = ratedTrades.filter(
    (trade) => trade.side === "Buy" && trade.excessReturnPct !== null,
  );
  const heldTickerSet = new Set(baseHoldings.map((holding) => holding.ticker));
  const exitedCostByTicker = new Map<string, number>();
  ratedTrades
    .filter((trade) => trade.side === "Sell" && !heldTickerSet.has(trade.ticker))
    .forEach((trade) => {
      const matchedCost = (trade.normalizedPrice || 0) * (trade.normalizedQuantity || 0);
      exitedCostByTicker.set(
        trade.ticker,
        (exitedCostByTicker.get(trade.ticker) || 0) + matchedCost,
      );
    });
  const exitedTickerPriority = [...exitedCostByTicker.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([ticker]) => ticker);
  const selectedExitedTickers = exitedTickerPriority.slice(0, exitedTickerLimit);
  const selectedExitedTickerKey = selectedExitedTickers.join(",");
  const remainingExitedTickerCount = Math.max(
    0,
    exitedTickerPriority.length - selectedExitedTickers.length,
  );
  const nextExitedBatchSize = Math.min(
    EXITED_PRICE_BATCH_SIZE,
    remainingExitedTickerCount,
  );
  const heldPricePhaseComplete = remainingQuoteCount === 0 && !quoteFetchInProgress;
  const exitRatedSales = ratedTrades.filter(
    (trade) => trade.side === "Sell" && trade.exitEdgePct !== null,
  );
  const averageExitEdge = exitRatedSales.length
    ? exitRatedSales.reduce((sum, trade) => sum + (trade.exitEdgePct || 0), 0) / exitRatedSales.length
    : null;
  const averageMarketEdge = benchmarkedBuys.length
    ? benchmarkedBuys.reduce((sum, trade) => sum + (trade.excessReturnPct || 0), 0) / benchmarkedBuys.length
    : null;
  const marketEdgeScore = averageMarketEdge === null
    ? 50
    : Math.round(clamp(50 + averageMarketEdge * 1.2));
  const patienceScore = heldTrades.length
    ? Math.round(clamp(30 + (averageHoldingDays / 365) * 70))
    : 50;
  const buysByTicker = new Map<string, number>();
  (isDemo ? demoTransactions : transactions)
    .filter((transaction) => transaction.type === "buy")
    .forEach((transaction) => {
      buysByTicker.set(transaction.ticker, (buysByTicker.get(transaction.ticker) || 0) + 1);
    });
  const averageEntries = buysByTicker.size
    ? [...buysByTicker.values()].reduce((sum, count) => sum + count, 0) / buysByTicker.size
    : 0;
  const dcaScore = averageEntries
    ? Math.round(clamp(42 + (averageEntries - 1) * 18))
    : 50;
  const realizedEdgePct = spyBenchmark.realizedCost > 0
    ? ((spyBenchmark.actualRealizedGain - spyBenchmark.spyRealizedGain) / spyBenchmark.realizedCost) * 100
    : null;
  const realizedEdgeScore = realizedEdgePct === null
    ? 50
    : Math.round(clamp(50 + realizedEdgePct * 1.2));
  const exitTimingScore = averageExitEdge === null
    ? 50
    : Math.round(clamp(50 + averageExitEdge * 1.2));
  const scoreMetrics = [
    {
      name: "Market edge",
      score: marketEdgeScore,
      available: averageMarketEdge !== null,
      copy: averageMarketEdge === null
        ? "Waiting for current quotes and SPY history."
        : `${averageMarketEdge >= 0 ? "+" : ""}${averageMarketEdge.toFixed(1)} average percentage points versus SPY across ${benchmarkedBuys.length} buys.`,
    },
    {
      name: "Holding patience",
      score: patienceScore,
      available: heldTrades.length > 0,
      copy: averageHoldingDays
        ? `${averageHoldingDays} observed days on average across rated executions.`
        : "Not enough matched holding periods yet.",
    },
    {
      name: "DCA discipline",
      score: dcaScore,
      available: averageEntries > 0,
      copy: averageEntries
        ? `${averageEntries.toFixed(1)} entries per purchased ticker on average.`
        : "Import buy activity to measure entry discipline.",
    },
    {
      name: "Realized edge",
      score: realizedEdgeScore,
      available: realizedEdgePct !== null,
      copy: realizedEdgePct === null
        ? "No matched stock and SPY realizations are available."
        : `${realizedEdgePct >= 0 ? "+" : ""}${realizedEdgePct.toFixed(1)} points versus matched SPY sales.`,
    },
    {
      name: "Exit timing",
      score: exitTimingScore,
      available: averageExitEdge !== null,
      copy: averageExitEdge === null
        ? heldPricePhaseComplete
          ? "Fetch exited positions to evaluate what happened after each sale."
          : "Held-position prices are completed before exited positions."
        : `${averageExitEdge >= 0 ? "+" : ""}${averageExitEdge.toFixed(1)} average points avoided versus SPY after ${exitRatedSales.length} sales.`,
    },
  ];
  const metricScore = Math.round(
    scoreMetrics.reduce((sum, metric) => sum + metric.score, 0) / scoreMetrics.length,
  );
  const tradeScore = executionScore
    ? Math.round(executionScore * 0.6 + metricScore * 0.4)
    : 0;
  const availableScoreMetrics = scoreMetrics.filter((metric) => metric.available);
  const strongestMetric = availableScoreMetrics.reduce(
    (best, metric) => !best || metric.score > best.score ? metric : best,
    availableScoreMetrics[0],
  );
  const weakestMetric = availableScoreMetrics.reduce(
    (lowest, metric) => !lowest || metric.score < lowest.score ? metric : lowest,
    availableScoreMetrics[0],
  );
  const metricHeadlines: Record<string, string> = {
    "Market edge": averageMarketEdge !== null && averageMarketEdge >= 0
      ? "Your entries are creating an edge."
      : "Passive SPY is setting the pace.",
    "Holding patience": averageHoldingDays >= 180
      ? "You give positions time to work."
      : "Your holding periods run short.",
    "DCA discipline": averageEntries >= 2
      ? "You build positions in pieces."
      : "Most positions begin in one shot.",
    "Realized edge": realizedEdgePct !== null && realizedEdgePct >= 0
      ? "Your realized trades beat matched SPY."
      : "Matched SPY realized more.",
    "Exit timing": averageExitEdge !== null && averageExitEdge >= 0
      ? "Your exits avoided relative weakness."
      : "Some exits left upside behind.",
  };
  const overviewReviewTitle = tradeScore >= 80
    ? ["Strong process.", "Your data shows an edge."]
    : tradeScore >= 65
      ? ["Good instincts.", "One habit is holding you back."]
      : ["Clear lessons.", "Focus on the weakest pattern."];
  const bestTrade = scoredTrades.reduce<RatedTrade | null>(
    (best, trade) => !best || (trade.outcomePct ?? -Infinity) > (best.outcomePct ?? -Infinity) ? trade : best,
    null,
  );
  const reviewHeadline = tradeScore >= 80
    ? ["Strong process.", "Keep compounding."]
    : tradeScore >= 65
      ? ["Good instincts.", "Sharpen the exits."]
      : ["Useful lessons.", "Clear room to grow."];
  const filteredTrades = useMemo(() => {
    const query = tradeQuery.trim().toUpperCase();
    const matches = ratedTrades.filter((trade) =>
      (!query || trade.ticker.includes(query) || trade.description.toUpperCase().includes(query)) &&
      (tradeSide === "all" || trade.side.toLowerCase() === tradeSide)
    );
    return matches.sort((left, right) => {
      let comparison = 0;
      if (tradeSort === "date") comparison = left.date.localeCompare(right.date);
      if (tradeSort === "ticker") comparison = left.ticker.localeCompare(right.ticker);
      if (tradeSort === "side") comparison = left.side.localeCompare(right.side);
      if (tradeSort === "amount") comparison = left.amount - right.amount;
      if (tradeSort === "score") comparison = left.score - right.score;
      if (tradeSort === "outcome") {
        if (left.outcomePct === null) return 1;
        if (right.outcomePct === null) return -1;
        comparison = left.outcomePct - right.outcomePct;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [ratedTrades, sortDirection, tradeQuery, tradeSide, tradeSort]);
  const tradePages = Math.max(1, Math.ceil(filteredTrades.length / TRADE_PAGE_SIZE));
  const visibleTrades = filteredTrades.slice(
    (tradePage - 1) * TRADE_PAGE_SIZE,
    tradePage * TRADE_PAGE_SIZE,
  );

  useEffect(() => {
    if (
      !heldPricePhaseComplete ||
      !spyPriceCount ||
      !selectedExitedTickerKey ||
      isDemo
    ) return;
    if (pricingProviders[pricingProvider].requiresApiKey && !twelveDataKey) return;

    const controller = new AbortController();
    const tickers = selectedExitedTickerKey.split(",");
    const endDate = new Date().toISOString().slice(0, 10);
    const earliestExitByTicker = new Map<string, string>();
    transactions
      .filter((transaction) => transaction.type === "sell" && tickers.includes(transaction.ticker))
      .forEach((transaction) => {
        const existing = earliestExitByTicker.get(transaction.ticker);
        if (!existing || transaction.date < existing) {
          earliestExitByTicker.set(transaction.ticker, transaction.date);
        }
      });
    const options = {
      apiKey: pricingProvider === "twelve-data" ? twelveDataKey : undefined,
      signal: controller.signal,
      beforeRequest: async (credits: number) => {
        if (pricingProvider !== "twelve-data") return;
        await waitForTwelveDataCredits(credits, controller.signal, (milliseconds) => {
          if (controller.signal.aborted) return;
          setExitStatus(
            `Exited-position prices queued for the next credit window (${Math.max(1, Math.ceil(milliseconds / 1000))}s)`,
          );
        });
      },
    };

    void Promise.allSettled(tickers.map(async (ticker) => {
      const startDate = earliestExitByTicker.get(ticker);
      if (!startDate) return [ticker, []] as const;
      const prices = await getCachedDailyPrices(
        ticker,
        startDate,
        endDate,
        pricingProvider,
        options,
      );
      return [ticker, prices] as const;
    })).then((results) => {
      if (controller.signal.aborted) return;
      const entries = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : []
      );
      const failed = results.filter((result) => result.status === "rejected");
      if (!entries.length && failed.length) {
        const reason = failed[0].reason;
        throw reason instanceof Error ? reason : new Error("Exited-position prices could not be updated.");
      }
      setExitedDailyPrices((current) => ({
        ...current,
        ...Object.fromEntries(entries),
      }));
      setExitFetchInProgress(false);
      const available = entries.filter(([, prices]) => prices.length).length;
      const unavailable = entries.length - available;
      setExitStatus(
        `${available} of ${tickers.length} exited tickers analyzed` +
        `${unavailable ? ` · ${unavailable} unavailable` : ""}` +
        `${failed.length ? ` · ${failed.length} deferred after provider errors` : ""}`,
      );
    }).catch((caught) => {
      if (controller.signal.aborted) return;
      setExitFetchInProgress(false);
      setPricingError(caught instanceof Error ? caught.message : "Exited-position prices could not be updated.");
    });
    return () => controller.abort();
  }, [
    heldPricePhaseComplete,
    isDemo,
    pricingProvider,
    selectedExitedTickerKey,
    spyPriceCount,
    transactions,
    twelveDataKey,
  ]);

  useEffect(() => {
    if (!selectedTrade) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedTrade(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedTrade]);

  function changeTradeSort(nextSort: TradeSort) {
    setTradePage(1);
    if (tradeSort === nextSort) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
    } else {
      setTradeSort(nextSort);
      setSortDirection(nextSort === "ticker" || nextSort === "side" ? "asc" : "desc");
    }
  }

  function sortMarker(column: TradeSort) {
    if (tradeSort !== column) return "";
    return sortDirection === "asc" ? " ↑" : " ↓";
  }

  function openSettings() {
    setDraftProvider(pricingProvider);
    setDraftTwelveDataKey(twelveDataKey);
    setShowSettings(true);
  }

  function selectAccount(accountId: string) {
    if (accountId === selectedAccountId) return;
    setSelectedAccountId(accountId);
    localStorage.setItem(SELECTED_ACCOUNT_KEY, accountId);
    setCurrentQuotes({});
    setQuotesLoaded(false);
    setQuoteHoldingLimit(storedQuoteHoldingLimit(accountId));
    setExitedTickerLimit(storedExitedTickerLimit(accountId));
    setQuoteFetchInProgress(true);
    setQuotesReadyForHistory(false);
    setSpyPrices([]);
    setSpyPriceCount(0);
    setExitedDailyPrices({});
    setExitFetchInProgress(storedExitedTickerLimit(accountId) > 0);
    setPricingError("");
    setQuoteStatus("Preparing account prices…");
    setHistoryStatus("");
    setExitStatus("");
    setSelectedTrade(null);
    setTradePage(1);
  }

  function openNewAccountImport() {
    setImportMode("new");
    setAccountName("");
    setError("");
    setShowImport(true);
  }

  function savePricingSettings() {
    localStorage.setItem(PRICING_PROVIDER_KEY, draftProvider);
    if (draftTwelveDataKey.trim()) {
      localStorage.setItem(TWELVE_DATA_KEY, draftTwelveDataKey.trim());
    } else {
      localStorage.removeItem(TWELVE_DATA_KEY);
    }
    setPricingProvider(draftProvider);
    setTwelveDataKey(draftTwelveDataKey.trim());
    setCurrentQuotes({});
    setQuotesLoaded(false);
    setQuoteFetchInProgress(true);
    setQuotesReadyForHistory(false);
    setSpyPrices([]);
    setSpyPriceCount(0);
    setExitedDailyPrices({});
    setExitFetchInProgress(exitedTickerLimit > 0);
    setPricingError("");
    setQuoteStatus(`Preparing priority quotes with ${pricingProviders[draftProvider].name}…`);
    setHistoryStatus("");
    setExitStatus("");
    setShowSettings(false);
  }

  function fetchNextQuoteBatch() {
    if (!nextQuoteBatchSize || quoteFetchInProgress) return;
    setQuoteHoldingLimit((current) => {
      const next = Math.min(baseHoldings.length, current + HOLDING_QUOTE_BATCH_SIZE);
      localStorage.setItem(
        accountProgressKey(QUOTE_HOLDING_LIMIT_KEY, selectedAccountId),
        String(next),
      );
      return next;
    });
    setQuoteFetchInProgress(true);
    setPricingError("");
    setQuoteStatus(`Preparing the next ${nextQuoteBatchSize} holding quote${nextQuoteBatchSize === 1 ? "" : "s"}…`);
  }

  function fetchNextExitedBatch() {
    if (
      !nextExitedBatchSize ||
      exitFetchInProgress ||
      !heldPricePhaseComplete ||
      !spyPriceCount
    ) return;
    setExitedTickerLimit((current) => {
      const next = Math.min(
        exitedTickerPriority.length,
        current + EXITED_PRICE_BATCH_SIZE,
      );
      localStorage.setItem(
        accountProgressKey(EXITED_TICKER_LIMIT_KEY, selectedAccountId),
        String(next),
      );
      return next;
    });
    setExitFetchInProgress(true);
    setPricingError("");
    setExitStatus(
      `Preparing ${nextExitedBatchSize} exited-position price${nextExitedBatchSize === 1 ? "" : "s"}…`,
    );
  }

  async function handleFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a .csv export from Robinhood."); return;
    }
    setImporting(true); setError("");
    try {
      const parsed = parseRobinhoodCsv(await file.text());
      if (!parsed.length) throw new Error("No supported transactions were found.");
      let nextAccounts: PortfolioAccount[];
      let nextAccountId: string;
      if (importMode === "replace" && selectedAccount) {
        nextAccountId = selectedAccount.id;
        nextAccounts = accounts.map((account) => account.id === selectedAccount.id
          ? { ...account, transactions: parsed, updatedAt: new Date().toISOString() }
          : account
        );
      } else {
        const fallbackName = file.name.replace(/\.csv$/i, "").trim() || "Robinhood account";
        const created = createPortfolioAccount(accountName || fallbackName, parsed);
        nextAccountId = created.id;
        nextAccounts = [...accounts, created];
      }
      await savePortfolioAccounts(nextAccounts);
      setAccounts(nextAccounts);
      setSelectedAccountId(nextAccountId);
      localStorage.setItem(SELECTED_ACCOUNT_KEY, nextAccountId);
      setCurrentQuotes({});
      setQuotesLoaded(false);
      setQuoteHoldingLimit(INITIAL_HOLDING_QUOTE_COUNT);
      localStorage.setItem(
        accountProgressKey(QUOTE_HOLDING_LIMIT_KEY, nextAccountId),
        String(INITIAL_HOLDING_QUOTE_COUNT),
      );
      setQuoteFetchInProgress(true);
      setQuotesReadyForHistory(false);
      setSpyPrices([]);
      setSpyPriceCount(0);
      setExitedTickerLimit(0);
      localStorage.setItem(accountProgressKey(EXITED_TICKER_LIMIT_KEY, nextAccountId), "0");
      setExitedDailyPrices({});
      setExitFetchInProgress(false);
      setPricingError("");
      setQuoteStatus("Preparing priority quotes…");
      setHistoryStatus("");
      setExitStatus("");
      setSelectedTrade(null);
      setTradePage(1);
      const displayName = nextAccounts.find((account) => account.id === nextAccountId)?.name;
      setNotice(`${displayName} saved with ${parsed.length.toLocaleString()} private transactions.`);
      setShowImport(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t read this file.");
    } finally { setImporting(false); }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    void handleFile(event.dataTransfer.files[0]);
  }

  async function deleteSelectedAccount() {
    if (!selectedAccount) return;
    if (!window.confirm(`Delete ${selectedAccount.name} and its imported transactions from this device?`)) return;
    const nextAccounts = accounts.filter((account) => account.id !== selectedAccount.id);
    await savePortfolioAccounts(nextAccounts);
    localStorage.removeItem(accountProgressKey(QUOTE_HOLDING_LIMIT_KEY, selectedAccount.id));
    localStorage.removeItem(accountProgressKey(EXITED_TICKER_LIMIT_KEY, selectedAccount.id));
    setAccounts(nextAccounts);
    setShowSettings(false);
    if (nextAccounts.length) {
      selectAccount(nextAccounts[0].id);
      setNotice(`${selectedAccount.name} was deleted. Market-price caches remain reusable.`);
    } else {
      setSelectedAccountId("");
      localStorage.removeItem(SELECTED_ACCOUNT_KEY);
      setCurrentQuotes({});
      setSpyPrices([]);
      setSpyPriceCount(0);
      setExitedDailyPrices({});
      setQuoteFetchInProgress(false);
      setExitFetchInProgress(false);
      setQuoteStatus("");
      setHistoryStatus("");
      setExitStatus("");
      setNotice("The account was deleted. Add a CSV to begin again.");
    }
  }

  async function deleteAllSystemData() {
    if (!window.confirm("Delete every account, transaction, market-price cache, API key, and setting stored by TradeReviewerPro on this device?")) return;
    await deleteLocalDatabase();
    Object.keys(localStorage)
      .filter((key) => key.startsWith("trade-reviewer-pro:"))
      .forEach((key) => localStorage.removeItem(key));
    setAccounts([]);
    setSelectedAccountId("");
    setCurrentQuotes({});
    setSpyPrices([]);
    setSpyPriceCount(0);
    setExitedDailyPrices({});
    setQuoteHoldingLimit(INITIAL_HOLDING_QUOTE_COUNT);
    setExitedTickerLimit(0);
    setQuoteFetchInProgress(false);
    setExitFetchInProgress(false);
    setQuotesReadyForHistory(false);
    setPricingProvider(DEFAULT_PRICING_PROVIDER);
    setDraftProvider(DEFAULT_PRICING_PROVIDER);
    setTwelveDataKey("");
    setDraftTwelveDataKey("");
    setQuoteStatus("");
    setHistoryStatus("");
    setExitStatus("");
    setPricingError("");
    setSelectedTrade(null);
    setShowSettings(false);
    setNotice("All TradeReviewerPro data was deleted from this device.");
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#" aria-label="TradeReviewerPro home">
          <span className="brand-mark">tr</span>
          <span>TradeReviewer<span>Pro</span></span>
        </a>
        <nav aria-label="Primary">
          {(["overview", "review", "holdings"] as const).map((item) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
              {item === "review" ? "Trade review" : item}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          {accounts.length > 0 && (
            <select
              className="account-selector"
              value={selectedAccountId}
              onChange={(event) => selectAccount(event.target.value)}
              aria-label="Select brokerage account"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          )}
          <button className="settings-button" onClick={openSettings} aria-label="Settings">⚙</button>
          <button className="import-button" onClick={openNewAccountImport}>
            <span>＋</span> Add account
          </button>
        </div>
      </header>

      <section className="shell">
        <div className="eyebrow-row">
          <p><span className="live-dot" /> {isDemo ? "DEMO PORTFOLIO" : selectedAccount?.name.toUpperCase()}</p>
          <p className="as-of">
            {currentQuotes.SPY ? `PRICES AS OF ${friendlyDate(currentQuotes.SPY.asOf.slice(0, 10)).toUpperCase()}` : "MARKET DATA READY"} · <span>TRADES STAY ON THIS DEVICE</span>
          </p>
        </div>

        {notice && <button className="notice" onClick={() => setNotice("")}>{notice}<span>×</span></button>}
        {!isDemo && (pricingStatus || displayedPricingError || remainingQuoteCount > 0 || remainingExitedTickerCount > 0) && (
          <div className={`pricing-notice ${displayedPricingError ? "error-state" : ""}`}>
            <span>{displayedPricingError ? "!" : "↻"}</span>
            <strong>{displayedPricingError || pricingStatus || `${Object.keys(currentQuotes).length} quotes cached`}</strong>
            <div className="pricing-actions">
              {displayedPricingError && <button onClick={openSettings}>Open settings</button>}
              {remainingQuoteCount > 0 && !pricingConfigurationError && (
                <button onClick={fetchNextQuoteBatch} disabled={quoteFetchInProgress}>
                  {quoteFetchInProgress ? "Fetching…" : `Fetch next ${nextQuoteBatchSize}`}
                </button>
              )}
              {heldPricePhaseComplete && remainingExitedTickerCount > 0 && !pricingConfigurationError && (
                <button
                  onClick={fetchNextExitedBatch}
                  disabled={exitFetchInProgress || !spyPriceCount}
                >
                  {!spyPriceCount
                    ? "Waiting for SPY…"
                    : exitFetchInProgress
                      ? "Fetching exits…"
                      : `Fetch exited ${nextExitedBatchSize}`}
                </button>
              )}
            </div>
          </div>
        )}

        {tab === "overview" && (
          <>
            <section className="hero">
              <div>
                <p className="label">TOTAL PORTFOLIO VALUE</p>
                <h1>{money(totalValue, 2)}</h1>
                <div className={`gain-line ${totalGain < 0 ? "loss" : ""}`}>
                  <span>{totalGain >= 0 ? "↗" : "↘"}</span>
                  <strong>{totalGain >= 0 ? "+" : ""}{money(totalGain, 2)}</strong>
                  <em>{returnPct >= 0 ? "+" : ""}{returnPct.toFixed(1)}%</em>
                  <small>all time</small>
                </div>
              </div>
              <div className="hero-review">
                <span className="score">{tradeScore || 82}</span>
                <div>
                  <p className="label">TRADEREVIEWER SCORE</p>
                  <strong>{tradeScore >= 75 ? "Strong investor" : tradeScore >= 58 ? "Developing investor" : "Review your process"}</strong>
                  <p>{spyPriceCount ? "Now includes your edge versus lazy SPY investing." : "Market comparison will appear after pricing loads."}</p>
                </div>
              </div>
            </section>

            <section className="summary-grid">
              <article>
                <p className="label">NET INVESTED</p><strong>{money(invested)}</strong>
                <small>Across {isDemo ? 83 : transactions.filter((t) => t.type === "buy").length} purchases</small>
              </article>
              <article>
                <p className="label">UNREALIZED GAIN</p><strong className={unrealized >= 0 ? "positive" : "negative"}>{unrealized >= 0 ? "+" : ""}{money(unrealized)}</strong>
                <small>{totalGain ? Math.round((unrealized / totalGain) * 100) : 0}% of your total gains</small>
              </article>
              <article>
                <p className="label">REALIZED GAIN</p><strong className={realized >= 0 ? "positive" : "negative"}>{realized >= 0 ? "+" : ""}{money(realized)}</strong>
                <small>From closed positions & income</small>
              </article>
              <article>
                <p className="label">ACTIVE HOLDINGS</p><strong>{holdings.length}</strong>
                <small>{top ? `${top.ticker} is your largest` : "Import trades to begin"}</small>
              </article>
            </section>

            <section className="dashboard-grid">
              <article className="panel performance">
                <div className="panel-head">
                  <div><p className="kicker">THE HEADLINE</p><h2>{isDemo ? "You beat the market." : spyBenchmark.spyOpenValue === null ? "Building your SPY comparison." : totalValue >= spyBenchmark.spyOpenValue ? "You beat lazy SPY." : "Lazy SPY is ahead."}</h2></div>
                  <div className="range"><button>1Y</button><button className="selected">ALL</button></div>
                </div>
                {isDemo ? (
                  <>
                    <p className="panel-copy">Your timing-aware return is <strong>{Math.max(returnPct, 18.4).toFixed(1)}%</strong>, versus <strong>11.8%</strong> for the same cash flows invested in SPY.</p>
                    <div className="chart">
                      <div className="grid-lines"><i /><i /><i /><i /></div>
                      <Sparkline points={demoCurve} />
                      <Sparkline points={spyCurve} muted />
                    </div>
                    <div className="legend"><span><i className="green" /> Your portfolio <strong>+{Math.max(returnPct, 18.4).toFixed(1)}%</strong></span><span><i /> SPY equivalent <strong>+11.8%</strong></span></div>
                  </>
                ) : (
                  <>
                    <p className="panel-copy">This compares your current holdings with the unsold fractional SPY lots created by the same buy and sell history.</p>
                    <div className="value-comparison">
                      <article>
                        <div><span>Your holdings</span><strong>{money(totalValue, 2)}</strong></div>
                        <i><b style={{ width: `${spyBenchmark.spyOpenValue ? Math.min(100, (totalValue / Math.max(totalValue, spyBenchmark.spyOpenValue)) * 100) : 0}%` }} /></i>
                      </article>
                      <article>
                        <div><span>Lazy SPY holdings</span><strong>{spyBenchmark.spyOpenValue === null ? "Waiting…" : money(spyBenchmark.spyOpenValue, 2)}</strong></div>
                        <i><b className="spy" style={{ width: `${spyBenchmark.spyOpenValue ? Math.min(100, (spyBenchmark.spyOpenValue / Math.max(totalValue, spyBenchmark.spyOpenValue)) * 100) : 0}%` }} /></i>
                      </article>
                    </div>
                    {spyBenchmark.spyOpenValue !== null && <p className={`comparison-callout ${totalValue >= spyBenchmark.spyOpenValue ? "positive" : "negative"}`}>{totalValue - spyBenchmark.spyOpenValue >= 0 ? "+" : ""}{money(totalValue - spyBenchmark.spyOpenValue, 2)} versus the lazy portfolio</p>}
                  </>
                )}
              </article>

              <article className="panel allocation">
                <div className="panel-head"><div><p className="kicker">WHERE YOU ARE NOW</p><h2>Allocation</h2></div><button className="arrow" onClick={() => setTab("holdings")}>↗</button></div>
                <p className="allocation-summary">{top ? `${top.ticker} is ${largestAllocationPct.toFixed(1)}% of this account. The five largest positions represent ${topFiveAllocationPct.toFixed(1)}%.` : "Add an account to see position concentration."}</p>
                <div className="donut-wrap">
                  <div className="donut" style={{ background: `conic-gradient(${allocationGradient})` }} role="img" aria-label={`${holdings.length} positions. Largest position ${top?.ticker || "none"} at ${largestAllocationPct.toFixed(1)} percent.`}>
                    <div><strong>{largestAllocationPct.toFixed(0)}%</strong><span>{top ? `${top.ticker} WEIGHT` : "NO POSITIONS"}</span></div>
                  </div>
                  <ol>
                    {allocationItems.map((item) => (
                      <li key={item.ticker}><i style={{ background: item.color }} /><strong>{item.ticker}</strong><span>{((item.value / Math.max(totalValue, 1)) * 100).toFixed(1)}%</span></li>
                    ))}
                  </ol>
                </div>
              </article>
            </section>

            <section className="insight-strip">
              <div>
                <p className="kicker">{selectedAccount ? `${selectedAccount.name.toUpperCase()} · REVIEW IN BRIEF` : "YOUR REVIEW, IN BRIEF"}</p>
                <h2>{overviewReviewTitle[0]}<br /><em>{overviewReviewTitle[1]}</em></h2>
                <p className="review-brief-copy">{strongestMetric && weakestMetric ? `${strongestMetric.name} leads at ${strongestMetric.score}; ${weakestMetric.name.toLowerCase()} is the clearest opportunity at ${weakestMetric.score}.` : "Import transactions and market data to identify the account’s strongest and weakest habits."}</p>
                <button onClick={() => setTab("review")}>Read full trade review <span>→</span></button>
              </div>
              <article>
                <div className="insight-card-top"><span className="insight-icon">⌁</span><strong>{strongestMetric?.score || "—"}</strong></div>
                <p className="label">YOUR EDGE · {strongestMetric?.name || "WAITING"}</p>
                <h3>{strongestMetric ? metricHeadlines[strongestMetric.name] : "More data will reveal your edge."}</h3>
                <p>{strongestMetric?.copy || "Complete pricing to compare account decisions with passive SPY."}</p>
              </article>
              <article>
                <div className="insight-card-top"><span className="insight-icon warm">↘</span><strong>{weakestMetric?.score || "—"}</strong></div>
                <p className="label">WATCH NEXT · {weakestMetric?.name || "WAITING"}</p>
                <h3>{weakestMetric ? metricHeadlines[weakestMetric.name] : "Your blind spot needs more evidence."}</h3>
                <p>{weakestMetric?.copy || "As more held and exited prices arrive, this account’s next improvement will become clearer."}</p>
              </article>
            </section>
          </>
        )}

        {tab === "review" && (
          <section className="review-page">
            <p className="kicker">YOUR INVESTING CAREER REVIEW</p>
            <div className="review-title">
              <h1>{reviewHeadline[0]}<br /><em>{reviewHeadline[1]}</em></h1>
              <div className="big-score">
                <span>{tradeScore || "—"}</span>
                <p>OUT OF 100<br /><strong>{tradeScore >= 75 ? "STRONG" : tradeScore >= 58 ? "DEVELOPING" : "REVIEW"}</strong></p>
              </div>
            </div>

            {!isDemo && (
              <section className="benchmark-overview" aria-labelledby="benchmark-overview-title">
                <div className="benchmark-overview-head">
                  <div>
                    <p className="kicker">THE LAZY PORTFOLIO</p>
                    <h2 id="benchmark-overview-title">Your decisions versus simply owning SPY.</h2>
                  </div>
                  <span>{spyBenchmark.coveragePct.toFixed(0)}% CASH-FLOW COVERAGE</span>
                </div>
                <div className="benchmark-overview-grid">
                  <article>
                    <p className="label">OPEN HOLDINGS TODAY</p>
                    <div><span>YOUR HOLDINGS</span><strong>{money(totalValue, 2)}</strong></div>
                    <div><span>LAZY SPY HOLDINGS</span><strong>{spyBenchmark.spyOpenValue === null ? "—" : money(spyBenchmark.spyOpenValue, 2)}</strong></div>
                    {spyBenchmark.spyOpenValue !== null && (
                      <p className={totalValue >= spyBenchmark.spyOpenValue ? "positive" : "negative"}>
                        {totalValue - spyBenchmark.spyOpenValue >= 0 ? "+" : ""}{money(totalValue - spyBenchmark.spyOpenValue, 2)} versus SPY
                      </p>
                    )}
                  </article>
                  <article>
                    <p className="label">REALIZED TRADING P/L</p>
                    <div><span>YOUR REALIZED P/L</span><strong className={spyBenchmark.actualRealizedGain >= 0 ? "positive" : "negative"}>{spyBenchmark.actualRealizedGain >= 0 ? "+" : ""}{money(spyBenchmark.actualRealizedGain, 2)}</strong></div>
                    <div><span>SPY REALIZED P/L</span><strong className={spyBenchmark.spyRealizedGain >= 0 ? "positive" : "negative"}>{spyBenchmark.spyRealizedGain >= 0 ? "+" : ""}{money(spyBenchmark.spyRealizedGain, 2)}</strong></div>
                    {spyBenchmark.realizedCost > 0 && (
                      <p className={spyBenchmark.actualRealizedGain >= spyBenchmark.spyRealizedGain ? "positive" : "negative"}>
                        {spyBenchmark.actualRealizedGain - spyBenchmark.spyRealizedGain >= 0 ? "+" : ""}{money(spyBenchmark.actualRealizedGain - spyBenchmark.spyRealizedGain, 2)} realized edge
                      </p>
                    )}
                  </article>
                  <article className="benchmark-method">
                    <p className="label">MATCHED CASH FLOWS</p>
                    <strong>{spyBenchmark.spyOpenShares.toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong>
                    <span>hypothetical SPY shares still held</span>
                    <dl>
                      <div><dt>Open matched cost</dt><dd>{money(spyBenchmark.openCost, 2)}</dd></div>
                      <div><dt>Realized matched cost</dt><dd>{money(spyBenchmark.realizedCost, 2)}</dd></div>
                    </dl>
                  </article>
                </div>
                <p className="benchmark-footnote">Each buy creates a same-dollar fractional SPY lot. Each stock sale liquidates the proportional SPY lot on that date. Holdings not fetched yet use their latest imported price, while SPY uses adjusted daily history.</p>
              </section>
            )}

            <div className="score-grid">
              {scoreMetrics.map(({ name, score, copy }) => (
                <article key={name}><div><p className="label">{name}</p><strong>{score}</strong></div><div className="meter"><i style={{ width: `${score}%` }} /></div><p>{copy}</p></article>
              ))}
            </div>
            <p className="score-method-note">Overall score: 60% average execution rating and 40% equal-weighted market edge, patience, DCA discipline, realized edge, and exit timing.</p>

            <section className="insight-charts" aria-labelledby="insight-charts-title">
              <div className="insight-charts-heading">
                <div>
                  <p className="kicker">PATTERNS IN YOUR DECISIONS</p>
                  <h2 id="insight-charts-title">Your trading history, drawn out.</h2>
                </div>
                <p>Bubble size represents dollars committed. Positive SPY-relative values indicate an advantage over passive investing.</p>
              </div>
              <div className="insight-chart-grid">
                <article className="insight-chart-card decision-chart-card">
                  <div><p className="label">BUY DECISION MAP</p><h3>Where your entries created an edge</h3></div>
                  <DecisionMap trades={ratedTrades} />
                </article>
                <article className="insight-chart-card exit-chart-card">
                  <div><p className="label">EXIT TIMING</p><h3>Falling knives avoided—and upside missed</h3></div>
                  <ExitTimingChart trades={ratedTrades} />
                </article>
                <article className="insight-chart-card distribution-chart-card">
                  <div><p className="label">OUTCOME DISTRIBUTION</p><h3>How often your trades landed in each return range</h3></div>
                  <OutcomeDistribution trades={ratedTrades} />
                </article>
              </div>
            </section>

            <div className="review-metrics">
              <article><p className="label">BEST-RATED EXECUTION</p><h2>{bestTrade?.ticker || "—"}</h2><strong className="positive">{percent(bestTrade?.outcomePct ?? null)} · {bestTrade?.grade || "—"}</strong><p>{bestTrade ? `${bestTrade.side} on ${friendlyDate(bestTrade.date)}.` : "Import trades to calculate ratings."}</p></article>
              <article><p className="label">PROFITABLE SALES</p><h2>{closedSales.length ? `${Math.round((profitableSales.length / closedSales.length) * 100)}%` : "—"}</h2><strong>{profitableSales.length} of {closedSales.length} rated exits</strong><p>Based on matched cost basis contained in the export.</p></article>
              <article><p className="label">AVG. OBSERVED HOLD</p><h2>{averageHoldingDays ? `${averageHoldingDays} days` : "—"}</h2><strong>Across {heldTrades.length} rated executions</strong><p>Open trades are measured through the latest activity date.</p></article>
            </div>

            <section className="trade-ledger" aria-labelledby="trade-ledger-title">
              <div className="trade-ledger-heading">
                <div>
                  <p className="kicker">DECISION-BY-DECISION</p>
                  <h2 id="trade-ledger-title">Every trade, reviewed.</h2>
                  <p>{ratedTrades.length.toLocaleString()} stock executions scored from the evidence available in this export.</p>
                </div>
                <div className="trade-method">
                  <span>{spyPriceCount ? "MARKET-AWARE" : "LOCAL HEURISTIC"}</span>
                  <p>{spyPriceCount ? "Current quotes + same-dollar SPY benchmark" : "Waiting for cached market data"}</p>
                </div>
              </div>

              <div className="trade-controls">
                <label className="trade-search">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    placeholder="Search ticker or company"
                    value={tradeQuery}
                    onChange={(event) => {
                      setTradeQuery(event.target.value);
                      setTradePage(1);
                    }}
                    aria-label="Search trades"
                  />
                </label>
                <div className="side-filter" aria-label="Filter by trade side">
                  {(["all", "buy", "sell"] as const).map((side) => (
                    <button
                      key={side}
                      className={tradeSide === side ? "selected" : ""}
                      onClick={() => {
                        setTradeSide(side);
                        setTradePage(1);
                      }}
                    >
                      {side}
                    </button>
                  ))}
                </div>
                <label className="mobile-sort">
                  <span>Sort</span>
                  <select value={tradeSort} onChange={(event) => {
                    setTradeSort(event.target.value as TradeSort);
                    setTradePage(1);
                  }}>
                    <option value="date">Date</option>
                    <option value="ticker">Ticker</option>
                    <option value="amount">Size</option>
                    <option value="outcome">Outcome</option>
                    <option value="score">Rating</option>
                  </select>
                </label>
              </div>

              <div className="trade-table">
                <div className="trade-table-head">
                  <button onClick={() => changeTradeSort("date")}>Date{sortMarker("date")}</button>
                  <button onClick={() => changeTradeSort("ticker")}>Trade{sortMarker("ticker")}</button>
                  <button className="trade-qty" onClick={() => changeTradeSort("side")}>Side / shares{sortMarker("side")}</button>
                  <button className="trade-amount" onClick={() => changeTradeSort("amount")}>Position size{sortMarker("amount")}</button>
                  <button className="trade-outcome" onClick={() => changeTradeSort("outcome")}>Observed outcome{sortMarker("outcome")}</button>
                  <button onClick={() => changeTradeSort("score")}>Rating{sortMarker("score")}</button>
                </div>
                {visibleTrades.map((trade) => (
                  <button className="trade-row" key={trade.id} onClick={() => setSelectedTrade(trade)}>
                    <span className="trade-date">{friendlyDate(trade.date)}</span>
                    <span className="trade-symbol">
                      <i>{trade.ticker.slice(0, 1)}</i>
                      <b>{trade.ticker}<small>{trade.status}</small></b>
                    </span>
                    <span className="trade-qty"><b className={`side-pill ${trade.side.toLowerCase()}`}>{trade.side}</b><small>{trade.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares</small></span>
                    <span className="trade-amount"><b>{money(trade.amount, 2)}</b><small>@ {money(trade.price, 2)}</small></span>
                    <span className={`trade-outcome ${trade.outcomePct !== null && trade.outcomePct >= 0 ? "positive" : trade.outcomePct === null ? "" : "negative"}`}>
                      <b>{percent(trade.outcomePct)}</b>
                      <small>{trade.holdingDays === null ? trade.referenceLabel : `${trade.holdingDays} day${trade.holdingDays === 1 ? "" : "s"} observed`}</small>
                      {trade.excessReturnPct !== null && (
                        <small className={`spy-edge ${trade.excessReturnPct >= 0 ? "positive" : "negative"}`}>
                          {trade.excessReturnPct >= 0 ? "+" : ""}{trade.excessReturnPct.toFixed(1)} pts vs SPY
                        </small>
                      )}
                      {trade.exitEdgePct !== null && (
                        <small className={`spy-edge ${trade.exitEdgePct >= 0 ? "positive" : "negative"}`}>
                          {trade.exitEdgePct >= 0 ? "+" : ""}{trade.exitEdgePct.toFixed(1)} pts after exit
                        </small>
                      )}
                    </span>
                    <span className="trade-rating"><b className={`rating-badge ${scoreTone(trade.score)}`}>{trade.grade}</b><small>{trade.verdict}</small><i aria-hidden="true">›</i></span>
                  </button>
                ))}
                {!visibleTrades.length && (
                  <div className="trade-empty">
                    <strong>No matching trades</strong>
                    <p>Try another ticker or clear the current side filter.</p>
                  </div>
                )}
              </div>

              <div className="trade-pagination">
                <p>
                  Showing {filteredTrades.length ? (tradePage - 1) * TRADE_PAGE_SIZE + 1 : 0}–{Math.min(tradePage * TRADE_PAGE_SIZE, filteredTrades.length)} of {filteredTrades.length.toLocaleString()}
                </p>
                <div>
                  <button disabled={tradePage === 1} onClick={() => setTradePage((page) => Math.max(1, page - 1))}>← Previous</button>
                  <span>Page {tradePage} of {tradePages}</span>
                  <button disabled={tradePage === tradePages} onClick={() => setTradePage((page) => Math.min(tradePages, page + 1))}>Next →</button>
                </div>
              </div>
              <p className="rating-disclaimer">Ratings are educational heuristics, not investment advice. Priority open positions use current provider quotes when available; other positions retain the latest trade price from the import. SPY comparisons use adjusted daily history and fractional shares.</p>
            </section>
          </section>
        )}

        {tab === "holdings" && (
          <section className="holdings-page">
            <div className="page-title"><div><p className="kicker">CURRENT PORTFOLIO</p><h1>Your holdings</h1></div><p>{holdings.length} active positions · {money(totalValue, 2)} total value</p></div>
            <div className="holdings-table">
              <div className="table-row table-head"><span>Company</span><span>Shares</span><span>Avg. cost</span><span>Market value</span><span>Total return</span></div>
              {holdings.map((holding) => (
                <div className="table-row" key={holding.ticker}>
                  <span className="company"><i>{holding.ticker.slice(0, 1)}</i><b>{holding.name}<small>{holding.ticker}</small></b></span>
                  <span>{holding.quantity.toFixed(holding.quantity % 1 ? 3 : 0)}</span><span>{money(holding.avg, 2)}</span>
                  <span>
                    <b>{money(holding.value, 2)}</b>
                    {currentQuotes[holding.ticker]
                      ? <small className="price-source live">Current · {money(currentQuotes[holding.ticker].price, 2)}</small>
                      : pricedHoldingSet.has(holding.ticker)
                        ? <small className="price-source queued">{quotesLoaded ? "Current quote unavailable" : "Awaiting current quote"}</small>
                        : <small className="price-source imported">Import price · not fetched yet</small>}
                  </span>
                  <span className={holding.gain >= 0 ? "positive" : "negative"}><b>{holding.gain >= 0 ? "+" : ""}{money(holding.gain, 2)}</b><small>{holding.returnPct >= 0 ? "+" : ""}{holding.returnPct.toFixed(1)}%</small></span>
                </div>
              ))}
              {!holdings.length && <div className="empty">No open positions were found in this export.</div>}
            </div>
            {!isDemo && <p className="price-note">The first credit window covers SPY and your seven largest estimated holdings. Use “Fetch next” to price up to eight more positions per available window; progress is retained in this browser. Unfetched positions keep their latest imported price and remain clearly marked. Only ticker symbols and the SPY date range leave this browser; quantities and transactions stay local.{spyPriceCount ? ` ${spyPriceCount.toLocaleString()} SPY daily prices are cached on this device.` : ""}</p>}
          </section>
        )}
      </section>

      <footer><span>TradeReviewerPro</span><p>Private by design. Your trading data never leaves your browser.</p><span>Not investment advice.</span></footer>

      {showImport && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowImport(false)}>
          <section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setShowImport(false)} aria-label="Close">×</button>
            <p className="kicker">PRIVATE ACCOUNT IMPORT</p>
            <h2 id="import-title">{importMode === "new" ? "Add a Robinhood account." : `Update ${selectedAccount?.name}.`}</h2>
            <p>Each CSV belongs to one local account. Switch accounts anytime to review performance independently.</p>
            <div className="import-mode" aria-label="Import mode">
              <button className={importMode === "new" ? "selected" : ""} onClick={() => setImportMode("new")}>New account</button>
              <button className={importMode === "replace" ? "selected" : ""} disabled={!selectedAccount} onClick={() => setImportMode("replace")}>Replace selected</button>
            </div>
            {importMode === "new" && (
              <label className="account-name-field">
                <span>ACCOUNT NAME</span>
                <input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Main, Managed, Roth IRA…" />
              </label>
            )}
            <label className="drop-zone" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
              <input type="file" accept=".csv,text/csv" onChange={(e: ChangeEvent<HTMLInputElement>) => void handleFile(e.target.files?.[0])} />
              <span className="upload-icon">↑</span>
              <strong>{importing ? "Reading your trades…" : "Drop your Robinhood CSV here"}</strong>
              <small>or click to choose a file · CSV only</small>
            </label>
            {error && <p className="error">{error}</p>}
            <div className="privacy-row"><span>◉</span><div><strong>Stays on your device</strong><p>Stored only in your browser so you can return later.</p></div></div>
          </section>
        </div>
      )}

      {showSettings && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowSettings(false)}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="close" onClick={() => setShowSettings(false)} aria-label="Close settings">×</button>
            <p className="kicker">MARKET DATA</p>
            <h2 id="settings-title">Pricing settings</h2>
            <p>Choose the engine used for current holding quotes and daily SPY history.</p>

            <fieldset className="provider-options">
              <legend>PRICE ENGINE</legend>
              {(Object.values(pricingProviders)).map((provider) => {
                const browserBlocked = provider.id === "yahoo";
                return (
                <label key={provider.id} className={`${draftProvider === provider.id ? "selected" : ""} ${browserBlocked ? "disabled" : ""}`}>
                  <input
                    type="radio"
                    name="pricing-provider"
                    value={provider.id}
                    checked={draftProvider === provider.id}
                    disabled={browserBlocked}
                    onChange={() => setDraftProvider(provider.id)}
                  />
                  <span><strong>{provider.name}</strong><small>{browserBlocked ? "Unavailable in-browser · CORS blocked" : "Default · official API · your own key"}</small></span>
                  <i>{draftProvider === provider.id ? "✓" : ""}</i>
                </label>
              )})}
            </fieldset>

            {draftProvider === "twelve-data" && (
              <label className="api-key-field">
                <span>TWELVE DATA API KEY</span>
                <input
                  type="password"
                  value={draftTwelveDataKey}
                  onChange={(event) => setDraftTwelveDataKey(event.target.value)}
                  placeholder="Paste your API key"
                  autoComplete="off"
                />
                <small>Saved only in this browser. It is sent only to Twelve Data.</small>
              </label>
            )}

            <div className="settings-privacy">
              <span>◉</span>
              <p><strong>Eight-credit-aware</strong><br />Held positions are always priced first. SPY history follows, and exited-position batches remain locked until held-stock coverage is complete.</p>
            </div>
            <button
              className="save-settings"
              onClick={savePricingSettings}
              disabled={draftProvider === "twelve-data" && !draftTwelveDataKey.trim()}
            >
              Save pricing settings
            </button>
            <div className="danger-zone">
              <p className="label">LOCAL DATA</p>
              <p>Delete an account without affecting the others, or erase every account, cache, key, and setting stored by this app.</p>
              <div>
                <button disabled={!selectedAccount} onClick={() => void deleteSelectedAccount()}>Delete selected account</button>
                <button className="danger" onClick={() => void deleteAllSystemData()}>Delete all local data</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {selectedTrade && (
        <div className="trade-detail-backdrop" role="presentation" onMouseDown={() => setSelectedTrade(null)}>
          <section className="trade-detail" role="dialog" aria-modal="true" aria-labelledby="trade-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="trade-detail-close" onClick={() => setSelectedTrade(null)} aria-label="Close trade details">×</button>
            <div className="trade-detail-top">
              <div>
                <button className="back-to-ledger" onClick={() => setSelectedTrade(null)}>← Back to trade review</button>
                <p className="kicker">{selectedTrade.side.toUpperCase()} EXECUTION · {friendlyDate(selectedTrade.date).toUpperCase()}</p>
                <h2 id="trade-detail-title">{selectedTrade.ticker} <em>trade review</em></h2>
                <p>{selectedTrade.description.split("\n")[0] || selectedTrade.ticker}</p>
              </div>
              <div className={`detail-grade ${scoreTone(selectedTrade.score)}`}>
                <span>{selectedTrade.grade}</span>
                <p>{selectedTrade.score}/100<br /><strong>{selectedTrade.verdict}</strong></p>
              </div>
            </div>

            <div className="detail-summary">
              <p className="label">THE READ</p>
              <h3>{selectedTrade.summary}</h3>
              <div className="confidence"><i /> {selectedTrade.confidence} confidence · {selectedTrade.spyValue !== null ? "uploaded activity + cached market data" : "based only on uploaded activity"}</div>
            </div>

            <div className="detail-metrics">
              <article>
                <p className="label">EXECUTION PRICE</p>
                <strong>{money(selectedTrade.price, 2)}</strong>
                <small>{selectedTrade.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares · {money(selectedTrade.amount, 2)}</small>
                {selectedTrade.side === "Buy" && selectedTrade.normalizedPrice !== null && Math.abs(selectedTrade.normalizedPrice - selectedTrade.price) > 0.01 && (
                  <small className="split-normalized">Current equivalent: {selectedTrade.normalizedQuantity?.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares @ {money(selectedTrade.normalizedPrice, 2)}</small>
                )}
              </article>
              <article><p className="label">{selectedTrade.referenceLabel}</p><strong>{selectedTrade.referencePrice === null ? "—" : money(selectedTrade.referencePrice, 2)}</strong><small>{selectedTrade.status}</small></article>
              <article><p className="label">OBSERVED OUTCOME</p><strong className={selectedTrade.outcomePct === null ? "" : selectedTrade.outcomePct >= 0 ? "positive" : "negative"}>{percent(selectedTrade.outcomePct)}</strong><small>{selectedTrade.holdingDays === null ? "Holding period unavailable" : `${selectedTrade.holdingDays} observed days`}</small></article>
            </div>

            {selectedTrade.spyValue !== null && selectedTrade.spyEntryPrice !== null && (
              <section className="lazy-benchmark" aria-label="Lazy investor SPY comparison">
                <div className="lazy-benchmark-head">
                  <div><p className="kicker">THE LAZY INVESTOR TEST</p><h3>What if this money simply went into SPY?</h3></div>
                  <span className={selectedTrade.excessReturnPct !== null && selectedTrade.excessReturnPct >= 0 ? "positive" : "negative"}>
                    {selectedTrade.excessReturnPct === null ? "—" : `${selectedTrade.excessReturnPct >= 0 ? "+" : ""}${selectedTrade.excessReturnPct.toFixed(1)} pts`}
                  </span>
                </div>
                <div className="lazy-benchmark-grid">
                  <article>
                    <p className="label">ORIGINAL INVESTMENT</p>
                    <strong>{money(selectedTrade.amount, 2)}</strong>
                    <small>{selectedTrade.spyShares?.toFixed(4)} fractional SPY shares at {money(selectedTrade.spyEntryPrice, 2)}</small>
                  </article>
                  <article>
                    <p className="label">YOUR TRADE VALUE</p>
                    <strong>{selectedTrade.currentValue === null ? "—" : money(selectedTrade.currentValue, 2)}</strong>
                    <small>{selectedTrade.status === "Closed" ? "Realized proceeds" : "Current and realized value combined"}</small>
                  </article>
                  <article>
                    <p className="label">SPY VALUE TODAY</p>
                    <strong>{money(selectedTrade.spyValue, 2)}</strong>
                    <small>{percent(selectedTrade.spyReturnPct)} lazy return</small>
                  </article>
                </div>
                <p>
                  The SPY comparison uses the next available adjusted daily price on or after the trade date and today’s cached SPY quote. Fractional shares keep the starting dollars identical.
                </p>
              </section>
            )}

            {selectedTrade.exitEdgePct !== null && (
              <section className="lazy-benchmark exit-benchmark" aria-label="Post-exit performance comparison">
                <div className="lazy-benchmark-head">
                  <div><p className="kicker">EXIT QUALITY</p><h3>What happened after you sold?</h3></div>
                  <span className={selectedTrade.exitEdgePct >= 0 ? "positive" : "negative"}>
                    {selectedTrade.exitEdgePct >= 0 ? "+" : ""}{selectedTrade.exitEdgePct.toFixed(1)} pts
                  </span>
                </div>
                <div className="lazy-benchmark-grid">
                  <article>
                    <p className="label">{selectedTrade.ticker} SINCE EXIT</p>
                    <strong className={selectedTrade.postExitReturnPct !== null && selectedTrade.postExitReturnPct >= 0 ? "positive" : "negative"}>{percent(selectedTrade.postExitReturnPct)}</strong>
                    <small>{selectedTrade.adjustedExitPrice === null || selectedTrade.postExitCurrentPrice === null ? "Adjusted prices unavailable" : `${money(selectedTrade.adjustedExitPrice, 2)} adjusted exit → ${money(selectedTrade.postExitCurrentPrice, 2)} latest`}</small>
                  </article>
                  <article>
                    <p className="label">SPY SINCE EXIT</p>
                    <strong className={selectedTrade.postExitSpyReturnPct !== null && selectedTrade.postExitSpyReturnPct >= 0 ? "positive" : "negative"}>{percent(selectedTrade.postExitSpyReturnPct)}</strong>
                    <small>Same post-sale observation period</small>
                  </article>
                  <article>
                    <p className="label">EXIT EDGE</p>
                    <strong className={selectedTrade.exitEdgePct >= 0 ? "positive" : "negative"}>{selectedTrade.exitEdgePct >= 0 ? "+" : ""}{selectedTrade.exitEdgePct.toFixed(1)} pts</strong>
                    <small>{selectedTrade.exitEdgePct >= 0 ? "The exit avoided relative underperformance." : "The stock outperformed SPY after the exit."}</small>
                  </article>
                </div>
                <p>Exit quality compares split-adjusted daily performance after the sale with SPY over the same dates. It contributes up to ±15 points without overriding the realized result or original holding discipline.</p>
              </section>
            )}

            <div className="detail-notes">
              <article><span>↗</span><div><p className="label">WHAT WORKED</p><h3>{selectedTrade.strength}</h3></div></article>
              <article><span>◎</span><div><p className="label">WATCH NEXT TIME</p><h3>{selectedTrade.watchout}</h3></div></article>
            </div>

            <div className="score-explainer">
              <div><p className="label">HOW THIS SCORE WORKS</p><p>Observed outcome contributes up to 35 points. When current and historical pricing are available, performance versus the same dollars invested in SPY adds or subtracts up to 15 points. Split normalization, holding discipline, and unusually large position sizes also adjust the score.</p></div>
              <span>{selectedTrade.rawCode} · {selectedTrade.transactionId}</span>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
