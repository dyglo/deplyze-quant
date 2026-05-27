import React, { useState } from 'react';
import { ExternalLink, Globe, Users, Building2, Calendar } from 'lucide-react';
import type { InstrumentProfile, InstrumentFundamentals } from '../../services/instrumentService';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtMktCap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

function fmtEmployees(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return String(v);
}

function fmtPct(v: number, dec = 1): string {
  return `${(v * 100).toFixed(dec)}%`;
}

function fmtPctDirect(v: number, dec = 1): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(dec)}%`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const MetaChip: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <span style={{ color: 'var(--muted-foreground)', flexShrink: 0 }}>{icon}</span>
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted-foreground)', lineHeight: 1 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>{value}</div>
    </div>
  </div>
);

interface MetricRowProps {
  label: string;
  value: string | null;
  emphasis?: 'positive' | 'negative' | 'neutral';
}

const MetricRow: React.FC<MetricRowProps> = ({ label, value, emphasis }) => {
  const color =
    emphasis === 'positive' ? 'var(--ds-gain)' :
    emphasis === 'negative' ? 'var(--ds-loss)' :
    'var(--foreground)';

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '5px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: value ? color : 'var(--muted-foreground)' }}>
        {value ?? '—'}
      </span>
    </div>
  );
};

const GroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
    color: 'var(--muted-foreground)', padding: '10px 0 3px',
  }}>{children}</div>
);

interface RangeBarProps { low: number; high: number; current: number }

const RangeBar: React.FC<RangeBarProps> = ({ low, high, current }) => {
  const pct = high > low ? Math.min(1, Math.max(0, (current - low) / (high - low))) : 0.5;
  const near52WHigh = pct > 0.85;
  const near52WLow = pct < 0.15;
  const dotColor = near52WHigh ? 'var(--ds-gain)' : near52WLow ? 'var(--ds-loss)' : 'var(--primary)';
  return (
    <div style={{ margin: '6px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--ds-loss)', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>${low.toFixed(2)}</span>
        <span style={{ fontSize: 9, color: 'var(--muted-foreground)', fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>52-Week Range</span>
        <span style={{ fontSize: 10, color: 'var(--ds-gain)', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>${high.toFixed(2)}</span>
      </div>
      <div style={{ position: 'relative', height: 6, background: 'var(--muted)', borderRadius: 3 }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${pct * 100}%`, background: `linear-gradient(90deg, var(--ds-loss) 0%, ${dotColor} 100%)`,
          borderRadius: 3, opacity: 0.35,
        }} />
        <div style={{
          position: 'absolute', left: `${pct * 100}%`, top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 11, height: 11, borderRadius: '50%',
          background: dotColor, border: '2px solid var(--card)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <span style={{ fontSize: 10, color: dotColor, fontWeight: near52WHigh || near52WLow ? 700 : 400 }}>
          {near52WHigh ? `Near 52W high · ${(pct * 100).toFixed(0)}th pctile` :
           near52WLow  ? `Near 52W low · ${(pct * 100).toFixed(0)}th pctile` :
           `${(pct * 100).toFixed(0)}th pctile of 52W range`}
        </span>
      </div>
    </div>
  );
};

// ─── Main component ──────────────────────────────────────────────────────────

interface Props {
  symbol: string;
  profile: InstrumentProfile | null;
  fundamentals: InstrumentFundamentals | null;
  currentPrice?: number;
}

