import type { TradeAnalysis } from "../../hooks/use-trade-analysis";
import type { CurrentQuote } from "../../lib/pricing";
import { money } from "../../lib/ui/format";

type HoldingsTabProps = {
  analysis: TradeAnalysis;
  currentQuotes: Record<string, CurrentQuote>;
  pricedHoldingSymbols: Set<string>;
  quotesLoaded: boolean;
  isDemo: boolean;
  spyPriceCount: number;
};

export function HoldingsTab({ analysis, currentQuotes, pricedHoldingSymbols, quotesLoaded, isDemo, spyPriceCount }: HoldingsTabProps) {
  const { holdings, totalValue } = analysis;
  return (
    <section className="holdings-page">
      <div className="page-title"><div><p className="kicker">CURRENT PORTFOLIO</p><h1>Your holdings</h1></div><p>{holdings.length} active positions · {money(totalValue, 2)} total value</p></div>
      <div className="holdings-table">
        <div className="table-row table-head"><span>Company</span><span>Shares</span><span>Avg. cost</span><span>Market value</span><span>Total return</span></div>
        {holdings.map((holding) => <div className="table-row" key={holding.ticker}><span className="company"><i>{holding.ticker.slice(0, 1)}</i><b>{holding.name}<small>{holding.ticker}</small></b></span><span>{holding.quantity.toFixed(holding.quantity % 1 ? 3 : 0)}</span><span>{money(holding.avg, 2)}</span><span><b>{money(holding.value, 2)}</b>{currentQuotes[holding.ticker] ? <small className="price-source live">Current · {money(currentQuotes[holding.ticker].price, 2)}</small> : pricedHoldingSymbols.has(holding.ticker) ? <small className="price-source queued">{quotesLoaded ? "Current quote unavailable" : "Awaiting current quote"}</small> : <small className="price-source imported">Import price · not fetched yet</small>}</span><span className={holding.gain >= 0 ? "positive" : "negative"}><b>{holding.gain >= 0 ? "+" : ""}{money(holding.gain, 2)}</b><small>{holding.returnPct >= 0 ? "+" : ""}{holding.returnPct.toFixed(1)}%</small></span></div>)}
        {!holdings.length && <div className="empty">No open positions were found in this export.</div>}
      </div>
      {!isDemo && <p className="price-note">The first credit window covers SPY and your seven largest estimated holdings. Use “Fetch next” to price up to eight more positions per available window; progress is retained in this browser. Unfetched positions keep their latest imported price and remain clearly marked. Only ticker symbols and the SPY date range leave this browser; quantities and transactions stay local.{spyPriceCount ? ` ${spyPriceCount.toLocaleString()} SPY daily prices are cached on this device.` : ""}</p>}
    </section>
  );
}
