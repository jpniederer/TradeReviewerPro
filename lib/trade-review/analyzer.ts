import type { Transaction } from "../importers/robinhood";

export type TradeSide = "Buy" | "Sell";
export type TradeStatus = "Open" | "Partially sold" | "Closed" | "Transferred";
export type TradeConfidence = "High" | "Medium" | "Low";

export type TradeMarketData = {
  currentPrices?: Record<string, number>;
  spyDailyPrices?: Array<{ date: string; adjustedClose: number }>;
  exitedDailyPrices?: Record<string, Array<{ date: string; adjustedClose: number }>>;
  asOfDate?: string;
};

export type RatedTrade = {
  id: string;
  transactionId: string;
  ticker: string;
  date: string;
  side: TradeSide;
  quantity: number;
  price: number;
  amount: number;
  score: number;
  grade: string;
  verdict: string;
  outcomePct: number | null;
  holdingDays: number | null;
  normalizedQuantity: number | null;
  normalizedPrice: number | null;
  referencePrice: number | null;
  referenceLabel: string;
  currentValue: number | null;
  spyEntryPrice: number | null;
  spyShares: number | null;
  spyCurrentPrice: number | null;
  spyValue: number | null;
  spyReturnPct: number | null;
  excessReturnPct: number | null;
  postExitReturnPct: number | null;
  postExitSpyReturnPct: number | null;
  exitEdgePct: number | null;
  adjustedExitPrice: number | null;
  postExitCurrentPrice: number | null;
  status: TradeStatus;
  confidence: TradeConfidence;
  summary: string;
  strength: string;
  watchout: string;
  rawCode: string;
  description: string;
};

type Lot = {
  source: Transaction | null;
  quantity: number;
  cost: number;
  opened: string;
};

type BuyObservation = {
  realizedValue: number;
  realizedCost: number;
  realizedQuantity: number;
  weightedDays: number;
  transferredCost: number;
};

