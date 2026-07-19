import type { Transaction } from "../importers/robinhood";

export type Holding = {
  ticker: string;
  name: string;
  quantity: number;
  avg: number;
  price: number;
  value: number;
  gain: number;
  returnPct: number;
  color: string;
};

const names: Record<string, string> = {
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "NVIDIA",
  AMZN: "Amazon",
  META: "Meta",
  GOOGL: "Alphabet",
  TSLA: "Tesla",
  V: "Visa",
  SPY: "SPDR S&P 500",
};

const palette = ["#182e26", "#c5d0c3", "#e88950", "#d9d7cd", "#a4af9e"];

type LedgerItem = { qty: number; cost: number; last: number };

export function buildHoldings(transactions: Transaction[]): {
  holdings: Holding[];
  realized: number;
  dividends: number;
} {
  const ledger = new Map<string, LedgerItem>();
  const transferredBasis = new Map<string, number>();
  let realized = 0;
  let dividends = 0;

  const ordered = [...transactions].sort((left, right) => {
    const dateOrder = left.date.localeCompare(right.date);
    if (dateOrder) return dateOrder;
    if (left.type === "transfer_out" && right.type === "transfer_in") return -1;
    if (left.type === "transfer_in" && right.type === "transfer_out") return 1;
    return 0;
  });

  ordered.forEach((transaction) => {
    if (transaction.type === "dividend") {
      dividends += transaction.amount;
      return;
    }
    if (transaction.type === "cash" || transaction.type === "option" || transaction.ticker === "CASH") {
      return;
    }

    const item = ledger.get(transaction.ticker) || { qty: 0, cost: 0, last: 0 };
    const transferKey = `${transaction.date}:${transaction.rawCode}`;

    if (transaction.type === "buy") {
      item.qty += transaction.quantity;
      item.cost += transaction.amount || transaction.quantity * transaction.price;
    } else if (transaction.type === "sell" && item.qty > 0) {
      const sold = Math.min(transaction.quantity, item.qty);
      const averageCost = item.cost / item.qty;
      realized += sold * transaction.price - sold * averageCost;
      item.qty -= sold;
      item.cost -= sold * averageCost;
    } else if (transaction.type === "split") {
      // Robinhood exports the number of shares added, not the split ratio.
      item.qty += transaction.quantity;
    } else if (transaction.type === "transfer_out" && item.qty > 0) {
      const transferred = Math.min(transaction.quantity, item.qty);
      const averageCost = item.cost / item.qty;
      const removedCost = transferred * averageCost;
      item.qty -= transferred;
      item.cost -= removedCost;
      transferredBasis.set(transferKey, (transferredBasis.get(transferKey) || 0) + removedCost);
    } else if (transaction.type === "transfer_in") {
      item.qty += transaction.quantity;
      item.cost += transferredBasis.get(transferKey) || 0;
      transferredBasis.delete(transferKey);
    } else if (transaction.type === "return_of_capital") {
      const excess = Math.max(0, transaction.amount - item.cost);
      item.cost = Math.max(0, item.cost - transaction.amount);
      realized += excess;
    }

    if (transaction.price > 0 && (transaction.type === "buy" || transaction.type === "sell")) {
      item.last = transaction.price;
    }
    ledger.set(transaction.ticker, item);
  });

  const holdings = [...ledger.entries()]
    .filter(([, item]) => item.qty > 0.00001)
    .map(([ticker, item], index) => {
      const avg = item.qty ? item.cost / item.qty : 0;
      const value = item.qty * item.last;
      const gain = value - item.cost;
      return {
        ticker,
        name: names[ticker] || ticker,
        quantity: item.qty,
        avg,
        price: item.last,
        value,
        gain,
        returnPct: item.cost ? (gain / item.cost) * 100 : 0,
        color: palette[index % palette.length],
      };
    })
    .sort((left, right) => right.value - left.value);

  return { holdings, realized: realized + dividends, dividends };
}
