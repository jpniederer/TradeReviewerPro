import assert from "node:assert/strict";
import test from "node:test";
import { createPortfolioAccount } from "../lib/accounts/store";
import { parseRobinhoodCsv } from "../lib/importers/robinhood";

test("binds one parsed CSV transaction set to a named local account", () => {
  const csv = [
    '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"',
    '"1/1/2024","1/1/2024","1/1/2024","ACME","Acme","Buy","10","$10.00","($100.00)"',
  ].join("\n");
  const transactions = parseRobinhoodCsv(csv);
  const account = createPortfolioAccount("Roth IRA", transactions);

  assert.equal(account.name, "Roth IRA");
  assert.equal(account.transactions, transactions);
  assert.ok(account.id);
  assert.ok(account.createdAt);
});