type SaleObservation = {
  transaction: Transaction;
  matchedQuantity: number;
  matchedCost: number;
  weightedDays: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function daysBetween(start: string, end: string) {
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  return Math.max(0, Math.round((endTime - startTime) / 86_400_000));
}

function median(values: number[]) {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function gradeFor(score: number) {
  if (score >= 90) return "A+";
  if (score >= 82) return "A";
  if (score >= 74) return "B+";
  if (score >= 66) return "B";
  if (score >= 58) return "C";
  if (score >= 48) return "D";
  return "F";
}

function verdictFor(score: number) {
  if (score >= 85) return "Excellent";
  if (score >= 75) return "Strong";
  if (score >= 65) return "Solid";
  if (score >= 52) return "Mixed";
  return "Needs review";
}

function ratingScore(
  outcomePct: number | null,
  holdingDays: number | null,
  amount: number,
  typicalPurchase: number,
  excessReturnPct: number | null = null,
) {
  if (outcomePct === null) return 50;
  const outcomeContribution = clamp(outcomePct * 0.48, -35, 35);
  const benchmarkContribution = excessReturnPct === null
    ? 0
    : clamp(excessReturnPct * 0.22, -15, 15);
  const patienceContribution =
    holdingDays === null ? 0 :
    holdingDays >= 365 ? 8 :
    holdingDays >= 90 ? 5 :
    holdingDays < 7 ? -7 :
    holdingDays < 30 ? -3 : 1;
  const sizingContribution =
    typicalPurchase > 0 && amount > typicalPurchase * 4 ? -6 :
    typicalPurchase > 0 && amount > typicalPurchase * 2.5 ? -3 : 0;
  return Math.round(clamp(
    57 + outcomeContribution + benchmarkContribution + patienceContribution + sizingContribution,
    0,
    100,
  ));
}

function buyNarrative(
  ticker: string,
  outcomePct: number | null,
  status: TradeStatus,
  holdingDays: number | null,
  excessReturnPct: number | null,
) {
  if (status === "Transferred") {
    return {
      summary: `${ticker} left the account through a corporate action, so this entry does not have a comparable exit price.`,
      strength: "The original execution and cost basis remain visible in your history.",
      watchout: "Corporate-action outcomes need linked market data for a fair performance grade.",
    };
  }
  if (outcomePct === null) {
    return {
      summary: `There is not enough price evidence in this export to judge this ${ticker} entry yet.`,
      strength: "The trade is retained in your review instead of receiving a made-up outcome.",
      watchout: "Import a newer export after another execution to improve confidence.",
    };
  }
  const positive = outcomePct >= 0;
  const benchmarkSentence = excessReturnPct === null
    ? ""
    : ` That is ${Math.abs(excessReturnPct).toFixed(1)} percentage points ${excessReturnPct >= 0 ? "ahead of" : "behind"} the same dollars left in SPY.`;
  return {
    summary: `${positive ? "This entry appreciated" : "This entry declined"} ${Math.abs(outcomePct).toFixed(1)}% against the ${status === "Closed" ? "matched exit" : "current valuation"}.${benchmarkSentence}`,
    strength: positive
      ? `${holdingDays && holdingDays >= 90 ? "Patience gave the thesis time to work." : "The entry price created positive observed upside."}`
      : "The position size and timing are now measurable for future comparison.",
    watchout: positive
      ? "The score does not include prices between brokerage executions."
      : `${holdingDays !== null && holdingDays < 30 ? "The outcome followed a short holding period; review whether timing drove the decision." : "Review the original thesis and what changed after entry."}`,
  };
}

function sellNarrative(
  ticker: string,
  outcomePct: number | null,
  holdingDays: number | null,
  exitEdgePct: number | null,
) {
  if (outcomePct === null) {
    return {
      summary: `The export does not contain enough matched cost basis to fairly grade this ${ticker} sale.`,
      strength: "The execution is still included in the ledger for completeness.",
      watchout: "Transferred or pre-export shares can make sale-level cost basis incomplete.",
    };
  }
  const positive = outcomePct >= 0;
  const exitSentence = exitEdgePct === null
    ? ""
    : ` Since the exit, it has performed ${Math.abs(exitEdgePct).toFixed(1)} percentage points ${exitEdgePct >= 0 ? "worse than SPY, supporting the decision to leave" : "better than SPY, suggesting the exit may have been early"}.`;
  return {
    summary: `This sale ${positive ? "realized an observed gain" : "closed at an observed loss"} of ${Math.abs(outcomePct).toFixed(1)}% against matched FIFO lots.${exitSentence}`,
    strength: positive
      ? `${holdingDays && holdingDays >= 90 ? "The winning position was given meaningful time to compound." : "The execution locked in a positive outcome."}`
      : "Closing the position prevented the original risk from remaining open-ended.",
    watchout: positive
      ? "A later market-price feed is needed to evaluate whether the exit was early or well timed."
      : `${holdingDays !== null && holdingDays < 30 ? "The short holding period may indicate a reactive exit." : "Compare the exit reason with the original thesis."}`,
  };
}

function spyPriceOnOrAfter(
  prices: TradeMarketData["spyDailyPrices"],
  date: string,
) {
  if (!prices?.length) return undefined;
  let low = 0;
  let high = prices.length - 1;
  let match: number | undefined;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (prices[middle].date >= date) {
      match = prices[middle].adjustedClose;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  return match;
}

export function analyzeTrades(
  transactions: Transaction[],
  marketData: TradeMarketData = {},
): RatedTrade[] {
  const investmentTransactions = transactions.filter((transaction) =>
    transaction.type === "buy" || transaction.type === "sell"
  );
  if (!investmentTransactions.length) return [];

  const ordered = [...transactions].sort((left, right) => left.date.localeCompare(right.date));
  const benchmarkPrices = [...(marketData.spyDailyPrices || [])]
    .sort((left, right) => left.date.localeCompare(right.date));
  const exitedPrices = Object.fromEntries(
    Object.entries(marketData.exitedDailyPrices || {}).map(([symbol, prices]) => [
      symbol,
      [...prices].sort((left, right) => left.date.localeCompare(right.date)),
    ]),
  );
  const latestDate = marketData.asOfDate ||
    ordered[ordered.length - 1]?.date ||
    new Date().toISOString().slice(0, 10);
  const typicalPurchase = median(
    investmentTransactions
      .filter((transaction) => transaction.type === "buy")
      .map((transaction) => transaction.amount)
      .filter((amount) => amount > 0)
  );
  const latestPrice = new Map<string, number>();
  ordered.forEach((transaction) => {
    if (transaction.type !== "buy" && transaction.type !== "sell") return;
    if (transaction.price > 0) latestPrice.set(transaction.ticker, transaction.price);
  });

  const lots = new Map<string, Lot[]>();
  const buyObservations = new Map<string, BuyObservation>();
  const saleObservations: SaleObservation[] = [];

  const observeBuy = (transaction: Transaction) => {
    if (!buyObservations.has(transaction.id)) {
      buyObservations.set(transaction.id, {
        realizedValue: 0,
        realizedCost: 0,
        realizedQuantity: 0,
        weightedDays: 0,
        transferredCost: 0,
      });
    }
  };

  const consumeLots = (
    transaction: Transaction,
    shouldObserveSale: boolean,
    shouldTransferBasis: boolean,
  ) => {
    const tickerLots = lots.get(transaction.ticker) || [];
    let remaining = transaction.quantity;
    let matchedQuantity = 0;
    let matchedCost = 0;
    let weightedDays = 0;

    for (const lot of tickerLots) {
      if (remaining <= 0 || lot.quantity <= 0) continue;
      const consumed = Math.min(remaining, lot.quantity);
      const unitCost = lot.quantity ? lot.cost / lot.quantity : 0;
      const consumedCost = consumed * unitCost;
      const heldDays = daysBetween(lot.opened, transaction.date);

      if (lot.source) {
        observeBuy(lot.source);
        const observation = buyObservations.get(lot.source.id)!;
        if (shouldObserveSale) {
          observation.realizedValue += consumed * transaction.price;
          observation.realizedCost += consumedCost;
          observation.realizedQuantity += consumed;
          observation.weightedDays += heldDays * consumed;
        } else if (shouldTransferBasis) {
          observation.transferredCost += consumedCost;
        }
      }

      matchedQuantity += consumed;
      matchedCost += consumedCost;
      weightedDays += heldDays * consumed;
      lot.quantity -= consumed;
      lot.cost -= consumedCost;
      remaining -= consumed;
    }

    lots.set(transaction.ticker, tickerLots.filter((lot) => lot.quantity > 0.0000001));
    if (shouldObserveSale) {
      saleObservations.push({ transaction, matchedQuantity, matchedCost, weightedDays });
    }
    return matchedCost;
  };

  const transferredBasis = new Map<string, number>();

  ordered.forEach((transaction) => {
    const tickerLots = lots.get(transaction.ticker) || [];
    const transferKey = `${transaction.date}:${transaction.rawCode}`;

    if (transaction.type === "buy") {
      observeBuy(transaction);
      tickerLots.push({
        source: transaction,
        quantity: transaction.quantity,
        cost: transaction.amount || transaction.quantity * transaction.price,
        opened: transaction.date,
      });
      lots.set(transaction.ticker, tickerLots);
    } else if (transaction.type === "sell") {
      consumeLots(transaction, true, false);
    } else if (transaction.type === "split") {
      const totalQuantity = tickerLots.reduce((sum, lot) => sum + lot.quantity, 0);
      if (totalQuantity > 0 && transaction.quantity > 0) {
        tickerLots.forEach((lot) => {
          lot.quantity += transaction.quantity * (lot.quantity / totalQuantity);
        });
      }
    } else if (transaction.type === "transfer_out") {
      const basis = consumeLots(transaction, false, true);
      transferredBasis.set(transferKey, (transferredBasis.get(transferKey) || 0) + basis);
    } else if (transaction.type === "transfer_in" && transaction.quantity > 0) {
      tickerLots.push({
        source: null,
        quantity: transaction.quantity,
        cost: transferredBasis.get(transferKey) || 0,
        opened: transaction.date,
      });
      transferredBasis.delete(transferKey);
      lots.set(transaction.ticker, tickerLots);
    }
  });

  const ratedBuys = investmentTransactions
    .filter((transaction) => transaction.type === "buy")
    .map((transaction): RatedTrade => {
      const observation = buyObservations.get(transaction.id)!;
      const sourceLots = [...lots.values()].flat().filter((lot) => lot.source?.id === transaction.id);
      const openQuantity = sourceLots.reduce((sum, lot) => sum + lot.quantity, 0);
      const openCost = sourceLots.reduce((sum, lot) => sum + lot.cost, 0);
      const importedOpenPrice = latestPrice.get(transaction.ticker) || 0;
      const liveOpenPrice = marketData.currentPrices?.[transaction.ticker];
      const openPrice = liveOpenPrice && liveOpenPrice > 0 ? liveOpenPrice : importedOpenPrice;
      const observedCost = observation.realizedCost + openCost;
      const observedValue = observation.realizedValue + openQuantity * openPrice;
      const outcomePct = observedCost > 0 ? ((observedValue - observedCost) / observedCost) * 100 : null;
      const observedQuantity = observation.realizedQuantity + openQuantity;
      const normalizedPrice = observedQuantity > 0 && observedCost > 0
        ? observedCost / observedQuantity
        : null;
      const holdingDays = observedQuantity > 0
        ? Math.round((observation.weightedDays + daysBetween(transaction.date, latestDate) * openQuantity) / observedQuantity)
        : null;
      const status: TradeStatus =
        openQuantity > 0 && observation.realizedQuantity > 0 ? "Partially sold" :
        openQuantity > 0 ? "Open" :
        observation.transferredCost > 0 && observation.realizedQuantity === 0 ? "Transferred" : "Closed";
      const referencePrice = observedQuantity > 0 ? observedValue / observedQuantity : null;
      const spyEntryPrice = spyPriceOnOrAfter(benchmarkPrices, transaction.date) || null;
      const spyCurrentPrice = marketData.currentPrices?.SPY || null;
      const spyShares = spyEntryPrice && transaction.amount > 0
        ? transaction.amount / spyEntryPrice
        : null;
      const spyValue = spyShares && spyCurrentPrice
        ? spyShares * spyCurrentPrice
        : null;
      const spyReturnPct = spyValue && transaction.amount > 0
        ? ((spyValue - transaction.amount) / transaction.amount) * 100
        : null;
      const hasCurrentActualValue = openQuantity <= 0 || Boolean(liveOpenPrice && liveOpenPrice > 0);
      const currentValue = hasCurrentActualValue ? observedValue : null;
      const currentReturnPct = currentValue !== null && observedCost > 0
        ? ((currentValue - observedCost) / observedCost) * 100
        : null;
      const excessReturnPct = currentReturnPct !== null && spyReturnPct !== null
        ? currentReturnPct - spyReturnPct
        : null;
      const score = ratingScore(
        outcomePct,
        holdingDays,
        transaction.amount,
        typicalPurchase,
        excessReturnPct,
      );
      const narrative = buyNarrative(
        transaction.ticker,
        outcomePct,
        status,
        holdingDays,
        excessReturnPct,
      );

      return {
        id: `rated-${transaction.id}`,
        transactionId: transaction.id,
        ticker: transaction.ticker,
        date: transaction.date,
        side: "Buy",
        quantity: transaction.quantity,
        price: transaction.price,
        amount: transaction.amount,
        score,
        grade: outcomePct === null ? "—" : gradeFor(score),
        verdict: outcomePct === null ? "Not rated" : verdictFor(score),
        outcomePct,
        holdingDays,
        normalizedQuantity: observedQuantity || null,
        normalizedPrice,
        referencePrice,
        referenceLabel:
          status === "Closed" ? "Matched exit price" :
          status === "Partially sold" ? "Blended observed price" :
          status === "Transferred" ? "Corporate action" :
          liveOpenPrice ? "Current market price" : "Latest trade price",
        currentValue,
        spyEntryPrice,
        spyShares,
        spyCurrentPrice,
        spyValue,
        spyReturnPct,
        excessReturnPct,
        postExitReturnPct: null,
        postExitSpyReturnPct: null,
        exitEdgePct: null,
        adjustedExitPrice: null,
        postExitCurrentPrice: null,
        status,
        confidence: status === "Closed" && outcomePct !== null ? "High" : outcomePct !== null ? "Medium" : "Low",
        ...narrative,
        rawCode: transaction.rawCode,
        description: transaction.description,
      };
    });

  const ratedSales = saleObservations.map(({ transaction, matchedQuantity, matchedCost, weightedDays }): RatedTrade => {
    const matchedExitValue = matchedQuantity * transaction.price;
    const outcomePct = matchedCost > 0 ? ((matchedExitValue - matchedCost) / matchedCost) * 100 : null;
    const holdingDays = matchedQuantity > 0 ? Math.round(weightedDays / matchedQuantity) : null;
    const stockSeries = exitedPrices[transaction.ticker] || [];
    const adjustedExitPrice = spyPriceOnOrAfter(stockSeries, transaction.date) || null;
    const adjustedCurrentPrice = stockSeries[stockSeries.length - 1]?.adjustedClose || null;
    const postExitReturnPct = adjustedExitPrice && adjustedCurrentPrice
      ? ((adjustedCurrentPrice - adjustedExitPrice) / adjustedExitPrice) * 100
      : null;
    const spyExitPrice = spyPriceOnOrAfter(benchmarkPrices, transaction.date) || null;
    const currentSpyPrice = marketData.currentPrices?.SPY || null;
    const postExitSpyReturnPct = spyExitPrice && currentSpyPrice
      ? ((currentSpyPrice - spyExitPrice) / spyExitPrice) * 100
      : null;
    const exitEdgePct = postExitReturnPct !== null && postExitSpyReturnPct !== null
      ? postExitSpyReturnPct - postExitReturnPct
      : null;
    const score = ratingScore(
      outcomePct,
      holdingDays,
      transaction.amount,
      typicalPurchase,
      exitEdgePct,
    );
    const narrative = sellNarrative(
      transaction.ticker,
      outcomePct,
      holdingDays,
      exitEdgePct,
    );

    return {
      id: `rated-${transaction.id}`,
      transactionId: transaction.id,
      ticker: transaction.ticker,
      date: transaction.date,
      side: "Sell",
      quantity: transaction.quantity,
      price: transaction.price,
      amount: transaction.amount,
      score,
      grade: outcomePct === null ? "—" : gradeFor(score),
      verdict: outcomePct === null ? "Not rated" : verdictFor(score),
      outcomePct,
      holdingDays,
      normalizedQuantity: matchedQuantity || null,
      normalizedPrice: matchedCost > 0 && matchedQuantity > 0 ? matchedCost / matchedQuantity : null,
      referencePrice: matchedCost > 0 && matchedQuantity > 0 ? matchedCost / matchedQuantity : null,
      referenceLabel: "Matched FIFO cost",
      currentValue: null,
      spyEntryPrice: null,
      spyShares: null,
      spyCurrentPrice: null,
      spyValue: null,
      spyReturnPct: null,
      excessReturnPct: null,
      postExitReturnPct,
      postExitSpyReturnPct,
      exitEdgePct,
      adjustedExitPrice,
      postExitCurrentPrice: adjustedCurrentPrice,
      status: "Closed",
      confidence: matchedQuantity >= transaction.quantity * 0.999 && outcomePct !== null ? "High" : "Low",
      ...narrative,
      rawCode: transaction.rawCode,
      description: transaction.description,
    };
  });

  return [...ratedBuys, ...ratedSales].sort((left, right) =>
    right.date.localeCompare(left.date) || right.transactionId.localeCompare(left.transactionId)
  );
}
