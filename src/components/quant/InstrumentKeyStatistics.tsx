import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useInstrumentIntelligence } from '../../hooks/useInstrument';
import { useInstrumentFinancials } from '../../hooks/useInstrumentFinancials';
import { useOHLCV } from '../../hooks/useMarket';
import { useAnalystRatings } from '../../hooks/useAnalystRatings';
import { closes } from '../../lib/quant';
import { rsi } from '../../lib/quant/technicals';
import type { Quote } from '../../types';

function fmtBig(v: number): string {
  if (v >= 1e12) return `${(v / 1e12).toFixed(3)}T`;
  if (v >= 1e9)  return `${(v / 1e9).toFixed(3)}B`;
  if (v >= 1e6)  return `${(v / 1e6).toFixed(1)}M`;
  return v.toLocaleString();
}

function fmtPrice(v: number): string {
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface StatRowProps {
  label: string;
  value?: React.ReactNode;
  highlight?: boolean;
  locked?: boolean;
}

const StatRow: React.FC<StatRowProps> = ({ label, value, highlight, locked }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
    <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{label}</span>
    {locked ? (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--primary)', fontWeight: 500, cursor: 'pointer' }}>
        <Lock size={10} /> Unlock
      </span>
    ) : (
      <span style={{ fontSize: 12, fontWeight: 500, color: highlight ? 'var(--primary)' : 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>
        {value ?? '—'}
      </span>
    )}
  </div>
);

interface Props {
  symbol: string;
  quote: Quote | null;
}

export const InstrumentKeyStatistics: React.FC<Props> = ({ symbol, quote: q }) => {
  const intel = useInstrumentIntelligence(symbol);
  const financials = useInstrumentFinancials(symbol, 'annual');
  const ohlcv = useOHLCV(symbol, '1day', 252);
  const analystRatings = useAnalystRatings(symbol);

  const f = intel.data?.fundamentals ?? null;
  const profile = intel.data?.profile ?? null;
  const earnings = intel.data?.earnings ?? [];
  const bars = ohlcv.data?.bars ?? [];

  // Latest annual financials (most recent period)
  const latestFinancials = useMemo(() => {
    const series = financials.data?.series ?? [];
    return series.length > 0 ? series[series.length - 1] : null;
  }, [financials.data]);

  // 1-Year change from OHLCV
  const oneYearChange = useMemo(() => {
    if (bars.length < 2) return null;
    const first = bars[0].close;
    const last = bars[bars.length - 1].close;
    return ((last - first) / first) * 100;
  }, [bars]);

  // Average volume (3m) — mean of last 63 bars' volume
  const avgVolume3m = useMemo(() => {
    const last63 = bars.slice(-63);
    if (!last63.length) return null;
    const vols = last63.map(b => b.volume).filter((v): v is number => v != null);
    if (!vols.length) return null;
    return vols.reduce((a, b) => a + b, 0) / vols.length;
  }, [bars]);

  // RSI(14d) from closes
  const rsiValue = useMemo(() => {
    const cs = closes(bars);
    if (cs.length < 15) return null;
    const result = rsi(cs, 14);
    return result?.value ?? null;
  }, [bars]);

  // Gross profit margin from financials
  const grossProfitMargin = useMemo(() => {
    const lf = latestFinancials;
    if (!lf?.grossProfit || !lf?.revenue || lf.revenue === 0) return null;
    return (lf.grossProfit / lf.revenue) * 100;
  }, [latestFinancials]);

  // Next upcoming earnings date (first future date)
  const nextEarningsDate = useMemo(() => {
    const now = Date.now();
    const future = earnings
      .map(e => ({ ...e, ts: new Date(e.date).getTime() }))
      .filter(e => e.ts > now)
      .sort((a, b) => a.ts - b.ts);
    return future[0]?.date ?? null;
  }, [earnings]);

  // Analyst price target
  const priceTarget = analystRatings.data?.priceTargets;

  const marketCap = profile?.marketCap ?? profile?.marketCapitalization;

  // Dividend info
  const dividendYield = f?.dividendYield;
  // EPS-derived annual dividend approximation: yield * price
  const dividendAnnual = dividendYield && q?.price ? dividendYield * q.price : null;

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--foreground)' }}>Key Statistics</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link
            to={`/copilot?symbol=${symbol}&prompt=${encodeURIComponent(`Is ${symbol} bullish or bearish?`)}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', border: '1px solid var(--primary)', borderRadius: 6,
              fontSize: 12, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none',
              background: 'transparent',
            }}
          >
            <span style={{ fontSize: 11 }}>AI</span>
            {symbol} bullish or bearish?
          </Link>
          <Link
            to={`/copilot?symbol=${symbol}`}
            style={{ fontSize: 12, fontWeight: 500, color: 'var(--primary)', textDecoration: 'none' }}
          >
            More metrics for {symbol}
          </Link>
        </div>
      </div>

      {/* Three-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 32px' }} className="inst-overview-grid">

        {/* Column 1 */}
        <div>
          <StatRow label="Prev. Close"    value={q?.previousClose != null ? fmtPrice(q.previousClose) : null} />
          <StatRow label="Open"           value={q?.open != null ? fmtPrice(q.open) : null} />
          <StatRow label="Day's Range"    value={q?.low != null && q?.high != null ? `${fmtPrice(q.low)} - ${fmtPrice(q.high)}` : null} />
          <StatRow label="52 wk Range"    value={f?.week52Low != null && f?.week52High != null ? `${fmtPrice(f.week52Low)} - ${fmtPrice(f.week52High)}` : null} />
          <StatRow label="Volume"         value={q?.volume != null ? fmtBig(q.volume) : null} highlight />
          <StatRow label="Average Vol. (3m)" value={avgVolume3m != null ? fmtBig(avgVolume3m) : null} highlight />
          <StatRow label="1-Year Change"  value={oneYearChange != null ? `${oneYearChange >= 0 ? '+' : ''}${oneYearChange.toFixed(1)}%` : null} highlight={oneYearChange != null && oneYearChange > 0} />
          <StatRow label="Fair Value"     locked />
          <StatRow label="Fair Value Upside" locked />
          <StatRow label="Market Cap"     value={marketCap != null ? fmtBig(marketCap) : null} highlight />
        </div>

        {/* Column 2 */}
        <div>
          <StatRow label="Shares Outstanding" value={profile?.sharesOutstanding != null ? fmtBig(profile.sharesOutstanding) : null} highlight />
          <StatRow label="Revenue"        value={latestFinancials?.revenue != null ? fmtBig(latestFinancials.revenue) : null} highlight />
          <StatRow label="Net Income"     value={latestFinancials?.netIncome != null ? fmtBig(latestFinancials.netIncome) : null} highlight />
          <StatRow label="EPS"            value={f?.eps != null ? f.eps.toFixed(2) : latestFinancials?.eps != null ? latestFinancials.eps.toFixed(2) : null} />
          <StatRow label="EPS Growth Forecast" locked />
          <StatRow label="Next Earnings Date" value={nextEarningsDate ? new Date(nextEarningsDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null} highlight />
          <StatRow label="Dividend (Yield)"
            value={dividendAnnual != null && dividendYield != null
              ? `${dividendAnnual.toFixed(2)} (${(dividendYield * 100).toFixed(1)}%)`
              : dividendYield != null ? `${(dividendYield * 100).toFixed(1)}%` : '—'} />
          <StatRow label="Dividends Payment Streak" locked />
          <StatRow label="Gross Profit Margin" value={grossProfitMargin != null ? `${grossProfitMargin.toFixed(1)}%` : null} />
          <StatRow label="P/E Ratio"      value={f?.peRatio != null ? `${f.peRatio.toFixed(1)}x` : null} highlight />
        </div>

        {/* Column 3 */}
        <div>
          <StatRow label="Return on Assets"  value={f?.roic != null ? `${(f.roic * 100).toFixed(1)}%` : null} highlight />
          <StatRow label="Return on Equity"  value={f?.roe != null ? `${(f.roe * 100).toFixed(1)}%` : null} highlight />
          <StatRow label="Price/Book"         value={f?.pbRatio != null ? `${f.pbRatio.toFixed(1)}x` : null} highlight />
          <StatRow label="EBITDA"             value={latestFinancials?.ebitda != null ? fmtBig(latestFinancials.ebitda) : null} highlight />
          <StatRow label="EV/EBITDA"          value={f?.evToEbitda != null ? `${f.evToEbitda.toFixed(1)}x` : null} highlight />
          <StatRow label="Beta"               value={f?.beta != null ? f.beta.toFixed(2) : null} />
          <StatRow label="Book Value / Share" value={f?.bookValuePerShare != null ? `$${f.bookValuePerShare.toFixed(2)}` : null} highlight />
          <StatRow label="Relative Strength Index (14d)" value={rsiValue != null ? rsiValue.toFixed(2) : null} />
          {priceTarget?.avg != null && (
            <StatRow label="Analyst Price Target" value={`$${fmtPrice(priceTarget.avg)}`} highlight />
          )}
        </div>
      </div>
    </div>
  );
};
