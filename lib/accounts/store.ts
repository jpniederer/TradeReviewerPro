import type { Transaction } from "../importers/robinhood";
import {
  PORTFOLIO_STORE,
  deleteLocalValue,
  readLocalValue,
  writeLocalValue,
} from "../storage/database";

export type PortfolioAccount = {
  id: string;
  name: string;
  transactions: Transaction[];
  createdAt: string;
  updatedAt: string;
};

const ACCOUNTS_KEY = "accounts";
const LEGACY_TRANSACTIONS_KEY = "transactions";

export function createPortfolioAccount(
  name: string,
  transactions: Transaction[],
): PortfolioAccount {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: name.trim() || "Robinhood account",
    transactions,
    createdAt: now,
    updatedAt: now,
  };
}

export async function loadPortfolioAccounts() {
  const stored = await readLocalValue<PortfolioAccount[]>(PORTFOLIO_STORE, ACCOUNTS_KEY);
  if (Array.isArray(stored) && stored.length) return stored;

  const legacy = await readLocalValue<Transaction[]>(
    PORTFOLIO_STORE,
    LEGACY_TRANSACTIONS_KEY,
  );
  if (!Array.isArray(legacy) || !legacy.length) return [];
  const migrated: PortfolioAccount = {
    id: "migrated-main-account",
    name: "Main account",
    transactions: legacy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await savePortfolioAccounts([migrated]);
  await deleteLocalValue(PORTFOLIO_STORE, LEGACY_TRANSACTIONS_KEY);
  return [migrated];
}

export function savePortfolioAccounts(accounts: PortfolioAccount[]) {
  return writeLocalValue(PORTFOLIO_STORE, ACCOUNTS_KEY, accounts);
}
