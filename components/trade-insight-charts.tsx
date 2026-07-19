"use client";

import type { RatedTrade } from "../lib/trade-review/analyzer";

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function emptyChart(copy: string) {
  return <div className="chart-empty"><strong>More market data needed</strong><p>{copy}</p></div>;
}

export function DecisionMap({ trades }: { trades: RatedTrade[] }) {
  const allBuys = trades
    .filter((trade) => trade.side === "Buy" && trade.excessReturnPct !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
  if (!allBuys.length) {
    return emptyChart("Fetch held-position prices and SPY history to map buy decisions.");
  }

  const buys = [...allBuys]
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 80)
    .sort((left, right) => left.date.localeCompare(right.date));
  const times = allBuys.map((trade) => Date.parse(`${trade.date}T00:00:00Z`));
  const minimumTime = Math.min(...times);
  const maximumTime = Math.max(...times);
  const span = Math.max(1, maximumTime - minimumTime);
  const maximumEdge = Math.max(
    10,
    ...buys.map((trade) => Math.abs(trade.excessReturnPct || 0)),
  );
  const maximumAmount = Math.max(1, ...buys.map((trade) => trade.amount));
  const x = (date: string) => 55 + ((Date.parse(`${date}T00:00:00Z`) - minimumTime) / span) * 620;
  const y = (edge: number) => 145 - (edge / maximumEdge) * 105;
  const radius = (amount: number) => 3.5 + Math.sqrt(amount / maximumAmount) * 7;
  const leaders = new Set(
    [...buys]
      .sort((left, right) => Math.abs(right.excessReturnPct || 0) - Math.abs(left.excessReturnPct || 0))
      .slice(0, 4)
      .map((trade) => trade.id),
  );

  return (
    <svg className="decision-map" viewBox="0 0 720 290" role="img" aria-labelledby="decision-map-title decision-map-desc">
      <title id="decision-map-title">Buy decisions compared with SPY</title>
      <desc id="decision-map-desc">Each bubble is a buy. Its vertical position shows percentage points ahead of or behind SPY, horizontal position shows date, and size shows dollars invested.</desc>
      {[maximumEdge, maximumEdge / 2, 0, -maximumEdge / 2, -maximumEdge].map((tick) => (
        <g key={tick}>
          <line className={tick === 0 ? "chart-zero" : "chart-grid-line"} x1="55" x2="675" y1={y(tick)} y2={y(tick)} />
          <text className="chart-axis-label" x="48" y={y(tick) + 3} textAnchor="end">{signed(tick)}</text>
        </g>
      ))}
      <text className="chart-axis-caption" x="55" y="15">POINTS VS SPY</text>
      <text className="chart-axis-label" x="55" y="278">{allBuys[0].date.slice(0, 4)}</text>
      <text className="chart-axis-label" x="675" y="278" textAnchor="end">{allBuys[allBuys.length - 1].date.slice(0, 4)}</text>
      {buys.map((trade) => {
        const edge = trade.excessReturnPct || 0;
        const cx = x(trade.date);
        const cy = y(edge);
        return (
          <g key={trade.id}>
            <circle className={edge >= 0 ? "chart-point positive-point" : "chart-point negative-point"} cx={cx} cy={cy} r={radius(trade.amount)}>
              <title>{trade.ticker} · {trade.date} · {signed(edge)} points vs SPY · ${trade.amount.toFixed(2)} invested</title>
            </circle>
            {leaders.has(trade.id) && (
              <text className="chart-mark-label" x={Math.min(680, Math.max(40, cx))} y={cy + (edge >= 0 ? -13 : 17)} textAnchor="middle">
                {trade.ticker} {signed(edge)}
              </text>
            )}
          </g>
        );
      })}
      <g className="chart-inline-legend">
        <circle className="positive-point" cx="552" cy="18" r="4" /><text x="561" y="21">Beat SPY</text>
        <circle className="negative-point" cx="622" cy="18" r="4" /><text x="631" y="21">Trailed SPY</text>
      </g>
    </svg>
  );
}

