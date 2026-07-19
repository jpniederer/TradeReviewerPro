import assert from "node:assert/strict";
import test from "node:test";
import { parseRobinhoodCsv } from "../lib/importers/robinhood";
import { analyzeTrades } from "../lib/trade-review/analyzer";

const header = '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"';

test("rates matched buys and sells with outcome and holding period", () => {
  const csv = [
    header,
    '"1/1/2024","1/1/2024","1/1/2024","ACME","Acme","Buy","10","$10.00","($100.00)"',
    '"4/10/2024","4/10/2024","4/10/2024","ACME","Acme","Sell","10","$15.00","$150.00"',
  ].join("\n");

  const trades = analyzeTrades(parseRobinhoodCsv(csv));
  const buy = trades.find((trade) => trade.side === "Buy")!;
  const sell = trades.find((trade) => trade.side === "Sell")!;

  assert.equal(trades.length, 2);
  assert.equal(buy.status, "Closed");
  assert.equal(buy.outcomePct, 50);
  assert.equal(buy.holdingDays, 100);
  assert.equal(sell.outcomePct, 50);
  assert.equal(sell.holdingDays, 100);
  assert.ok(buy.score > 70);
  assert.ok(sell.score > 70);
});

test("adjusts open lots for a split before rating a later sale", () => {
  const csv = [
    header,
    '"1/1/2024","1/1/2024","1/1/2024","ACME","Acme","Buy","10","$10.00","($100.00)"',
    '"2/1/2024","2/1/2024","2/1/2024","ACME","Acme","SPL","90","",""',
    '"3/1/2024","3/1/2024","3/1/2024","ACME","Acme","Sell","100","$2.00","$200.00"',
  ].join("\n");

  const trades = analyzeTrades(parseRobinhoodCsv(csv));
  const sell = trades.find((trade) => trade.side === "Sell")!;

  assert.equal(sell.outcomePct, 100);
  assert.equal(sell.referencePrice, 1);
});

test("uses the chronologically latest price and normalizes pre-split buys", () => {
  // Robinhood exports newest records first.
  const csv = [
    header,
    '"3/1/2024","3/1/2024","3/1/2024","ACME","Acme","Buy","1","$20.00","($20.00)"',
    '"2/1/2024","2/1/2024","2/1/2024","ACME","Acme","SPL","10","",""',
    '"1/1/2024","1/1/2024","1/1/2024","ACME","Acme","Buy","10","$10.00","($100.00)"',
  ].join("\n");

  const trades = analyzeTrades(parseRobinhoodCsv(csv));
  const recentBuy = trades.find((trade) => trade.date === "2024-03-01")!;
  const preSplitBuy = trades.find((trade) => trade.date === "2024-01-01")!;

  assert.equal(recentBuy.referencePrice, 20);
  assert.equal(recentBuy.outcomePct, 0);
  assert.equal(recentBuy.normalizedPrice, 20);
  assert.equal(preSplitBuy.normalizedQuantity, 20);
  assert.equal(preSplitBuy.normalizedPrice, 5);
  assert.equal(preSplitBuy.outcomePct, 300);
});

test("does not create rated equity trades for options or cash events", () => {
  const csv = [
    header,
    '"1/1/2024","1/1/2024","1/1/2024","ACME","Acme call","BTO","1","$1.00","($100.00)"',
    '"1/2/2024","1/2/2024","1/2/2024","","ACH Deposit","ACH","","","$100.00"',
  ].join("\n");

  assert.deepEqual(analyzeTrades(parseRobinhoodCsv(csv)), []);
});

test("compares a buy with the same dollars invested in SPY and factors the edge into its score", () => {
  const csv = [
    header,
    '"1/1/2024","1/1/2024","1/1/2024","ACME","Acme","Buy","10","$10.00","($100.00)"',
  ].join("\n");
  const transactions = parseRobinhoodCsv(csv);
  const localOnly = analyzeTrades(transactions)[0];
  const withMarket = analyzeTrades(transactions, {
    currentPrices: { ACME: 12, SPY: 55 },
    spyDailyPrices: [
      { date: "2024-01-01", adjustedClose: 50 },
      { date: "2024-03-01", adjustedClose: 55 },
    ],
    asOfDate: "2024-03-01",
  })[0];

  assert.equal(withMarket.currentValue, 120);
  assert.equal(withMarket.spyEntryPrice, 50);
  assert.equal(withMarket.spyShares, 2);
  assert.equal(withMarket.spyValue, 110);
  assert.equal(withMarket.spyReturnPct, 10);
  assert.equal(withMarket.excessReturnPct, 10);
  assert.ok(withMarket.score > localOnly.score);
  assert.match(withMarket.summary, /ahead of.*SPY/);
});

test("rewards a sale when the exited stock subsequently underperforms SPY", () => {
  const csv = [
    header,
    '"1/1/2024","1/1/2024","1/1/2024","ACME","Acme","Buy","10","$10.00","($100.00)"',
    '"2/1/2024","2/1/2024","2/1/2024","ACME","Acme","Sell","10","$15.00","$150.00"',
  ].join("\n");
  const transactions = parseRobinhoodCsv(csv);
  const localSale = analyzeTrades(transactions).find((trade) => trade.side === "Sell")!;
  const marketSale = analyzeTrades(transactions, {
    currentPrices: { SPY: 66 },
    spyDailyPrices: [
      { date: "2024-02-01", adjustedClose: 60 },
      { date: "2024-03-01", adjustedClose: 66 },
    ],
    exitedDailyPrices: {
      ACME: [
        { date: "2024-02-01", adjustedClose: 15 },
        { date: "2024-03-01", adjustedClose: 10 },
      ],
    },
    asOfDate: "2024-03-01",
  }).find((trade) => trade.side === "Sell")!;

  assert.equal(marketSale.adjustedExitPrice, 15);
  assert.equal(marketSale.postExitCurrentPrice, 10);
  assert.ok(Math.abs((marketSale.postExitReturnPct || 0) + 33.3333) < 0.001);
  assert.equal(marketSale.postExitSpyReturnPct, 10);
  assert.ok(Math.abs((marketSale.exitEdgePct || 0) - 43.3333) < 0.001);
  assert.ok(marketSale.score > localSale.score);
  assert.match(marketSale.summary, /supporting the decision to leave/);
});
