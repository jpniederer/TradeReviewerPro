import { MARKET_STORE, readLocalValue, writeLocalValue } from "../storage/database";
import {
  getCurrentQuotes,
  getDailyPrices,
  type CurrentQuote,
  type DailyPrice,
  type PricingProviderId,
  type PricingRequestOptions,
} from "./index";

type CachedQuote = { fetchedAt: number; quote: CurrentQuote };
type CachedSeries = {
  fetchedAt: number;
  startDate: string;
  endDate: string;
  prices: DailyPrice[];
};

export async function readCachedCurrentQuotes(
  symbols: string[],
  providerId: PricingProviderId,
) {
  const uniqueSymbols = [...new Set(
    symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
  )];
  const cached = await Promise.all(uniqueSymbols.map(async (symbol) => (
    readLocalValue<CachedQuote>(MARKET_STORE, `quote:${providerId}:${symbol}`)
  )));
  return cached.flatMap((value) => value ? [value.quote] : []);
}

export async function getCachedCurrentQuotes(
  symbols: string[],
  providerId: PricingProviderId,
  options?: PricingRequestOptions,
  cacheOptions?: { refresh?: boolean },
) {
  const uniqueSymbols = [...new Set(
    symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
  )];
  const cached = await Promise.all(uniqueSymbols.map(async (symbol) => {
    const key = `quote:${providerId}:${symbol}`;
    return { symbol, key, value: await readLocalValue<CachedQuote>(MARKET_STORE, key) };
  }));
  const staleSymbols = cached
    .filter(({ value }) => cacheOptions?.refresh || !value)
    .map(({ symbol }) => symbol);

  const fetched: CurrentQuote[] = [];
  if (staleSymbols.length) {
    try {
      const batchSize = providerId === "twelve-data" ? 8 : staleSymbols.length;
      for (let index = 0; index < staleSymbols.length; index += batchSize) {
        const batch = await getCurrentQuotes(
          staleSymbols.slice(index, index + batchSize),
          providerId,
          options,
        );
        fetched.push(...batch);
        await Promise.all(batch.map((quote) => writeLocalValue(
          MARKET_STORE,
          `quote:${providerId}:${quote.symbol}`,
          { fetchedAt: Date.now(), quote } satisfies CachedQuote,
        )));
      }
    } catch (error) {
      const available = [
        ...cached.flatMap(({ value }) => value ? [value.quote] : []),
        ...fetched,
      ];
      if (!available.length) throw error;
      const bySymbol = new Map(available.map((quote) => [quote.symbol, quote]));
      return uniqueSymbols.flatMap((symbol) => bySymbol.get(symbol) || []);
    }
  }

  const bySymbol = new Map(
    cached.flatMap(({ value }) => value ? [[value.quote.symbol, value.quote] as const] : []),
  );
  fetched.forEach((quote) => bySymbol.set(quote.symbol, quote));
  return uniqueSymbols.flatMap((symbol) => bySymbol.get(symbol) || []);
}

export async function readCachedDailyPrices(
  symbol: string,
  startDate: string,
  endDate: string,
  providerId: PricingProviderId,
) {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const cached = await readLocalValue<CachedSeries>(
    MARKET_STORE,
    `daily:${providerId}:${normalizedSymbol}`,
  );
  return (cached?.prices || []).filter(
    (price) => price.date >= startDate && price.date <= endDate,
  );
}

export async function getCachedDailyPrices(
  symbol: string,
  startDate: string,
  endDate: string,
  providerId: PricingProviderId,
  options?: PricingRequestOptions,
) {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const key = `daily:${providerId}:${normalizedSymbol}`;
  const cached = await readLocalValue<CachedSeries>(MARKET_STORE, key);
  if (cached && cached.startDate <= startDate && cached.endDate >= endDate) {
    return cached.prices.filter((price) => price.date >= startDate && price.date <= endDate);
  }

  const requestStart = cached && cached.startDate <= startDate
    ? new Date(`${cached.endDate}T00:00:00Z`).toISOString().slice(0, 10)
    : startDate;
  const fetched = await getDailyPrices(
    normalizedSymbol,
    requestStart,
    endDate,
    providerId,
    options,
  );
  const byDate = new Map((cached?.prices || []).map((price) => [price.date, price]));
  fetched.forEach((price) => byDate.set(price.date, price));
  const prices = [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  const record: CachedSeries = {
    fetchedAt: Date.now(),
    startDate: cached && cached.startDate < startDate ? cached.startDate : startDate,
    endDate,
    prices,
  };
  await writeLocalValue(MARKET_STORE, key, record);
  return prices.filter((price) => price.date >= startDate && price.date <= endDate);
}
