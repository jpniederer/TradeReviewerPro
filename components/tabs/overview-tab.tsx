import type { TradeAnalysis } from "../../hooks/use-trade-analysis";
import { money } from "../../lib/ui/format";

const demoCurve = [24, 25, 23, 28, 31, 30, 35, 41, 39, 46, 48, 55, 53, 63, 60, 70, 73, 82, 79, 91, 96];
const spyCurve = [24, 25, 26, 27, 29, 30, 31, 34, 35, 37, 39, 42, 43, 46, 48, 51, 53, 56, 58, 61, 64];

function Sparkline({ points, muted = false }: { points: number[]; muted?: boolean }) {
  const min = Math.min(...points), max = Math.max(...points);
  return (
    <div className={`sparkline ${muted ? "muted" : ""}`} aria-hidden="true">
      {points.slice(1).map((point, index) => {
        const left = (index / (points.length - 2)) * 100;
        const bottom = ((point - min) / Math.max(1, max - min)) * 80 + 8;
        const previousBottom = ((points[index] - min) / Math.max(1, max - min)) * 80 + 8;
        const dx = 100 / (points.length - 1);
        const angle = Math.atan2(bottom - previousBottom, dx) * (-180 / Math.PI);
        const length = Math.sqrt(dx * dx + (bottom - previousBottom) ** 2);
        return <i key={index} style={{ left: `${left}%`, bottom: `${previousBottom}%`, width: `${length}%`, transform: `rotate(${angle}deg)` }} />;
      })}
    </div>
  );
}

type OverviewTabProps = {
  analysis: TradeAnalysis;
  isDemo: boolean;
  purchaseCount: number;
  spyPriceCount: number;
  accountName?: string;
  onNavigate: (tab: "review" | "holdings") => void;
};

