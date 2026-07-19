import assert from "node:assert/strict";
import test from "node:test";
import { parseRobinhoodCsv } from "../lib/importers/robinhood";
import { buildSpyBenchmark } from "../lib/portfolio/spy-benchmark";

const header = '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"';

test("matches open and realized stock lots with proportional SPY lots", () => {
  const csv = [
    header,
    '"1/1/2024","1/1/2024","1/1/2024","ACME","Acme","Buy","10","$10.00","($100.00)"',
    '"2/1/2024","2/1/2024","2/1/2024","ACME","Acme","Sell","5","$15.00","$75.00"',
  ].join("\n");
  const benchmark = buildSpyBenchmark(
    parseRobinhoodCsv(csv),
    [
      { date: "2024-01-01", adjustedClose: 50 },
      { date: "2024-02-01", adjustedClose: 60 },
    ],
    70,
  );

  assert.equal(benchmark.coveragePct, 100);
  assert.equal(benchmark.realizedCost, 50);
  assert.equal(benchmark.actualRealizedValue, 75);
  assert.equal(benchmark.actualRealizedGain, 25);
  assert.equal(benchmark.spyRealizedValue, 60);
  assert.equal(benchmark.spyRealizedGain, 10);
  assert.equal(benchmark.openCost, 50);
  assert.equal(benchmark.spyOpenShares, 1);
  assert.equal(benchmark.spyOpenValue, 70);
  assert.equal(benchmark.spyUnrealizedGain, 20);
});

test("stock splits change lot quantities without changing equivalent SPY shares", () => {
  const csv = [
    header,
    '"1/1/2024","1/1/2024","1/1/2024","ACME","Acme","Buy","10","$10.00","($100.00)"',
    '"1/15/2024","1/15/2024","1/15/2024","ACME","Acme","SPL","10","",""',
    '"2/1/2024","2/1/2024","2/1/2024","ACME","Acme","Sell","10","$8.00","$80.00"',
  ].join("\n");
  const benchmark = buildSpyBenchmark(
    parseRobinhoodCsv(csv),
    [
      { date: "2024-01-01", adjustedClose: 50 },
      { date: "2024-02-01", adjustedClose: 60 },
    ],
    70,
  );

  assert.equal(benchmark.realizedCost, 50);
  assert.equal(benchmark.spyRealizedGain, 10);
  assert.equal(benchmark.spyOpenShares, 1);
});
