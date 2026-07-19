import { twelveDataProvider } from "./providers/twelve-data";
import { yahooProvider } from "./providers/yahoo";
import type {
  CurrentQuote,
  DailyPrice,
  PricingProvider,
  PricingProviderId,
  PricingRequestOptions,
} from "./types";

export type {
  CurrentQuote,
  DailyPrice,
  PricingProvider,
  PricingProviderId,
  PricingRequestOptions,
} from "./types";

export const pricingProviders: Record<PricingProviderId, PricingProvider> = {
  yahoo: yahooProvider,
  "twelve-data": twelveDataProvider,
};

export const DEFAULT_PRICING_PROVIDER: PricingProviderId = "twelve-data";

export function getPricingProvider(providerId: PricingProviderId = DEFAULT_PRICING_PROVIDER) {
  return pricingProviders[providerId];
}

export function getCurrentQuotes(
  symbols: string[],
  providerId: PricingProviderId = DEFAULT_PRICING_PROVIDER,
  options?: PricingRequestOptions,
): Promise<CurrentQuote[]> {
  return getPricingProvider(providerId).getCurrentQuotes(symbols, options);
}

export function getDailyPrices(
  symbol: string,
  startDate: string,
  endDate?: string,
  providerId: PricingProviderId = DEFAULT_PRICING_PROVIDER,
  options?: PricingRequestOptions,
): Promise<DailyPrice[]> {
  return getPricingProvider(providerId).getDailyPrices(symbol, startDate, endDate, options);
}
