import React, { useState } from 'react';
import { ExternalLink, Globe, Users, Building2, Calendar } from 'lucide-react';
import type { InstrumentProfile, InstrumentFundamentals } from '../../services/instrumentService';

function fmtMktCap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}
function fmtEmployees(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v);
}
function fmtPct(v: number, d = 1): string { return `${(v * 100).toFixed(d)}%`; }
function fmtPctDirect(v: number, d = 1): string { return `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`; }

// ─── Flat metric row ─────────────────────────────────────────────────────────

const Row: React.FC<{ label: string; value: string | null; color?: string }> = ({ label, value, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
    <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{label}</span>
    <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: value ? (color ?? 'var(--foreground)') : 'var(--muted-foreground)' }}>
      {value ?? '—'}
    </span>
  </div>
);

const RowGroup: React.FC<{ title: string }> = ({ title }) => (
  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted-foreground)', padding: '12px 0 4px' }}>{title}</div>
);

// ─── 52W range bar ────────────────────────────────────────────────────────────

const RangeBar: React.FC<{ low: number; high: number; current: number }> = ({ low, high, current }) => {
  const pct = high > low ? Math.min(1, Math.max(0, (current - low) / (high - low))) : 0.5;
  const dotColor = pct > 0.85 ? 'var(--ds-gain)' : pct < 0.15 ? 'var(--ds-loss)' : 'var(--primary)';
  return (
    <div style={{ padding: '10px 0 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--ds-loss)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>${low.toFixed(2)}</span>
        <span style={{ fontSize: 9, color: 'var(--muted-foreground)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>52-Week Range</span>
        <span style={{ fontSize: 10, color: 'var(--ds-gain)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>${high.toFixed(2)}</span>
      </div>
      <div style={{ position: 'relative', height: 4, background: 'var(--border)', borderRadius: 2 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct * 100}%`, background: dotColor, opacity: 0.4, borderRadius: 2 }} />
        <div style={{ position: 'absolute', left: `${pct * 100}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: dotColor, border: '2px solid var(--background)' }} />
      </div>
      <div style={{ textAlign: 'center', marginTop: 6, fontSize: 10, color: dotColor, fontWeight: 600 }}>
        {pct > 0.85 ? 'Near 52W high' : pct < 0.15 ? 'Near 52W low' : `${(pct * 100).toFixed(0)}th pctile`}
      </div>
    </div>
  );
};

// ─── Meta chip ───────────────────────────────────────────────────────────────

const Meta: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
    <span style={{ color: 'var(--muted-foreground)', paddingTop: 2, flexShrink: 0 }}>{icon}</span>
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted-foreground)', lineHeight: 1 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.3, marginTop: 1 }}>{value}</div>
    </div>
  </div>
);

// ─── Main ─────────────────────────────────────────────────────────────────────

interface Props {
  symbol: string;
  profile: InstrumentProfile | null;
  fundamentals: InstrumentFundamentals | null;
  currentPrice?: number;
}

export const InstrumentOverviewPanel: React.FC<Props> = ({ symbol, profile, fundamentals: f, currentPrice }) => {
  const [expanded, setExpanded] = useState(false);

  const effectiveMarketCap = profile?.marketCap ?? profile?.marketCapitalization;
  const effectiveWebsite = profile?.website ?? profile?.weburl;
  const effectiveIndustry = profile?.industry ?? profile?.finnhubIndustry;

  return (
    <section style={{ marginBottom: 32 }}>
      {/* Section heading */}
      <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Company Overview</h2>
      </div>

      <div className="inst-overview-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 48 }}>

        {/* LEFT: company profile */}
        <div>
          {/* Logo + name + tags */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            {profile?.logo && (
              <img src={profile.logo} alt={`${symbol} logo`}
                style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'contain', border: '1px solid var(--border)', padding: 3, flexShrink: 0 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{profile?.name ?? symbol}</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
                {profile?.exchange && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, border: '1px solid var(--border)', color: 'var(--muted-foreground)', letterSpacing: 0.3, textTransform: 'uppercase' }}>{profile.exchange}</span>}
                {profile?.sector && <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: 'rgba(193,95,60,0.08)', color: 'var(--primary)' }}>{profile.sector}</span>}
                {effectiveIndustry && profile?.sector !== effectiveIndustry && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>{effectiveIndustry}</span>}
              </div>
            </div>
          </div>

          {/* Description */}
          {profile?.description ? (
            <div style={{ marginBottom: 16 }}>
              <p style={{
                margin: 0, fontSize: 13, lineHeight: 1.65, color: 'var(--foreground)',
                display: expanded ? 'block' : '-webkit-box',
                WebkitLineClamp: expanded ? undefined : 5,
                WebkitBoxOrient: expanded ? undefined : 'vertical',
                overflow: expanded ? 'visible' : 'hidden',
              }}>{profile.description}</p>
              {profile.description.length > 280 && (
                <button onClick={() => setExpanded(!expanded)} style={{ background: 'none', border: 'none', padding: '4px 0 0', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, fontWeight: 600 }}>
                  {expanded ? 'Show less ↑' : 'Read more ↓'}
                </button>
              )}
            </div>
          ) : null}

          {/* Meta grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            {effectiveMarketCap != null && <Meta icon={<Building2 size={12} />} label="Market Cap" value={fmtMktCap(effectiveMarketCap)} />}
            {profile?.employees != null && <Meta icon={<Users size={12} />} label="Employees" value={fmtEmployees(profile.employees)} />}
            {profile?.ipoDate && <Meta icon={<Calendar size={12} />} label="IPO Date" value={profile.ipoDate} />}
            {profile?.country && <Meta icon={<Globe size={12} />} label="Country" value={profile.country} />}
            {profile?.ceo && <Meta icon={<Users size={12} />} label="CEO" value={profile.ceo} />}
            {profile?.currency && <Meta icon={<Building2 size={12} />} label="Currency" value={profile.currency} />}
          </div>

          {effectiveWebsite && (
            <a href={effectiveWebsite} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 12, color: 'var(--muted-foreground)', fontSize: 11, textDecoration: 'none' }}>
              <Globe size={11} />
              {effectiveWebsite.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              <ExternalLink size={9} />
            </a>
          )}

          {!profile && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>Loading company profile…</p>
          )}
        </div>

        {/* RIGHT: key metrics */}
        <div>
          {f?.week52High != null && f?.week52Low != null && currentPrice != null && (
            <RangeBar low={f.week52Low} high={f.week52High} current={currentPrice} />
          )}

          {f && Object.values(f).some(v => v != null) ? (
            <>
              <RowGroup title="Valuation" />
              <Row label="P/E Ratio (TTM)" value={f.peRatio != null ? f.peRatio.toFixed(1) : null} />
              <Row label="P/B Ratio" value={f.pbRatio != null ? f.pbRatio.toFixed(2) : null} />
              <Row label="EV / EBITDA" value={f.evToEbitda != null ? f.evToEbitda.toFixed(1) : null} />
              {f.eps != null && <Row label="EPS (TTM)" value={`$${f.eps.toFixed(2)}`} color={f.eps > 0 ? 'var(--ds-gain)' : 'var(--ds-loss)'} />}

              <RowGroup title="Profitability" />
              {f.roe != null && <Row label="ROE" value={fmtPct(f.roe)} color={f.roe > 0.15 ? 'var(--ds-gain)' : f.roe < 0 ? 'var(--ds-loss)' : undefined} />}
              {f.roic != null && <Row label="ROIC" value={fmtPct(f.roic)} color={f.roic > 0.1 ? 'var(--ds-gain)' : f.roic < 0 ? 'var(--ds-loss)' : undefined} />}
              {f.operatingMargin != null && <Row label="Operating Margin" value={fmtPct(f.operatingMargin)} color={f.operatingMargin > 0.15 ? 'var(--ds-gain)' : f.operatingMargin < 0 ? 'var(--ds-loss)' : undefined} />}
              {f.netMargin != null && <Row label="Net Margin" value={fmtPct(f.netMargin)} color={f.netMargin > 0.1 ? 'var(--ds-gain)' : f.netMargin < 0 ? 'var(--ds-loss)' : undefined} />}

              <RowGroup title="Growth" />
              {f.revenueGrowthYoY != null && <Row label="Revenue Growth YoY" value={fmtPctDirect(f.revenueGrowthYoY * 100)} color={f.revenueGrowthYoY > 0 ? 'var(--ds-gain)' : 'var(--ds-loss)'} />}
              {f.earningsGrowthYoY != null && <Row label="EPS Growth YoY" value={fmtPctDirect(f.earningsGrowthYoY * 100)} color={f.earningsGrowthYoY > 0 ? 'var(--ds-gain)' : 'var(--ds-loss)'} />}

              <RowGroup title="Balance Sheet" />
              {f.debtToEquity != null && <Row label="Debt / Equity" value={f.debtToEquity.toFixed(2)} color={f.debtToEquity > 2 ? 'var(--ds-loss)' : f.debtToEquity < 0.5 ? 'var(--ds-gain)' : undefined} />}
              {f.dividendYield != null && f.dividendYield > 0 && <Row label="Dividend Yield" value={`${(f.dividendYield * 100).toFixed(2)}%`} color="var(--ds-gain)" />}
              {f.beta != null && <Row label="Beta" value={f.beta.toFixed(2)} />}
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>Loading fundamentals…</p>
          )}
        </div>
      </div>
    </section>
  );
};