export function OverviewTab({ analysis, isDemo, purchaseCount, spyPriceCount, accountName, onNavigate }: OverviewTabProps) {
  const {
    totalValue, totalGain, returnPct, tradeScore, invested, unrealized, realized,
    holdings, top, spyBenchmark, largestAllocationPct, topFiveAllocationPct,
    allocationGradient, allocationItems, overviewReviewTitle, strongestMetric,
    weakestMetric, metricHeadlines,
  } = analysis;
  return (
    <>
      <section className="hero">
        <div>
          <p className="label">TOTAL PORTFOLIO VALUE</p><h1>{money(totalValue, 2)}</h1>
          <div className={`gain-line ${totalGain < 0 ? "loss" : ""}`}><span>{totalGain >= 0 ? "↗" : "↘"}</span><strong>{totalGain >= 0 ? "+" : ""}{money(totalGain, 2)}</strong><em>{returnPct >= 0 ? "+" : ""}{returnPct.toFixed(1)}%</em><small>all time</small></div>
        </div>
        <div className="hero-review"><span className="score">{tradeScore || 82}</span><div><p className="label">TRADEREVIEWER SCORE</p><strong>{tradeScore >= 75 ? "Strong investor" : tradeScore >= 58 ? "Developing investor" : "Review your process"}</strong><p>{spyPriceCount ? "Now includes your edge versus lazy SPY investing." : "Market comparison will appear after pricing loads."}</p></div></div>
      </section>
      <section className="summary-grid">
        <article><p className="label">NET INVESTED</p><strong>{money(invested)}</strong><small>Across {isDemo ? 83 : purchaseCount} purchases</small></article>
        <article><p className="label">UNREALIZED GAIN</p><strong className={unrealized >= 0 ? "positive" : "negative"}>{unrealized >= 0 ? "+" : ""}{money(unrealized)}</strong><small>{totalGain ? Math.round((unrealized / totalGain) * 100) : 0}% of your total gains</small></article>
        <article><p className="label">REALIZED GAIN</p><strong className={realized >= 0 ? "positive" : "negative"}>{realized >= 0 ? "+" : ""}{money(realized)}</strong><small>From closed positions & income</small></article>
        <article><p className="label">ACTIVE HOLDINGS</p><strong>{holdings.length}</strong><small>{top ? `${top.ticker} is your largest` : "Import trades to begin"}</small></article>
      </section>
      <section className="dashboard-grid">
        <article className="panel performance">
          <div className="panel-head"><div><p className="kicker">THE HEADLINE</p><h2>{isDemo ? "You beat the market." : spyBenchmark.spyOpenValue === null ? "Building your SPY comparison." : totalValue >= spyBenchmark.spyOpenValue ? "You beat lazy SPY." : "Lazy SPY is ahead."}</h2></div><div className="range"><button>1Y</button><button className="selected">ALL</button></div></div>
          {isDemo ? <><p className="panel-copy">Your timing-aware return is <strong>{Math.max(returnPct, 18.4).toFixed(1)}%</strong>, versus <strong>11.8%</strong> for the same cash flows invested in SPY.</p><div className="chart"><div className="grid-lines"><i /><i /><i /><i /></div><Sparkline points={demoCurve} /><Sparkline points={spyCurve} muted /></div><div className="legend"><span><i className="green" /> Your portfolio <strong>+{Math.max(returnPct, 18.4).toFixed(1)}%</strong></span><span><i /> SPY equivalent <strong>+11.8%</strong></span></div></> : <><p className="panel-copy">This compares your current holdings with the unsold fractional SPY lots created by the same buy and sell history.</p><div className="value-comparison"><article><div><span>Your holdings</span><strong>{money(totalValue, 2)}</strong></div><i><b style={{ width: `${spyBenchmark.spyOpenValue ? Math.min(100, (totalValue / Math.max(totalValue, spyBenchmark.spyOpenValue)) * 100) : 0}%` }} /></i></article><article><div><span>Lazy SPY holdings</span><strong>{spyBenchmark.spyOpenValue === null ? "Waiting…" : money(spyBenchmark.spyOpenValue, 2)}</strong></div><i><b className="spy" style={{ width: `${spyBenchmark.spyOpenValue ? Math.min(100, (spyBenchmark.spyOpenValue / Math.max(totalValue, spyBenchmark.spyOpenValue)) * 100) : 0}%` }} /></i></article></div>{spyBenchmark.spyOpenValue !== null && <p className={`comparison-callout ${totalValue >= spyBenchmark.spyOpenValue ? "positive" : "negative"}`}>{totalValue - spyBenchmark.spyOpenValue >= 0 ? "+" : ""}{money(totalValue - spyBenchmark.spyOpenValue, 2)} versus the lazy portfolio</p>}</>}
        </article>
        <article className="panel allocation">
          <div className="panel-head"><div><p className="kicker">WHERE YOU ARE NOW</p><h2>Allocation</h2></div><button className="arrow" onClick={() => onNavigate("holdings")}>↗</button></div>
          <p className="allocation-summary">{top ? `${top.ticker} is ${largestAllocationPct.toFixed(1)}% of this account. The five largest positions represent ${topFiveAllocationPct.toFixed(1)}%.` : "Add an account to see position concentration."}</p>
          <div className="donut-wrap"><div className="donut" style={{ background: `conic-gradient(${allocationGradient})` }} role="img" aria-label={`${holdings.length} positions. Largest position ${top?.ticker || "none"} at ${largestAllocationPct.toFixed(1)} percent.`}><div><strong>{largestAllocationPct.toFixed(0)}%</strong><span>{top ? `${top.ticker} WEIGHT` : "NO POSITIONS"}</span></div></div><ol>{allocationItems.map((item) => <li key={item.ticker}><i style={{ background: item.color }} /><strong>{item.ticker}</strong><span>{((item.value / Math.max(totalValue, 1)) * 100).toFixed(1)}%</span></li>)}</ol></div>
        </article>
      </section>
      <section className="insight-strip">
        <div><p className="kicker">{accountName ? `${accountName.toUpperCase()} · REVIEW IN BRIEF` : "YOUR REVIEW, IN BRIEF"}</p><h2>{overviewReviewTitle[0]}<br /><em>{overviewReviewTitle[1]}</em></h2><p className="review-brief-copy">{strongestMetric && weakestMetric ? `${strongestMetric.name} leads at ${strongestMetric.score}; ${weakestMetric.name.toLowerCase()} is the clearest opportunity at ${weakestMetric.score}.` : "Import transactions and market data to identify the account’s strongest and weakest habits."}</p><button onClick={() => onNavigate("review")}>Read full trade review <span>→</span></button></div>
        <article><div className="insight-card-top"><span className="insight-icon">⌁</span><strong>{strongestMetric?.score || "—"}</strong></div><p className="label">YOUR EDGE · {strongestMetric?.name || "WAITING"}</p><h3>{strongestMetric ? metricHeadlines[strongestMetric.name] : "More data will reveal your edge."}</h3><p>{strongestMetric?.copy || "Complete pricing to compare account decisions with passive SPY."}</p></article>
        <article><div className="insight-card-top"><span className="insight-icon warm">↘</span><strong>{weakestMetric?.score || "—"}</strong></div><p className="label">WATCH NEXT · {weakestMetric?.name || "WAITING"}</p><h3>{weakestMetric ? metricHeadlines[weakestMetric.name] : "Your blind spot needs more evidence."}</h3><p>{weakestMetric?.copy || "As more held and exited prices arrive, this account’s next improvement will become clearer."}</p></article>
      </section>
    </>
  );
}
