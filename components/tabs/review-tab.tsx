import { useMemo, useState } from "react";
import { DecisionMap, ExitTimingChart, OutcomeDistribution } from "../trade-insight-charts";
import type { TradeAnalysis } from "../../hooks/use-trade-analysis";
import type { RatedTrade, TradeSide } from "../../lib/trade-review/analyzer";
import { friendlyDate, money, percent, scoreTone } from "../../lib/ui/format";

type TradeSort = "date" | "ticker" | "side" | "amount" | "outcome" | "score";
type SortDirection = "asc" | "desc";
const TRADE_PAGE_SIZE = 20;

type ReviewTabProps = {
  analysis: TradeAnalysis;
  isDemo: boolean;
  spyPriceCount: number;
  onSelectTrade: (trade: RatedTrade) => void;
};

export function ReviewTab({ analysis, isDemo, spyPriceCount, onSelectTrade }: ReviewTabProps) {
  const [query, setQuery] = useState("");
  const [side, setSide] = useState<"all" | Lowercase<TradeSide>>("all");
  const [sort, setSort] = useState<TradeSort>("date");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const { ratedTrades, reviewHeadline, tradeScore, spyBenchmark, totalValue, scoreMetrics, bestTrade, closedSales, profitableSales, averageHoldingDays, heldTrades } = analysis;
  const filteredTrades = useMemo(() => {
    const normalizedQuery = query.trim().toUpperCase();
    return ratedTrades.filter((trade) => (!normalizedQuery || trade.ticker.includes(normalizedQuery) || trade.description.toUpperCase().includes(normalizedQuery)) && (side === "all" || trade.side.toLowerCase() === side)).sort((left, right) => {
      let comparison = 0;
      if (sort === "date") comparison = left.date.localeCompare(right.date);
      if (sort === "ticker") comparison = left.ticker.localeCompare(right.ticker);
      if (sort === "side") comparison = left.side.localeCompare(right.side);
      if (sort === "amount") comparison = left.amount - right.amount;
      if (sort === "score") comparison = left.score - right.score;
      if (sort === "outcome") {
        if (left.outcomePct === null) return 1;
        if (right.outcomePct === null) return -1;
        comparison = left.outcomePct - right.outcomePct;
      }
      return direction === "asc" ? comparison : -comparison;
    });
  }, [direction, query, ratedTrades, side, sort]);
  const pages = Math.max(1, Math.ceil(filteredTrades.length / TRADE_PAGE_SIZE));
  const visibleTrades = filteredTrades.slice((page - 1) * TRADE_PAGE_SIZE, page * TRADE_PAGE_SIZE);
  function changeSort(nextSort: TradeSort) {
    setPage(1);
    if (sort === nextSort) setDirection((current) => current === "asc" ? "desc" : "asc");
    else { setSort(nextSort); setDirection(nextSort === "ticker" || nextSort === "side" ? "asc" : "desc"); }
  }
  const marker = (column: TradeSort) => sort === column ? direction === "asc" ? " ↑" : " ↓" : "";

  return (
    <section className="review-page">
      <p className="kicker">YOUR INVESTING CAREER REVIEW</p>
      <div className="review-title"><h1>{reviewHeadline[0]}<br /><em>{reviewHeadline[1]}</em></h1><div className="big-score"><span>{tradeScore || "—"}</span><p>OUT OF 100<br /><strong>{tradeScore >= 75 ? "STRONG" : tradeScore >= 58 ? "DEVELOPING" : "REVIEW"}</strong></p></div></div>
      {!isDemo && <section className="benchmark-overview" aria-labelledby="benchmark-overview-title">
        <div className="benchmark-overview-head"><div><p className="kicker">THE LAZY PORTFOLIO</p><h2 id="benchmark-overview-title">Your decisions versus simply owning SPY.</h2></div><span>{spyBenchmark.coveragePct.toFixed(0)}% CASH-FLOW COVERAGE</span></div>
        <div className="benchmark-overview-grid">
          <article><p className="label">OPEN HOLDINGS TODAY</p><div><span>YOUR HOLDINGS</span><strong>{money(totalValue, 2)}</strong></div><div><span>LAZY SPY HOLDINGS</span><strong>{spyBenchmark.spyOpenValue === null ? "—" : money(spyBenchmark.spyOpenValue, 2)}</strong></div>{spyBenchmark.spyOpenValue !== null && <p className={totalValue >= spyBenchmark.spyOpenValue ? "positive" : "negative"}>{totalValue - spyBenchmark.spyOpenValue >= 0 ? "+" : ""}{money(totalValue - spyBenchmark.spyOpenValue, 2)} versus SPY</p>}</article>
          <article><p className="label">REALIZED TRADING P/L</p><div><span>YOUR REALIZED P/L</span><strong className={spyBenchmark.actualRealizedGain >= 0 ? "positive" : "negative"}>{spyBenchmark.actualRealizedGain >= 0 ? "+" : ""}{money(spyBenchmark.actualRealizedGain, 2)}</strong></div><div><span>SPY REALIZED P/L</span><strong className={spyBenchmark.spyRealizedGain >= 0 ? "positive" : "negative"}>{spyBenchmark.spyRealizedGain >= 0 ? "+" : ""}{money(spyBenchmark.spyRealizedGain, 2)}</strong></div>{spyBenchmark.realizedCost > 0 && <p className={spyBenchmark.actualRealizedGain >= spyBenchmark.spyRealizedGain ? "positive" : "negative"}>{spyBenchmark.actualRealizedGain - spyBenchmark.spyRealizedGain >= 0 ? "+" : ""}{money(spyBenchmark.actualRealizedGain - spyBenchmark.spyRealizedGain, 2)} realized edge</p>}</article>
          <article className="benchmark-method"><p className="label">MATCHED CASH FLOWS</p><strong>{spyBenchmark.spyOpenShares.toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong><span>hypothetical SPY shares still held</span><dl><div><dt>Open matched cost</dt><dd>{money(spyBenchmark.openCost, 2)}</dd></div><div><dt>Realized matched cost</dt><dd>{money(spyBenchmark.realizedCost, 2)}</dd></div></dl></article>
        </div><p className="benchmark-footnote">Each buy creates a same-dollar fractional SPY lot. Each stock sale liquidates the proportional SPY lot on that date. Holdings not fetched yet use their latest imported price, while SPY uses adjusted daily history.</p>
      </section>}
      <div className="score-grid">{scoreMetrics.map(({ name, score, copy }) => <article key={name}><div><p className="label">{name}</p><strong>{score}</strong></div><div className="meter"><i style={{ width: `${score}%` }} /></div><p>{copy}</p></article>)}</div>
      <p className="score-method-note">Overall score: 60% average execution rating and 40% equal-weighted market edge, patience, DCA discipline, realized edge, and exit timing.</p>
      <section className="insight-charts" aria-labelledby="insight-charts-title"><div className="insight-charts-heading"><div><p className="kicker">PATTERNS IN YOUR DECISIONS</p><h2 id="insight-charts-title">Your trading history, drawn out.</h2></div><p>Bubble size represents dollars committed. Positive SPY-relative values indicate an advantage over passive investing.</p></div><div className="insight-chart-grid"><article className="insight-chart-card decision-chart-card"><div><p className="label">BUY DECISION MAP</p><h3>Where your entries created an edge</h3></div><DecisionMap trades={ratedTrades} /></article><article className="insight-chart-card exit-chart-card"><div><p className="label">EXIT TIMING</p><h3>Falling knives avoided—and upside missed</h3></div><ExitTimingChart trades={ratedTrades} /></article><article className="insight-chart-card distribution-chart-card"><div><p className="label">OUTCOME DISTRIBUTION</p><h3>How often your trades landed in each return range</h3></div><OutcomeDistribution trades={ratedTrades} /></article></div></section>
      <div className="review-metrics"><article><p className="label">BEST-RATED EXECUTION</p><h2>{bestTrade?.ticker || "—"}</h2><strong className="positive">{percent(bestTrade?.outcomePct ?? null)} · {bestTrade?.grade || "—"}</strong><p>{bestTrade ? `${bestTrade.side} on ${friendlyDate(bestTrade.date)}.` : "Import trades to calculate ratings."}</p></article><article><p className="label">PROFITABLE SALES</p><h2>{closedSales.length ? `${Math.round((profitableSales.length / closedSales.length) * 100)}%` : "—"}</h2><strong>{profitableSales.length} of {closedSales.length} rated exits</strong><p>Based on matched cost basis contained in the export.</p></article><article><p className="label">AVG. OBSERVED HOLD</p><h2>{averageHoldingDays ? `${averageHoldingDays} days` : "—"}</h2><strong>Across {heldTrades.length} rated executions</strong><p>Open trades are measured through the latest activity date.</p></article></div>
      <section className="trade-ledger" aria-labelledby="trade-ledger-title">
        <div className="trade-ledger-heading"><div><p className="kicker">DECISION-BY-DECISION</p><h2 id="trade-ledger-title">Every trade, reviewed.</h2><p>{ratedTrades.length.toLocaleString()} stock executions scored from the evidence available in this export.</p></div><div className="trade-method"><span>{spyPriceCount ? "MARKET-AWARE" : "LOCAL HEURISTIC"}</span><p>{spyPriceCount ? "Current quotes + same-dollar SPY benchmark" : "Waiting for cached market data"}</p></div></div>
        <div className="trade-controls"><label className="trade-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search ticker or company" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} aria-label="Search trades" /></label><div className="side-filter" aria-label="Filter by trade side">{(["all", "buy", "sell"] as const).map((value) => <button key={value} className={side === value ? "selected" : ""} onClick={() => { setSide(value); setPage(1); }}>{value}</button>)}</div><label className="mobile-sort"><span>Sort</span><select value={sort} onChange={(event) => { setSort(event.target.value as TradeSort); setPage(1); }}><option value="date">Date</option><option value="ticker">Ticker</option><option value="amount">Size</option><option value="outcome">Outcome</option><option value="score">Rating</option></select></label></div>
        <div className="trade-table"><div className="trade-table-head"><button onClick={() => changeSort("date")}>Date{marker("date")}</button><button onClick={() => changeSort("ticker")}>Trade{marker("ticker")}</button><button className="trade-qty" onClick={() => changeSort("side")}>Side / shares{marker("side")}</button><button className="trade-amount" onClick={() => changeSort("amount")}>Position size{marker("amount")}</button><button className="trade-outcome" onClick={() => changeSort("outcome")}>Observed outcome{marker("outcome")}</button><button onClick={() => changeSort("score")}>Rating{marker("score")}</button></div>
          {visibleTrades.map((trade) => <button className="trade-row" key={trade.id} onClick={() => onSelectTrade(trade)}><span className="trade-date">{friendlyDate(trade.date)}</span><span className="trade-symbol"><i>{trade.ticker.slice(0, 1)}</i><b>{trade.ticker}<small>{trade.status}</small></b></span><span className="trade-qty"><b className={`side-pill ${trade.side.toLowerCase()}`}>{trade.side}</b><small>{trade.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares</small></span><span className="trade-amount"><b>{money(trade.amount, 2)}</b><small>@ {money(trade.price, 2)}</small></span><span className={`trade-outcome ${trade.outcomePct !== null && trade.outcomePct >= 0 ? "positive" : trade.outcomePct === null ? "" : "negative"}`}><b>{percent(trade.outcomePct)}</b><small>{trade.holdingDays === null ? trade.referenceLabel : `${trade.holdingDays} day${trade.holdingDays === 1 ? "" : "s"} observed`}</small>{trade.excessReturnPct !== null && <small className={`spy-edge ${trade.excessReturnPct >= 0 ? "positive" : "negative"}`}>{trade.excessReturnPct >= 0 ? "+" : ""}{trade.excessReturnPct.toFixed(1)} pts vs SPY</small>}{trade.exitEdgePct !== null && <small className={`spy-edge ${trade.exitEdgePct >= 0 ? "positive" : "negative"}`}>{trade.exitEdgePct >= 0 ? "+" : ""}{trade.exitEdgePct.toFixed(1)} pts after exit</small>}</span><span className="trade-rating"><b className={`rating-badge ${scoreTone(trade.score)}`}>{trade.grade}</b><small>{trade.verdict}</small><i aria-hidden="true">›</i></span></button>)}
          {!visibleTrades.length && <div className="trade-empty"><strong>No matching trades</strong><p>Try another ticker or clear the current side filter.</p></div>}
        </div>
        <div className="trade-pagination"><p>Showing {filteredTrades.length ? (page - 1) * TRADE_PAGE_SIZE + 1 : 0}–{Math.min(page * TRADE_PAGE_SIZE, filteredTrades.length)} of {filteredTrades.length.toLocaleString()}</p><div><button disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Previous</button><span>Page {page} of {pages}</span><button disabled={page === pages} onClick={() => setPage((current) => Math.min(pages, current + 1))}>Next →</button></div></div>
        <p className="rating-disclaimer">Ratings are educational heuristics, not investment advice. Priority open positions use current provider quotes when available; other positions retain the latest trade price from the import. SPY comparisons use adjusted daily history and fractional shares.</p>
      </section>
    </section>
  );
}