export function ExitTimingChart({ trades }: { trades: RatedTrade[] }) {
  const grouped = new Map<string, { weightedEdge: number; amount: number; sales: number }>();
  trades
    .filter((trade) => trade.side === "Sell" && trade.exitEdgePct !== null)
    .forEach((trade) => {
      const current = grouped.get(trade.ticker) || { weightedEdge: 0, amount: 0, sales: 0 };
      const weight = Math.max(1, trade.amount);
      current.weightedEdge += (trade.exitEdgePct || 0) * weight;
      current.amount += weight;
      current.sales += 1;
      grouped.set(trade.ticker, current);
    });
  const rows = [...grouped.entries()]
    .map(([ticker, value]) => ({
      ticker,
      edge: value.weightedEdge / value.amount,
      sales: value.sales,
    }))
    .sort((left, right) => Math.abs(right.edge) - Math.abs(left.edge))
    .slice(0, 8);
  if (!rows.length) {
    return emptyChart("Complete held-position pricing, then fetch exited positions to score exit timing.");
  }

  const maximum = Math.max(10, ...rows.map((row) => Math.abs(row.edge)));
  const height = 45 + rows.length * 30;
  const center = 235;
  const scale = 150 / maximum;

  return (
    <svg className="exit-timing-chart" viewBox={`0 0 470 ${height}`} role="img" aria-labelledby="exit-chart-title exit-chart-desc">
      <title id="exit-chart-title">Exit timing by ticker</title>
      <desc id="exit-chart-desc">Bars to the right show stocks that underperformed SPY after sale, supporting the exit. Bars to the left show stocks that subsequently outperformed SPY.</desc>
      <line className="chart-zero" x1={center} x2={center} y1="23" y2={height - 12} />
      <text className="chart-axis-caption" x="80" y="13">MISSED UPSIDE</text>
      <text className="chart-axis-caption" x="390" y="13" textAnchor="end">AVOIDED WEAKNESS</text>
      {rows.map((row, index) => {
        const y = 29 + index * 30;
        const width = Math.abs(row.edge) * scale;
        const positive = row.edge >= 0;
        return (
          <g key={row.ticker}>
            <text className="chart-row-label" x="2" y={y + 12}>{row.ticker}</text>
            <rect className={positive ? "exit-bar positive-bar" : "exit-bar negative-bar"} x={positive ? center : center - width} y={y} width={width} height="16" rx="3">
              <title>{row.ticker} · {signed(row.edge)} post-exit points vs SPY across {row.sales} sale{row.sales === 1 ? "" : "s"}</title>
            </rect>
            <text className="chart-value-label" x={positive ? center + width + 6 : center - width - 6} y={y + 12} textAnchor={positive ? "start" : "end"}>
              {signed(row.edge)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function OutcomeDistribution({ trades }: { trades: RatedTrade[] }) {
  const rated = trades.filter((trade) => trade.outcomePct !== null);
  if (!rated.length) {
    return emptyChart("Import matched buys and sales to see the distribution of outcomes.");
  }
  const bins = [
    { label: "<−50", minimum: -Infinity, maximum: -50 },
    { label: "−50–−20", minimum: -50, maximum: -20 },
    { label: "−20–0", minimum: -20, maximum: 0 },
    { label: "0–20", minimum: 0, maximum: 20 },
    { label: "20–50", minimum: 20, maximum: 50 },
    { label: ">50", minimum: 50, maximum: Infinity },
  ].map((bin) => {
    const members = rated.filter((trade) => {
      const outcome = trade.outcomePct || 0;
      return outcome >= bin.minimum && outcome < bin.maximum;
    });
    return {
      ...bin,
      buys: members.filter((trade) => trade.side === "Buy").length,
      sales: members.filter((trade) => trade.side === "Sell").length,
    };
  });
  const maximum = Math.max(1, ...bins.map((bin) => bin.buys + bin.sales));
  const baseline = 205;

  return (
    <svg className="outcome-histogram" viewBox="0 0 720 255" role="img" aria-labelledby="outcome-chart-title outcome-chart-desc">
      <title id="outcome-chart-title">Distribution of rated trade outcomes</title>
      <desc id="outcome-chart-desc">Stacked columns show how many buy and sale executions fall into six percentage-return ranges.</desc>
      {[0, Math.ceil(maximum / 2), maximum].map((tick) => {
        const y = baseline - (tick / maximum) * 165;
        return (
          <g key={tick}>
            <line className="chart-grid-line" x1="50" x2="700" y1={y} y2={y} />
            <text className="chart-axis-label" x="43" y={y + 3} textAnchor="end">{tick}</text>
          </g>
        );
      })}
      {bins.map((bin, index) => {
        const x = 75 + index * 103;
        const buyHeight = (bin.buys / maximum) * 165;
        const saleHeight = (bin.sales / maximum) * 165;
        return (
          <g key={bin.label}>
            <rect className="histogram-buy" x={x} y={baseline - buyHeight} width="62" height={buyHeight} rx="3">
              <title>{bin.label}%: {bin.buys} buy executions</title>
            </rect>
            <rect className="histogram-sale" x={x} y={baseline - buyHeight - saleHeight} width="62" height={saleHeight} rx="3">
              <title>{bin.label}%: {bin.sales} sale executions</title>
            </rect>
            <text className="chart-value-label" x={x + 31} y={baseline - buyHeight - saleHeight - 7} textAnchor="middle">{bin.buys + bin.sales}</text>
            <text className="chart-axis-label" x={x + 31} y="225" textAnchor="middle">{bin.label}%</text>
          </g>
        );
      })}
      <g className="chart-inline-legend">
        <rect className="histogram-buy" x="540" y="240" width="10" height="7" /><text x="555" y="247">Buys</text>
        <rect className="histogram-sale" x="600" y="240" width="10" height="7" /><text x="615" y="247">Sales</text>
      </g>
    </svg>
  );
}
