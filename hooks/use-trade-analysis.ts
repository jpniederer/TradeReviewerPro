import { useMemo } from "react";
import { demoTransactions } from "../lib/demo-data";
import type { Transaction } from "../lib/importers/robinhood";
import type { Holding } from "../lib/portfolio/engine";
import { buildSpyBenchmark } from "../lib/portfolio/spy-benchmark";
import type { CurrentQuote, DailyPrice } from "../lib/pricing";
import { analyzeTrades, type RatedTrade } from "../lib/trade-review/analyzer";

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

type UseTradeAnalysisOptions = {
  transactions: Transaction[];
  isDemo: boolean;
  baseHoldings: Holding[];
  realizedGain: number;
  currentQuotes: Record<string, CurrentQuote>;
  spyPrices: DailyPrice[];
  exitedDailyPrices: Record<string, DailyPrice[]>;
  heldPricePhaseComplete: boolean;
};

export function useTradeAnalysis(options: UseTradeAnalysisOptions) {
  const {
    transactions,
    isDemo,
    baseHoldings,
    realizedGain,
    currentQuotes,
    spyPrices,
    exitedDailyPrices,
    heldPricePhaseComplete,
  } = options;

  return useMemo(() => {
    const sourceTransactions = isDemo ? demoTransactions : transactions;
    const holdings = baseHoldings.map((holding) => {
      const quote = currentQuotes[holding.ticker];
      if (!quote) return holding;
      const value = holding.quantity * quote.price;
      const cost = holding.avg * holding.quantity;
      const gain = value - cost;
      return { ...holding, price: quote.price, value, gain, returnPct: cost ? (gain / cost) * 100 : 0 };
    }).sort((left, right) => right.value - left.value);
    const totalValue = holdings.reduce((sum, holding) => sum + holding.value, 0);
    const unrealized = holdings.reduce((sum, holding) => sum + holding.gain, 0);
    const realized = isDemo ? 3248 : realizedGain;
    const invested = Math.max(0, totalValue - unrealized);
    const totalGain = unrealized + realized;
    const returnPct = invested ? (totalGain / invested) * 100 : 0;
    const top = holdings[0];
    const topAllocationHoldings = holdings.slice(0, 5);
    const otherAllocationValue = holdings.slice(5).reduce((sum, holding) => sum + holding.value, 0);
    const allocationItems = [
      ...topAllocationHoldings.map(({ ticker, value, color }) => ({ ticker, value, color })),
      ...(otherAllocationValue > 0 ? [{ ticker: "Other", value: otherAllocationValue, color: "#b6b4ac" }] : []),
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
    const ratedTrades = analyzeTrades(sourceTransactions, {
      currentPrices: Object.fromEntries(Object.values(currentQuotes).map((quote) => [quote.symbol, quote.price])),
      spyDailyPrices: spyPrices,
      exitedDailyPrices,
      asOfDate: currentQuotes.SPY?.asOf.slice(0, 10),
    });
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
    const spyBenchmark = buildSpyBenchmark(sourceTransactions, spyPrices, currentQuotes.SPY?.price);
    const benchmarkedBuys = ratedTrades.filter((trade) => trade.side === "Buy" && trade.excessReturnPct !== null);
    const heldTickerSet = new Set(baseHoldings.map((holding) => holding.ticker));
    const exitedCostByTicker = new Map<string, number>();
    ratedTrades.filter((trade) => trade.side === "Sell" && !heldTickerSet.has(trade.ticker)).forEach((trade) => {
      const matchedCost = (trade.normalizedPrice || 0) * (trade.normalizedQuantity || 0);
      exitedCostByTicker.set(trade.ticker, (exitedCostByTicker.get(trade.ticker) || 0) + matchedCost);
    });
    const exitedTickerPriority = [...exitedCostByTicker.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([ticker]) => ticker);
    const exitRatedSales = ratedTrades.filter((trade) => trade.side === "Sell" && trade.exitEdgePct !== null);
    const averageExitEdge = exitRatedSales.length
      ? exitRatedSales.reduce((sum, trade) => sum + (trade.exitEdgePct || 0), 0) / exitRatedSales.length
      : null;
    const averageMarketEdge = benchmarkedBuys.length
      ? benchmarkedBuys.reduce((sum, trade) => sum + (trade.excessReturnPct || 0), 0) / benchmarkedBuys.length
      : null;
    const marketEdgeScore = averageMarketEdge === null ? 50 : Math.round(clamp(50 + averageMarketEdge * 1.2));
    const patienceScore = heldTrades.length ? Math.round(clamp(30 + (averageHoldingDays / 365) * 70)) : 50;
    const buysByTicker = new Map<string, number>();
    sourceTransactions.filter((transaction) => transaction.type === "buy").forEach((transaction) => {
      buysByTicker.set(transaction.ticker, (buysByTicker.get(transaction.ticker) || 0) + 1);
    });
    const averageEntries = buysByTicker.size
      ? [...buysByTicker.values()].reduce((sum, count) => sum + count, 0) / buysByTicker.size
      : 0;
    const dcaScore = averageEntries ? Math.round(clamp(42 + (averageEntries - 1) * 18)) : 50;
    const realizedEdgePct = spyBenchmark.realizedCost > 0
      ? ((spyBenchmark.actualRealizedGain - spyBenchmark.spyRealizedGain) / spyBenchmark.realizedCost) * 100
      : null;
    const realizedEdgeScore = realizedEdgePct === null ? 50 : Math.round(clamp(50 + realizedEdgePct * 1.2));
    const exitTimingScore = averageExitEdge === null ? 50 : Math.round(clamp(50 + averageExitEdge * 1.2));
    const scoreMetrics = [
      { name: "Market edge", score: marketEdgeScore, available: averageMarketEdge !== null, copy: averageMarketEdge === null ? "Waiting for current quotes and SPY history." : `${averageMarketEdge >= 0 ? "+" : ""}${averageMarketEdge.toFixed(1)} average percentage points versus SPY across ${benchmarkedBuys.length} buys.` },
      { name: "Holding patience", score: patienceScore, available: heldTrades.length > 0, copy: averageHoldingDays ? `${averageHoldingDays} observed days on average across rated executions.` : "Not enough matched holding periods yet." },
      { name: "DCA discipline", score: dcaScore, available: averageEntries > 0, copy: averageEntries ? `${averageEntries.toFixed(1)} entries per purchased ticker on average.` : "Import buy activity to measure entry discipline." },
      { name: "Realized edge", score: realizedEdgeScore, available: realizedEdgePct !== null, copy: realizedEdgePct === null ? "No matched stock and SPY realizations are available." : `${realizedEdgePct >= 0 ? "+" : ""}${realizedEdgePct.toFixed(1)} points versus matched SPY sales.` },
      { name: "Exit timing", score: exitTimingScore, available: averageExitEdge !== null, copy: averageExitEdge === null ? (heldPricePhaseComplete ? "Fetch exited positions to evaluate what happened after each sale." : "Held-position prices are completed before exited positions.") : `${averageExitEdge >= 0 ? "+" : ""}${averageExitEdge.toFixed(1)} average points avoided versus SPY after ${exitRatedSales.length} sales.` },
    ];
    const metricScore = Math.round(scoreMetrics.reduce((sum, metric) => sum + metric.score, 0) / scoreMetrics.length);
    const tradeScore = executionScore ? Math.round(executionScore * 0.6 + metricScore * 0.4) : 0;
    const availableScoreMetrics = scoreMetrics.filter((metric) => metric.available);
    const strongestMetric = availableScoreMetrics.reduce((best, metric) => !best || metric.score > best.score ? metric : best, availableScoreMetrics[0]);
    const weakestMetric = availableScoreMetrics.reduce((lowest, metric) => !lowest || metric.score < lowest.score ? metric : lowest, availableScoreMetrics[0]);
    const metricHeadlines: Record<string, string> = {
      "Market edge": averageMarketEdge !== null && averageMarketEdge >= 0 ? "Your entries are creating an edge." : "Passive SPY is setting the pace.",
      "Holding patience": averageHoldingDays >= 180 ? "You give positions time to work." : "Your holding periods run short.",
      "DCA discipline": averageEntries >= 2 ? "You build positions in pieces." : "Most positions begin in one shot.",
      "Realized edge": realizedEdgePct !== null && realizedEdgePct >= 0 ? "Your realized trades beat matched SPY." : "Matched SPY realized more.",
      "Exit timing": averageExitEdge !== null && averageExitEdge >= 0 ? "Your exits avoided relative weakness." : "Some exits left upside behind.",
    };
    const overviewReviewTitle = tradeScore >= 80 ? ["Strong process.", "Your data shows an edge."] : tradeScore >= 65 ? ["Good instincts.", "One habit is holding you back."] : ["Clear lessons.", "Focus on the weakest pattern."];
    const reviewHeadline = tradeScore >= 80 ? ["Strong process.", "Keep compounding."] : tradeScore >= 65 ? ["Good instincts.", "Sharpen the exits."] : ["Useful lessons.", "Clear room to grow."];
    const bestTrade = scoredTrades.reduce<RatedTrade | null>((best, trade) => !best || (trade.outcomePct ?? -Infinity) > (best.outcomePct ?? -Infinity) ? trade : best, null);

    return {
      holdings, totalValue, unrealized, realized, invested, totalGain, returnPct, top,
      allocationItems, allocationGradient, largestAllocationPct, topFiveAllocationPct,
      ratedTrades, closedSales, profitableSales, heldTrades, averageHoldingDays,
      spyBenchmark, exitedTickerPriority, scoreMetrics, tradeScore, strongestMetric,
      weakestMetric, metricHeadlines, overviewReviewTitle, reviewHeadline, bestTrade,
    };
  }, [baseHoldings, currentQuotes, exitedDailyPrices, heldPricePhaseComplete, isDemo, realizedGain, spyPrices, transactions]);
}

export type TradeAnalysis = ReturnType<typeof useTradeAnalysis>;
