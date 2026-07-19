export type PricingProviderId = "yahoo" | "twelve-data";

export type CurrentQuote = {
  symbol: string;
  price: number;
  currency: string;
  asOf: string;
  marketState?: string;
};

export type DailyPrice = {
  date: string;
  close: number;
  adjustedClose: number;
};

export type PricingRequestOptions = {
  apiKey?: string;
  signal?: AbortSignal;
  beforeRequest?: (credits: number) => Promise<void>;
};

export interface PricingProvider {
  id: PricingProviderId;
  name: string;
  requiresApiKey: boolean;
  getCurrentQuotes(
    symbols: string[],
    options?: PricingRequestOptions,
  ): Promise<CurrentQuote[]>;
  getDailyPrices(
    symbol: string,
    startDate: string,
    endDate?: string,
    options?: PricingRequestOptions,
  ): Promise<DailyPrice[]>;
}