export const InstrumentOverviewPanel: React.FC<Props> = ({ symbol, profile, fundamentals: f, currentPrice }) => {
  const [descExpanded, setDescExpanded] = useState(false);

  const effectiveMarketCap = profile?.marketCap ?? profile?.marketCapitalization;
  const effectiveWebsite = profile?.website ?? profile?.weburl;
  const effectiveIndustry = profile?.industry ?? profile?.finnhubIndustry;

  const hasMeta = effectiveMarketCap != null || profile?.employees != null || profile?.ipoDate || profile?.ceo;
  const hasMetrics = f && Object.values(f).some(v => v != null);

  return (
    <div className="inst-overview-grid" style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16, marginBottom: 16 }}>

      {/* ── LEFT: Company Overview ─────────────────────────────────── */}
      <section className="ds-surface" style={{ padding: 16, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          {profile?.logo && (
            <img
              src={profile.logo}
              alt={`${symbol} logo`}
              style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'contain', background: 'var(--muted)', padding: 3, flexShrink: 0 }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>{profile?.name ?? symbol}</h3>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
              {profile?.exchange && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: 'var(--muted)', color: 'var(--muted-foreground)', letterSpacing: 0.3, textTransform: 'uppercase' }}>{profile.exchange}</span>
              )}
              {profile?.sector && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: 'rgba(193,95,60,0.08)', color: 'var(--primary)', letterSpacing: 0.2 }}>{profile.sector}</span>
              )}
              {effectiveIndustry && profile?.sector !== effectiveIndustry && (
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--muted)', color: 'var(--muted-foreground)' }}>{effectiveIndustry}</span>
              )}
            </div>
          </div>
        </div>

        {profile?.description && (
          <div>
            <p style={{
              margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--foreground)',
              display: descExpanded ? 'block' : '-webkit-box',
              WebkitLineClamp: descExpanded ? undefined : 4,
              WebkitBoxOrient: descExpanded ? undefined : 'vertical',
              overflow: descExpanded ? 'visible' : 'hidden',
            }}>{profile.description}</p>
            {profile.description.length > 220 && (
              <button onClick={() => setDescExpanded(!descExpanded)} style={{
                background: 'none', border: 'none', padding: '3px 0 0', cursor: 'pointer',
                color: 'var(--primary)', fontSize: 11, fontWeight: 600,
              }}>{descExpanded ? 'Show less ↑' : 'Show more ↓'}</button>
            )}
          </div>
        )}

        {hasMeta && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            {effectiveMarketCap != null && <MetaChip icon={<Building2 size={11} />} label="Market Cap" value={fmtMktCap(effectiveMarketCap)} />}
            {profile?.employees != null && <MetaChip icon={<Users size={11} />} label="Employees" value={fmtEmployees(profile.employees)} />}
            {profile?.ipoDate && <MetaChip icon={<Calendar size={11} />} label="IPO Date" value={profile.ipoDate} />}
            {profile?.country && <MetaChip icon={<Globe size={11} />} label="Country" value={profile.country} />}
            {profile?.ceo && <MetaChip icon={<Users size={11} />} label="CEO" value={profile.ceo} />}
            {profile?.currency && <MetaChip icon={<Building2 size={11} />} label="Currency" value={profile.currency} />}
          </div>
        )}

        {effectiveWebsite && (
          <a href={effectiveWebsite} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--muted-foreground)', fontSize: 11, textDecoration: 'none' }}>
            <Globe size={11} />
            {effectiveWebsite.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            <ExternalLink size={9} />
          </a>
        )}

        {!profile && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
            Company profile loading…
          </p>
        )}
      </section>

      {/* ── RIGHT: Key Metrics ─────────────────────────────────────── */}
      <section className="ds-surface" style={{ padding: 16, borderRadius: 10 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700 }}>Key Metrics</h3>

        {f?.week52High != null && f?.week52Low != null && currentPrice != null && (
          <RangeBar low={f.week52Low} high={f.week52High} current={currentPrice} />
        )}

        {hasMetrics ? (
          <>
            <GroupLabel>Valuation</GroupLabel>
            <MetricRow label="P/E Ratio (TTM)" value={f?.peRatio != null ? f.peRatio.toFixed(1) : null} />
            <MetricRow label="P/B Ratio" value={f?.pbRatio != null ? f.pbRatio.toFixed(2) : null} />
            <MetricRow label="EV / EBITDA" value={f?.evToEbitda != null ? f.evToEbitda.toFixed(1) : null} />
            {f?.eps != null && (
              <MetricRow label="EPS (TTM)" value={`$${f.eps.toFixed(2)}`} emphasis={f.eps > 0 ? 'positive' : 'negative'} />
            )}

            <GroupLabel>Profitability</GroupLabel>
            <MetricRow label="ROE" value={f?.roe != null ? fmtPct(f.roe) : null} emphasis={f?.roe != null ? (f.roe > 0.15 ? 'positive' : f.roe < 0 ? 'negative' : 'neutral') : undefined} />
            {f?.roic != null && <MetricRow label="ROIC" value={fmtPct(f.roic)} emphasis={f.roic > 0.1 ? 'positive' : f.roic < 0 ? 'negative' : 'neutral'} />}
            {f?.operatingMargin != null && <MetricRow label="Operating Margin" value={fmtPct(f.operatingMargin)} emphasis={f.operatingMargin > 0.15 ? 'positive' : f.operatingMargin < 0 ? 'negative' : 'neutral'} />}
            {f?.netMargin != null && <MetricRow label="Net Margin" value={fmtPct(f.netMargin)} emphasis={f.netMargin > 0.1 ? 'positive' : f.netMargin < 0 ? 'negative' : 'neutral'} />}

            <GroupLabel>Growth</GroupLabel>
            {f?.revenueGrowthYoY != null && <MetricRow label="Revenue Growth YoY" value={fmtPctDirect(f.revenueGrowthYoY * 100)} emphasis={f.revenueGrowthYoY > 0 ? 'positive' : 'negative'} />}
            {f?.earningsGrowthYoY != null && <MetricRow label="EPS Growth YoY" value={fmtPctDirect(f.earningsGrowthYoY * 100)} emphasis={f.earningsGrowthYoY > 0 ? 'positive' : 'negative'} />}

            <GroupLabel>Balance Sheet & Technical</GroupLabel>
            {f?.debtToEquity != null && <MetricRow label="Debt / Equity" value={f.debtToEquity.toFixed(2)} emphasis={f.debtToEquity > 2 ? 'negative' : f.debtToEquity < 0.5 ? 'positive' : 'neutral'} />}
            {f?.dividendYield != null && f.dividendYield > 0 && <MetricRow label="Dividend Yield" value={`${(f.dividendYield * 100).toFixed(2)}%`} emphasis="positive" />}
            {f?.beta != null && <MetricRow label="Beta (Market)" value={f.beta.toFixed(2)} />}
            {f?.ma50 != null && <MetricRow label="50-Day MA" value={`$${f.ma50.toFixed(2)}`} emphasis={currentPrice != null ? (currentPrice > f.ma50 ? 'positive' : 'negative') : undefined} />}
            {f?.ma200 != null && <MetricRow label="200-Day MA" value={`$${f.ma200.toFixed(2)}`} emphasis={currentPrice != null ? (currentPrice > f.ma200 ? 'positive' : 'negative') : undefined} />}
          </>
        ) : (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
            Fundamentals loading…
          </p>
        )}
      </section>
    </div>
  );
};
