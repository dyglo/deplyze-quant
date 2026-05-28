import React from 'react';
import type { InstrumentFundamentals } from '../../services/instrumentService';

function fmtPct(v: number, decimals = 1): string {
  return `${(v * 100).toFixed(decimals)}%`;
}

function fmtNum(v: number, decimals = 2): string {
  return v.toFixed(decimals);
}

function fmtPctDirect(v: number, decimals = 1): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`;
}

const MetricRow: React.FC<{
  label: string;
  value: string | null;
  emphasis?: 'positive' | 'negative' | 'neutral';
}> = ({ label, value, emphasis }) => {
  const color =
    emphasis === 'positive' ? 'var(--ds-gain)' :
    emphasis === 'negative' ? 'var(--ds-loss)' :
    'var(--foreground)';

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      padding: '5px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>{label}</span>
      <span style={{
        fontSize: 12,
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        color: value ? color : 'var(--muted-foreground)',
      }}>
        {value ?? '—'}
      </span>
    </div>
  );
};

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'var(--muted-foreground)',
    paddingTop: 8,
    paddingBottom: 2,
  }}>
    {children}
  </div>
);

interface RangeBarProps {
  low: number;
  high: number;
  current: number;
  label52WLow?: string;
  label52WHigh?: string;
}

const RangeBar: React.FC<RangeBarProps> = ({ low, high, current, label52WLow, label52WHigh }) => {
  const pct = high > low ? Math.min(1, Math.max(0, (current - low) / (high - low))) : 0.5;
  const near52WHigh = pct > 0.85;
  const near52WLow = pct < 0.15;

  return (
    <div style={{ paddingTop: 8, paddingBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="ds-caption" style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
          {label52WLow ?? low.toFixed(2)}
        </span>
        <span className="ds-caption" style={{ fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 600 }}>
          52-Week Range
        </span>
        <span className="ds-caption" style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
          {label52WHigh ?? high.toFixed(2)}
        </span>
      </div>
      <div style={{ position: 'relative', height: 6, background: 'var(--muted)', borderRadius: 3 }}>
        <div style={{
          position: 'absolute',
          left: `${pct * 100}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: near52WHigh ? 'var(--ds-gain)' : near52WLow ? 'var(--ds-loss)' : 'var(--primary)',
          border: '2px solid var(--card)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }} />
      </div>
      <div style={{ textAlign: 'center', marginTop: 5 }}>
        <span className="ds-caption" style={{
          fontSize: 10,
          color: near52WHigh ? 'var(--ds-gain)' : near52WLow ? 'var(--ds-loss)' : 'var(--muted-foreground)',
          fontWeight: near52WHigh || near52WLow ? 600 : 400,
        }}>
          {near52WHigh ? `Near 52W high (${(pct * 100).toFixed(0)}th pctile)` :
           near52WLow  ? `Near 52W low (${(pct * 100).toFixed(0)}th pctile)` :
           `${(pct * 100).toFixed(0)}th pctile of 52W range`}
        </span>
      </div>
    </div>
  );
};

export const InstrumentKeyMetrics: React.FC<{
  fundamentals: InstrumentFundamentals;
  currentPrice?: number;
}> = ({ fundamentals: f, currentPrice }) => {
  const has52W = f.week52High != null && f.week52Low != null;

  return (
    <section className="ds-surface" style={{ padding: 14, borderRadius: 10 }}>
      <h3 className="ds-heading" style={{ margin: '0 0 4px', fontSize: 13 }}>Key Metrics</h3>

      {has52W && currentPrice != null && (
        <RangeBar
          low={f.week52Low!}
          high={f.week52High!}
          current={currentPrice}
        />
      )}

      <SectionLabel>Valuation</SectionLabel>
      <MetricRow label="P/E Ratio" value={f.peRatio != null ? fmtNum(f.peRatio, 1) : null} />
      <MetricRow label="P/B Ratio" value={f.pbRatio != null ? fmtNum(f.pbRatio, 2) : null} />
      <MetricRow label="EV / EBITDA" value={f.evToEbitda != null ? fmtNum(f.evToEbitda, 1) : null} />
      {f.eps != null && (
        <MetricRow label="EPS (TTM)" value={`$${fmtNum(f.eps, 2)}`} emphasis={f.eps > 0 ? 'positive' : 'negative'} />
      )}

      <SectionLabel>Profitability</SectionLabel>
      <MetricRow
        label="ROE"
        value={f.roe != null ? fmtPct(f.roe) : null}
        emphasis={f.roe != null ? (f.roe > 0.15 ? 'positive' : f.roe < 0 ? 'negative' : 'neutral') : undefined}
      />
      {f.roic != null && (
        <MetricRow label="ROIC" value={fmtPct(f.roic)} emphasis={f.roic > 0.1 ? 'positive' : f.roic < 0 ? 'negative' : 'neutral'} />
      )}
      {f.operatingMargin != null && (
        <MetricRow label="Operating Margin" value={fmtPct(f.operatingMargin)} emphasis={f.operatingMargin > 0.15 ? 'positive' : f.operatingMargin < 0 ? 'negative' : 'neutral'} />
      )}
      {f.netMargin != null && (
        <MetricRow label="Net Margin" value={fmtPct(f.netMargin)} emphasis={f.netMargin > 0.1 ? 'positive' : f.netMargin < 0 ? 'negative' : 'neutral'} />
      )}

      <SectionLabel>Growth</SectionLabel>
      {f.revenueGrowthYoY != null && (
        <MetricRow
          label="Revenue Growth (YoY)"
          value={fmtPctDirect(f.revenueGrowthYoY * 100)}
          emphasis={f.revenueGrowthYoY > 0 ? 'positive' : 'negative'}
        />
      )}
      {f.earningsGrowthYoY != null && (
        <MetricRow
          label="Earnings Growth (YoY)"
          value={fmtPctDirect(f.earningsGrowthYoY * 100)}
          emphasis={f.earningsGrowthYoY > 0 ? 'positive' : 'negative'}
        />
      )}

      <SectionLabel>Balance Sheet</SectionLabel>
      {f.debtToEquity != null && (
        <MetricRow label="Debt / Equity" value={fmtNum(f.debtToEquity, 2)} emphasis={f.debtToEquity > 2 ? 'negative' : f.debtToEquity < 0.5 ? 'positive' : 'neutral'} />
      )}
      {f.dividendYield != null && f.dividendYield > 0 && (
        <MetricRow label="Dividend Yield" value={fmtPct(f.dividendYield, 2)} emphasis="positive" />
      )}

      <SectionLabel>Technical</SectionLabel>
      {f.beta != null && (
        <MetricRow label="Beta" value={fmtNum(f.beta, 2)} />
      )}
      {f.week52High != null && (
        <MetricRow label="52W High" value={`$${f.week52High.toFixed(2)}`} />
      )}
      {f.week52Low != null && (
        <MetricRow label="52W Low" value={`$${f.week52Low.toFixed(2)}`} />
      )}
      {f.ma50 != null && (
        <MetricRow
          label="50-Day MA"
          value={`$${f.ma50.toFixed(2)}`}
          emphasis={currentPrice != null ? (currentPrice > f.ma50 ? 'positive' : 'negative') : undefined}
        />
      )}
      {f.ma200 != null && (
        <MetricRow
          label="200-Day MA"
          value={`$${f.ma200.toFixed(2)}`}
          emphasis={currentPrice != null ? (currentPrice > f.ma200 ? 'positive' : 'negative') : undefined}
        />
      )}
    </section>
  );
};
