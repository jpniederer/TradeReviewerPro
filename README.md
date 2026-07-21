# TradeReviewerPro

TradeReviewerPro is a privacy-first trade review application for Robinhood
transaction exports. It reconstructs portfolio holdings, cost basis, realized
and unrealized gains, and behavioral investing insights entirely in the
browser.

## Accounts

Each Robinhood CSV is stored as one named local account. The account selector
rebuilds holdings, scores, SPY comparisons, and charts from only that account's
transactions. A new CSV can create another account or replace the selected
account's transaction history. Existing single-account data is migrated into a
`Main account` automatically.

Settings can delete only the selected account while retaining other accounts
and reusable market caches, or delete all local TradeReviewerPro data,
including accounts, market caches, API keys, and preferences.

## Privacy

Transaction files are parsed locally and stored only in the browser's
IndexedDB. The application does not upload brokerage data to a server. When
market pricing is enabled, only ticker symbols and a SPY date range are sent to
the selected pricing provider; quantities and transactions remain local.

## Market pricing

Twelve Data is the default browser-compatible pricing engine and uses a
user-supplied key stored only in that browser. The Yahoo adapter remains behind
the provider interface, but is disabled in the browser settings because Yahoo
blocks direct cross-origin requests.

Missing or unsupported tickers are recorded as unavailable instead of failing
an entire quote or exited-history batch. Successful symbols in a partial batch
remain usable and cached.

Both engines implement the same provider interface:

```ts
getCurrentQuotes(symbols, providerId, options)
getDailyPrices(symbol, startDate, endDate, providerId, options)
```

The free-tier planner treats eight symbols as one full credit window. It
prioritizes a current SPY quote plus the seven largest estimated holdings,
records those credits locally, and queues historical SPY data until the next
available window. Current quotes are saved in IndexedDB and reused until the
user chooses **Refresh prices**, so a portfolio can keep using its last known
prices for days without making a provider request. Daily SPY prices are merged
into an IndexedDB history so subsequent visits request only the range that is
not already available locally. A manual **Fetch next** action
adds up to eight more holdings, persists that coverage locally, and splits
future refreshes into rate-safe eight-credit batches. Holdings not yet fetched
retain their latest imported price and are labeled accordingly.

Exited tickers are a separate, lower-priority queue. They remain locked until
every held position has been attempted. Each manual exited batch adds up to
eight split-adjusted daily series, allowing sale ratings to compare the stock's
post-exit return with SPY over the same period.

## SPY benchmark

The Trade Review builds a FIFO, cash-flow-matched "lazy SPY" portfolio. Each
stock purchase creates a fractional SPY lot using the same dollars and the next
available adjusted daily SPY price. A stock sale realizes the proportional SPY
lot on the same date. Unsold SPY lots form the hypothetical current holdings;
sold lots form the comparable realized SPY gain or loss. The overall score
combines execution ratings with derived market-edge, holding-patience, DCA, and
realized-edge metrics. Once exited-ticker data is available, post-sale
performance also contributes an exit-timing metric and up to ±15 points on the
individual sale.

## Local development

Requirements:

- Node.js 22.13 or newer
- npm

```bash
npm install
npm run dev
```

Then open the local address shown in the terminal.

## Validation

```bash
npm run build
npm run lint
```

The `trade-files/` directory is intentionally ignored so personal brokerage
exports are never committed.
