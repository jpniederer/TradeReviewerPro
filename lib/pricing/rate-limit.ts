const TWELVE_DATA_CREDIT_LIMIT = 8;
const TWELVE_DATA_WINDOW_MS = 60_000;
const TWELVE_DATA_LEDGER_KEY = "trade-reviewer-pro:twelve-data-credit-ledger";

export function calculateCreditDelay(
  timestamps: number[],
  credits: number,
  now = Date.now(),
) {
  if (credits > TWELVE_DATA_CREDIT_LIMIT) {
    throw new Error(`A Twelve Data request cannot use more than ${TWELVE_DATA_CREDIT_LIMIT} credits.`);
  }
  const active = timestamps
    .filter((timestamp) => now - timestamp < TWELVE_DATA_WINDOW_MS)
    .sort((left, right) => left - right);
  if (active.length + credits <= TWELVE_DATA_CREDIT_LIMIT) return 0;
  const creditsToExpire = active.length + credits - TWELVE_DATA_CREDIT_LIMIT;
  return Math.max(0, active[creditsToExpire - 1] + TWELVE_DATA_WINDOW_MS - now + 100);
}

function activeLedger(now: number) {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(TWELVE_DATA_LEDGER_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((timestamp): timestamp is number =>
          typeof timestamp === "number" && now - timestamp < TWELVE_DATA_WINDOW_MS
        )
      : [];
  } catch {
    return [];
  }
}

function wait(delay: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, delay);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Pricing request cancelled.", "AbortError"));
    }, { once: true });
  });
}

export async function waitForTwelveDataCredits(
  credits: number,
  signal?: AbortSignal,
  onWait?: (milliseconds: number) => void,
) {
  while (true) {
    if (signal?.aborted) throw new DOMException("Pricing request cancelled.", "AbortError");
    const now = Date.now();
    const ledger = activeLedger(now);
    const delay = calculateCreditDelay(ledger, credits, now);
    if (!delay) {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(
          TWELVE_DATA_LEDGER_KEY,
          JSON.stringify([...ledger, ...Array.from({ length: credits }, () => now)]),
        );
      }
      return;
    }
    onWait?.(delay);
    await wait(delay, signal);
  }
}
