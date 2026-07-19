import Papa from "papaparse";

export type TransactionType =
  | "buy"
  | "sell"
  | "dividend"
  | "split"
  | "transfer_in"
  | "transfer_out"
  | "return_of_capital"
  | "option"
  | "cash";

export type Transaction = {
  id: string;
  brokerage: "robinhood";
  ticker: string;
  date: string;
  type: TransactionType;
  quantity: number;
  price: number;
  amount: number;
  rawCode: string;
  description: string;
};

type RobinhoodRow = {
  "Activity Date"?: string;
  "Process Date"?: string;
  Instrument?: string;
  Description?: string;
  "Trans Code"?: string;
  Quantity?: string;
  Price?: string;
  Amount?: string;
};

const REQUIRED_HEADERS = ["Activity Date", "Instrument", "Trans Code", "Quantity", "Price", "Amount"];
const DIVIDEND_CODES = new Set(["CDIV", "DIV", "MDIV", "INT", "SLIP"]);
const OPTION_CODES = new Set(["BTO", "BTC", "STC", "STO", "OEXP", "OASGN", "EXP"]);
const CORPORATE_ACTION_CODES = new Set(["MRGS", "SPR", "SXCH"]);

function parseNumber(value = "") {
  const normalized = value.replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return value.includes("(") ? -Math.abs(parsed) : parsed;
}

function parseRobinhoodDate(value = "") {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, month, day, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) return null;
  return date.toISOString().slice(0, 10);
}

function mapTransactionType(code: string, quantityText: string): TransactionType {
  if (code === "BUY") return "buy";
  if (code === "SELL") return "sell";
  if (DIVIDEND_CODES.has(code)) return "dividend";
  if (code === "SPL") return "split";
  if (code === "REC") return "transfer_in";
  if (code === "ROC") return "return_of_capital";
  if (OPTION_CODES.has(code)) return "option";
  if (CORPORATE_ACTION_CODES.has(code)) {
    return /S$/i.test(quantityText.trim()) ? "transfer_out" : "transfer_in";
  }
  return "cash";
}

function transactionId(parts: string[]) {
  let hash = 2166136261;
  const input = parts.join("|");
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `rh-${(hash >>> 0).toString(36)}`;
}

export function parseRobinhoodCsv(text: string): Transaction[] {
  const parsed = Papa.parse<RobinhoodRow>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
  });

  const headers = parsed.meta.fields || [];
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length) {
    throw new Error(`This does not look like a Robinhood transaction export. Missing: ${missingHeaders.join(", ")}.`);
  }

  const structuralError = parsed.errors.find((error) =>
    error.code === "MissingQuotes" || error.code === "UndetectableDelimiter"
  );
  if (structuralError) {
    throw new Error(`The CSV could not be read: ${structuralError.message}`);
  }

  return parsed.data.flatMap((row, index) => {
    const date = parseRobinhoodDate(row["Activity Date"] || row["Process Date"]);
    const rawCode = (row["Trans Code"] || "").trim().toUpperCase();
    if (!date || !rawCode) return [];

    const quantityText = (row.Quantity || "").trim();
    const ticker = (row.Instrument || "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "") || "CASH";
    const quantity = Math.abs(parseNumber(quantityText));
    const price = Math.abs(parseNumber(row.Price));
    const amount = Math.abs(parseNumber(row.Amount)) || quantity * price;
    const type = mapTransactionType(rawCode, quantityText);
    const description = (row.Description || "").trim();

    return [{
      id: transactionId([date, ticker, rawCode, quantityText, row.Price || "", row.Amount || "", String(index)]),
      brokerage: "robinhood" as const,
      ticker,
      date,
      type,
      quantity,
      price,
      amount,
      rawCode,
      description,
    }];
  });
}
