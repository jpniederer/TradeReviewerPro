import assert from "node:assert/strict";
import test from "node:test";
import { parseRobinhoodCsv } from "../lib/importers/robinhood";
import { buildHoldings } from "../lib/portfolio/engine";

const header = '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"';

test("parses quoted multiline Robinhood descriptions as one transaction", () => {
  const csv = [
    header,
    '"7/13/2026","7/13/2026","7/14/2026","VUG","Vanguard Growth ETF',
    'CUSIP: 922908736',
    'Recurring","Buy","10","$10.00","($100.00)"',
    '"7/14/2026","7/14/2026","7/15/2026","VUG","Vanguard Growth ETF","Sell","2","$20.00","$40.00"',
    '"","","","","","","","","","Informational footer that is not a transaction."',
  ].join("\n");

  const transactions = parseRobinhoodCsv(csv);
  assert.equal(transactions.length, 2);
  assert.deepEqual(transactions.map((transaction) => transaction.type), ["buy", "sell"]);
  assert.equal(transactions[0].description.includes("CUSIP: 922908736"), true);
});

test("treats Robinhood split quantities as share additions", () => {
  const csv = [
    header,
    '"1/1/2024","1/1/2024","1/1/2024","NVDA","NVIDIA","Buy","10","$10.00","($100.00)"',
    '"6/10/2024","6/10/2024","6/10/2024","NVDA","NVIDIA","SPL","90","",""',
  ].join("\n");

  const result = buildHoldings(parseRobinhoodCsv(csv));
  assert.equal(result.holdings[0].quantity, 100);
  assert.equal(result.holdings[0].avg, 1);
});

test("excludes option contracts from equity holdings", () => {
  const csv = [
    header,
    '"10/28/2024","10/28/2024","10/28/2024","DJT","DJT Put","BTO","1","$0.77","($77.00)"',
    '"11/6/2024","11/6/2024","11/6/2024","DJT","DJT Put","STC","1","$0.08","$8.00"',
    '"3/7/2022","3/7/2022","3/7/2022","DNA","DNA Call","BTO","1","$0.60","($60.00)"',
    '"1/19/2024","1/19/2024","1/19/2024","DNA","DNA Call","OEXP","1S","",""',
  ].join("\n");

  const transactions = parseRobinhoodCsv(csv);
  assert.equal(transactions.every((transaction) => transaction.type === "option"), true);
  assert.deepEqual(buildHoldings(transactions).holdings, []);
});

test("moves cost basis through same-day symbol exchanges", () => {
  const csv = [
    header,
    '"1/1/2020","1/1/2020","1/1/2020","OLD","Old company","Buy","10","$10.00","($100.00)"',
    '"7/1/2020","7/1/2020","7/1/2020","NEW","New company","MRGS","2","",""',
    '"7/1/2020","7/1/2020","7/1/2020","OLD","Old company","MRGS","10S","",""',
  ].join("\n");

  const result = buildHoldings(parseRobinhoodCsv(csv));
  assert.equal(result.holdings.length, 1);
  assert.equal(result.holdings[0].ticker, "NEW");
  assert.equal(result.holdings[0].quantity, 2);
  assert.equal(result.holdings[0].avg, 50);
});
