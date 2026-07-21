import type { Transaction } from "./importers/robinhood";
import type { Holding } from "./portfolio/engine";

export const demoHoldings: Holding[] = [
  { ticker: "NVDA", name: "NVIDIA", quantity: 48, avg: 62.31, price: 139.19, value: 6681.12, gain: 3690.24, returnPct: 123.4, color: "#182e26" },
  { ticker: "AAPL", name: "Apple", quantity: 21, avg: 143.18, price: 224.76, value: 4720.0, gain: 1713.18, returnPct: 57.0, color: "#c5d0c3" },
  { ticker: "MSFT", name: "Microsoft", quantity: 9, avg: 334.22, price: 446.18, value: 4015.62, gain: 1007.64, returnPct: 33.5, color: "#e88950" },
  { ticker: "AMZN", name: "Amazon", quantity: 16, avg: 154.03, price: 207.86, value: 3325.76, gain: 861.28, returnPct: 35.0, color: "#d9d7cd" },
  { ticker: "V", name: "Visa", quantity: 8, avg: 246.10, price: 312.45, value: 2499.60, gain: 530.80, returnPct: 27.0, color: "#a4af9e" },
];

export const demoTransactions: Transaction[] = [
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
