import type { Transaction } from "../importers/robinhood";

export type BenchmarkDailyPrice = {
  date: string;
  adjustedClose: number;
};

export type SpyBenchmark = {
  spyOpenShares: number;
  spyOpenValue: number | null;
  openCost: number;
  spyUnrealizedGain: number | null;
  actualRealizedValue: number;
  actualRealizedGain: number;
  spyRealizedValue: number;
  spyRealizedGain: number;
  realizedCost: number;
  coveragePct: number;
};

type BenchmarkLot = {
  quantity: number;
  cost: number;
  spyShares: number | null;
};

function priceOnOrAfter(prices: BenchmarkDailyPrice[], date: string) {
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

export function buildSpyBenchmark(
  transactions: Transaction[],
  dailyPrices: BenchmarkDailyPrice[],
  currentSpyPrice?: number,
): SpyBenchmark {
  const prices = [...dailyPrices].sort((left, right) => left.date.localeCompare(right.date));
  const lots = new Map<string, BenchmarkLot[]>();
  const transferred = new Map<string, BenchmarkLot[]>();
  let totalBuyCost = 0;
  let coveredBuyCost = 0;
  let actualRealizedValue = 0;
  let actualRealizedGain = 0;
  let spyRealizedValue = 0;
  let spyRealizedGain = 0;
  let realizedCost = 0;

  const ordered = [...transactions].sort((left, right) => {
    const dateOrder = left.date.localeCompare(right.date);
    if (dateOrder) return dateOrder;
    if (left.type === "transfer_out" && right.type === "transfer_in") return -1;
    if (left.type === "transfer_in" && right.type === "transfer_out") return 1;
    return 0;
  });

  const consume = (
    transaction: Transaction,
    realize: boolean,
    transfer: boolean,
  ) => {
    const tickerLots = lots.get(transaction.ticker) || [];
    const moved: BenchmarkLot[] = [];
    const spyExitPrice = realize ? priceOnOrAfter(prices, transaction.date) : undefined;
    let remaining = transaction.quantity;

    for (const lot of tickerLots) {
      if (remaining <= 0 || lot.quantity <= 0) continue;
      const consumedQuantity = Math.min(remaining, lot.quantity);
      const fraction = consumedQuantity / lot.quantity;
      const consumedCost = lot.cost * fraction;
      const consumedSpyShares = lot.spyShares === null ? null : lot.spyShares * fraction;

      if (realize && consumedSpyShares !== null && spyExitPrice) {
        const actualValue = consumedQuantity * transaction.price;
        const spyValue = consumedSpyShares * spyExitPrice;
        realizedCost += consumedCost;
        actualRealizedValue += actualValue;
        actualRealizedGain += actualValue - consumedCost;
        spyRealizedValue += spyValue;
        spyRealizedGain += spyValue - consumedCost;
      }
      if (transfer) {
        moved.push({
          quantity: consumedQuantity,
          cost: consumedCost,
          spyShares: consumedSpyShares,
        });
      }

      lot.quantity -= consumedQuantity;
      lot.cost -= consumedCost;
      if (lot.spyShares !== null && consumedSpyShares !== null) {
        lot.spyShares -= consumedSpyShares;
      }
      remaining -= consumedQuantity;
    }

    lots.set(transaction.ticker, tickerLots.filter((lot) => lot.quantity > 0.0000001));
    return moved;
  };

  ordered.forEach((transaction) => {
    const tickerLots = lots.get(transaction.ticker) || [];
    const transferKey = `${transaction.date}:${transaction.rawCode}`;

    if (transaction.type === "buy") {
      const cost = transaction.amount || transaction.quantity * transaction.price;
      const spyEntryPrice = priceOnOrAfter(prices, transaction.date);
      totalBuyCost += cost;
      if (spyEntryPrice) coveredBuyCost += cost;
      tickerLots.push({
        quantity: transaction.quantity,
        cost,
        spyShares: spyEntryPrice ? cost / spyEntryPrice : null,
      });
      lots.set(transaction.ticker, tickerLots);
    } else if (transaction.type === "sell") {
      consume(transaction, true, false);
    } else if (transaction.type === "split") {
      const totalQuantity = tickerLots.reduce((sum, lot) => sum + lot.quantity, 0);
      if (totalQuantity > 0 && transaction.quantity > 0) {
        tickerLots.forEach((lot) => {
          lot.quantity += transaction.quantity * (lot.quantity / totalQuantity);
        });
      }
    } else if (transaction.type === "transfer_out") {
      const moved = consume(transaction, false, true);
      transferred.set(transferKey, [...(transferred.get(transferKey) || []), ...moved]);
    } else if (transaction.type === "transfer_in") {
      const moved = transferred.get(transferKey) || [];
      const cost = moved.reduce((sum, lot) => sum + lot.cost, 0);
      const spyShares = moved.every((lot) => lot.spyShares !== null)
        ? moved.reduce((sum, lot) => sum + (lot.spyShares || 0), 0)
        : null;
      tickerLots.push({ quantity: transaction.quantity, cost, spyShares });
      transferred.delete(transferKey);
      lots.set(transaction.ticker, tickerLots);
    }
  });

  const openLots = [...lots.values()].flat();
  const coveredOpenLots = openLots.filter(
    (lot): lot is BenchmarkLot & { spyShares: number } => lot.spyShares !== null,
  );
  const openCost = coveredOpenLots.reduce((sum, lot) => sum + lot.cost, 0);
  const spyOpenShares = coveredOpenLots.reduce((sum, lot) => sum + lot.spyShares, 0);
  const spyOpenValue = currentSpyPrice && spyOpenShares > 0
    ? spyOpenShares * currentSpyPrice
    : null;

  return {
    spyOpenShares,
    spyOpenValue,
    openCost,
    spyUnrealizedGain: spyOpenValue === null ? null : spyOpenValue - openCost,
    actualRealizedValue,
    actualRealizedGain,
    spyRealizedValue,
    spyRealizedGain,
    realizedCost,
    coveragePct: totalBuyCost > 0 ? (coveredBuyCost / totalBuyCost) * 100 : 0,
  };
}
