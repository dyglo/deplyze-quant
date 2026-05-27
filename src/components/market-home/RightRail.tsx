import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSWR } from '../../hooks/useSWR';
import { useCompositeRegime, useRiskEnvironment } from '../../hooks/useAgentIntelligence';
import { extractRiskLevel } from '../../services/agentService';
import { fetchMarketMovers, type MarketMoverItem, type MoverType } from '../../services/marketService';
import { RegimeStatusChip, RiskLevelChip } from '../quant/SystemAnalyzingState';
import { fmtPct, deltaColor } from './format';

function moverSymbol(m: MarketMoverItem): string {
  return m.symbol ?? m.ticker ?? '';
}
function moverPct(m: MarketMoverItem): number {
  return m.changesPercentage ?? m.changePercent ?? 0;
}

const RailCard: React.FC<{ title: string; children: React.ReactNode; action?: React.ReactNode }> = ({ title, children, action }) => (
  <section>
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, marginBottom: 4, borderBottom: '2px solid var(--foreground)' }}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--foreground)' }}>{title}</span>
      {action}
    </header>
    <div>{children}</div>
  </section>
);

const RegimeCard: React.FC = () => {
  const { data: regime, regimeLabel } = useCompositeRegime();
  const { data: risk } = useRiskEnvironment();
  const riskLevel = extractRiskLevel(risk);
  return (
    <RailCard title="Market Environment">
      <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Macro Regime</div>
          {regimeLabel ? <RegimeStatusChip regime={regimeLabel} confidence={regime?.confidence ?? null} /> : <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Computing…</span>}
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Environment</div>
          {riskLevel ? <RiskLevelChip riskLevel={riskLevel} severity={risk?.severity} /> : <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Computing…</span>}
        </div>
      </div>
    </RailCard>
  );
};

const MOVER_TABS: { id: MoverType; label: string }[] = [
  { id: 'gainers', label: 'Gainers' },
  { id: 'losers', label: 'Losers' },
  { id: 'active', label: 'Active' },
];

const MoversCard: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<MoverType>('gainers');
  const { data, loading } = useSWR(() => fetchMarketMovers(tab), [tab], { cacheKey: `marketHome:movers:${tab}` });
  const rows = (data ?? []).slice(0, 6);

  return (
    <RailCard
      title="Movers"
      action={
        <div style={{ display: 'flex', gap: 3 }}>
          {MOVER_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                fontSize: 10, fontWeight: tab === t.id ? 700 : 500, padding: '2px 7px', borderRadius: 999,
                border: 'none', cursor: 'pointer',
                background: tab === t.id ? 'color-mix(in srgb, var(--primary) 14%, transparent)' : 'transparent',
                color: tab === t.id ? 'var(--primary)' : 'var(--muted-foreground)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      <div>
        {loading && rows.length === 0
          ? Array.from({ length: 5 }).map((_, i) => <div key={i} style={{ height: 34, margin: '6px 0', borderRadius: 6, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />)
          : rows.length === 0
          ? <p className="ds-caption" style={{ color: 'var(--muted-foreground)', padding: '14px 0' }}>No mover data right now.</p>
          : rows.map((m) => {
              const sym = moverSymbol(m);
              const pct = moverPct(m);
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => navigate(`/instruments/${encodeURIComponent(sym)}`)}
                  className="ds-transition-fast"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%',
                    padding: '7px 4px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
                    textAlign: 'left', cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--muted)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--foreground)' }}>{sym}</span>
                    <span style={{ display: 'block', fontSize: 9.5, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 130 }}>{m.name ?? m.companyName ?? ''}</span>
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: deltaColor(pct) }}>{fmtPct(pct)}</span>
                </button>
              );
            })}
      </div>
    </RailCard>
  );
};

export const RightRail: React.FC = () => (
  <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    <RegimeCard />
    <MoversCard />
  </aside>
);
