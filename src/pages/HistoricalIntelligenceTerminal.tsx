/**
 * Historical Intelligence Terminal
 *
 * Phase 3 flagship institutional page — long-horizon historical analytics,
 * cross-asset relationships, regime-conditioned probability, historical
 * analogs, statistical extremes, benchmark-relative analysis, and explainable
 * quantitative intelligence.
 *
 * Wave A: page scaffold — header, symbol/date controls, tab navigation, empty
 * tab placeholders. Tab bodies are filled in subsequent waves.
 */

import React, { useMemo, useState } from 'react';
import { useDocumentHead } from '../lib/seo';
import {
  History,
  Layers,
  Activity,
  Gauge,
  Network,
  BarChart3,
  RefreshCcw,
  Telescope,
  FlaskConical,
  Clock,
} from 'lucide-react';
import { PageHeader } from '../components/quant/PageHeader';
import { Disclaimer } from '../components/quant/Disclaimer';
import { InstrumentSelector } from '../components/quant/InstrumentSelector';
import { AnalogsTab } from '../components/quant/historical-intelligence/AnalogsTab';
import { RegimeTab } from '../components/quant/historical-intelligence/RegimeTab';
import { ExtremesTab } from '../components/quant/historical-intelligence/ExtremesTab';
import { CrossAssetTab } from '../components/quant/historical-intelligence/CrossAssetTab';
import { ForwardReturnsTab } from '../components/quant/historical-intelligence/ForwardReturnsTab';
import { ReversionTab } from '../components/quant/historical-intelligence/ReversionTab';
import { BenchmarkTab } from '../components/quant/historical-intelligence/BenchmarkTab';
import { ScenarioTab } from '../components/quant/historical-intelligence/ScenarioTab';
import { TimelineTab } from '../components/quant/historical-intelligence/TimelineTab';
import { ContextStrip } from '../components/quant/historical-intelligence/ContextStrip';

/** Tab definitions. The IDs are stable — tab bodies wire onto them. */
const TABS = [
  { id: 'analogs',     label: 'Historical Analogs',          icon: History },
  { id: 'regime',      label: 'Regime Explorer',             icon: Layers },
  { id: 'extremes',    label: 'Statistical Extremes',        icon: Gauge },
  { id: 'cross-asset', label: 'Cross-Asset Relationships',   icon: Network },
  { id: 'forward',     label: 'Forward Return Distributions', icon: BarChart3 },
  { id: 'reversion',   label: 'Mean Reversion & Momentum',   icon: RefreshCcw },
  { id: 'benchmark',   label: 'Benchmark Intelligence',      icon: Telescope },
  { id: 'scenario',    label: 'Scenario Builder',            icon: FlaskConical },
  { id: 'timeline',    label: 'Intelligence Timeline',       icon: Clock },
] as const;

type TabId = typeof TABS[number]['id'];

const DEFAULT_SYMBOL = 'QQQ';
const DEFAULT_LOOKBACK = '10Y';
const LOOKBACK_OPTIONS = ['1Y', '3Y', '5Y', '10Y', '20Y'] as const;
type LookbackKey = typeof LOOKBACK_OPTIONS[number];

const LOOKBACK_BARS: Record<LookbackKey, number> = {
  '1Y': 252, '3Y': 756, '5Y': 1260, '10Y': 2520, '20Y': 5040,
};


export const HistoricalIntelligenceTerminal: React.FC = () => {
  useDocumentHead({
    title: 'Historical Intelligence',
    description: 'Historical analogs, regime classification, extremes, mean-reversion, and forward-return distributions from real market history.',
    canonicalPath: '/historical-intelligence',
  });
  const [symbol, setSymbol] = useState<string>(DEFAULT_SYMBOL);
  const [benchmark, setBenchmark] = useState<string>('SPY');
  const [lookback, setLookback] = useState<LookbackKey>(DEFAULT_LOOKBACK);
  const [tab, setTab] = useState<TabId>('analogs');

  const historyBars = LOOKBACK_BARS[lookback];

  const subtitle = useMemo(
    () =>
      'Long-horizon quantitative intelligence — analogs, regimes, extremes, and benchmark-relative behavior. ' +
      'All outputs are probabilistic and grounded in historical evidence; this terminal does not produce buy/sell signals.',
    [],
  );

  return (
    <div style={{ padding: '0 24px 24px', maxWidth: 1480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 26, height: 26, borderRadius: 8,
              background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
            }}>
              <Activity size={13} color="var(--primary)" />
            </span>
            Historical Intelligence Terminal
          </span>
        }
        subtitle={subtitle}
        actions={
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <ContextChip label="Symbol" value={symbol} />
            <ContextChip label="Benchmark" value={benchmark} accent="chart-2" />
            <ContextChip label="Lookback" value={lookback} accent="muted" />
          </div>
        }
      />

      {/* Controls */}
      <section style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 1.2fr) auto auto',
        gap: 10,
        alignItems: 'stretch',
        padding: 12,
        borderRadius: 12,
        background: 'var(--card)',
        border: '1px solid var(--border)',
      }}>
        <div>
          <p className="ds-caption" style={controlLabelStyle}>Primary instrument</p>
          <InstrumentSelector
            value={symbol}
            onSelect={(s) => setSymbol(s.toUpperCase())}
            placeholder="QQQ, SPY, GLD, EUR/USD…"
          />
        </div>

        <div>
          <p className="ds-caption" style={controlLabelStyle}>Benchmark</p>
          <InstrumentSelector
            value={benchmark}
            onSelect={(s) => setBenchmark(s.toUpperCase())}
            placeholder="SPY, QQQ, DIA…"
          />
        </div>

        <div>
          <p className="ds-caption" style={controlLabelStyle}>Lookback</p>
          <div style={pillRowStyle}>
            {LOOKBACK_OPTIONS.map((l) => (
              <PillButton key={l} active={l === lookback} onClick={() => setLookback(l)}>{l}</PillButton>
            ))}
          </div>
        </div>
      </section>

      {/* Persistent visual context — long-horizon price + regime ribbon */}
      <ContextStrip symbol={symbol} benchmark={benchmark} historyBars={historyBars} />

      {/* Tab strip */}
      <nav
        role="tablist"
        aria-label="Historical Intelligence Terminal sections"
        style={{
          display: 'flex',
          gap: 4,
          padding: 4,
          borderRadius: 10,
          background: 'var(--muted)',
          border: '1px solid var(--border)',
          overflowX: 'auto',
        }}
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              style={{
                flex: '0 0 auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
                background: active ? 'var(--card)' : 'transparent',
                border: active ? '1px solid var(--border)' : '1px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={12} style={{ color: active ? 'var(--primary)' : 'var(--muted-foreground)' }} />
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* Tab body */}
      <section role="tabpanel" style={{ minHeight: 480 }}>
        {tab === 'analogs' ? (
          <AnalogsTab symbol={symbol} historyBars={historyBars} />
        ) : tab === 'regime' ? (
          <RegimeTab symbol={symbol} benchmark={benchmark} historyBars={historyBars} />
        ) : tab === 'extremes' ? (
          <ExtremesTab symbol={symbol} historyBars={historyBars} />
        ) : tab === 'cross-asset' ? (
          <CrossAssetTab symbol={symbol} />
        ) : tab === 'forward' ? (
          <ForwardReturnsTab symbol={symbol} historyBars={historyBars} />
        ) : tab === 'reversion' ? (
          <ReversionTab symbol={symbol} historyBars={historyBars} />
        ) : tab === 'benchmark' ? (
          <BenchmarkTab symbol={symbol} benchmark={benchmark} historyBars={historyBars} />
        ) : tab === 'scenario' ? (
          <ScenarioTab symbol={symbol} historyBars={historyBars} />
        ) : tab === 'timeline' ? (
          <TimelineTab symbol={symbol} />
        ) : (
          <TabPlaceholder tab={tab} symbol={symbol} benchmark={benchmark} lookback={lookback} />
        )}
      </section>

      <Disclaimer />
    </div>
  );
};

// ─── Sub-components ─────────────────────────────────────────────────────────

const controlLabelStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--muted-foreground)',
  marginBottom: 6,
  fontWeight: 600,
};

const pillRowStyle: React.CSSProperties = {
  display: 'inline-flex',
  flexWrap: 'wrap',
  gap: 4,
  padding: 3,
  borderRadius: 8,
  background: 'var(--muted)',
  border: '1px solid var(--border)',
};

const PillButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      padding: '5px 10px',
      borderRadius: 6,
      fontSize: 11,
      fontWeight: active ? 700 : 500,
      letterSpacing: '0.02em',
      color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
      background: active ? 'var(--card)' : 'transparent',
      border: active ? '1px solid var(--border)' : '1px solid transparent',
      cursor: 'pointer',
    }}
  >
    {children}
  </button>
);

const ContextChip: React.FC<{ label: string; value: string; accent?: 'primary' | 'chart-2' | 'muted' }> = ({ label, value, accent = 'primary' }) => {
  const color = accent === 'muted' ? 'var(--muted-foreground)' : `var(--${accent})`;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 9px',
      borderRadius: 999,
      background: 'var(--card)',
      border: '1px solid var(--border)',
      fontSize: 10,
      fontWeight: 600,
    }}>
      <span style={{ fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>
        {label}
      </span>
      <span style={{ color }}>{value}</span>
    </span>
  );
};

const TAB_BLURBS: Record<TabId, string> = {
  analogs:
    'Find historical periods whose volatility, momentum, and structural fingerprint resemble the current state, then study what tended to follow.',
  regime:
    'Survey forward-return behavior conditioned on volatility, trend, correlation, and risk-on/off regimes.',
  extremes:
    'Locate statistically extreme states (z-scores, percentile ranks, drawdown percentiles) and the historical distribution of forward outcomes.',
  'cross-asset':
    'Rolling correlations across SPY, QQQ, DXY, gold, oil, yields, FX, and selected assets — including dependency-shift detection.',
  forward:
    'Conditional 1D / 5D / 10D / 20D / 60D forward-return distributions with confidence ranges, downside probability, and max adverse excursion.',
  reversion:
    'Decompose current structure into mean-reversion versus momentum-persistence probabilities, with regime-specific evidence.',
  benchmark:
    'Benchmark-relative intelligence: rolling alpha proxy, drawdown comparison, capture ratios, and regime-conditioned outperformance.',
  scenario:
    'Combine multiple conditions (vol percentile, DXY regime, trend, correlation state) and inspect historical match count, average outcomes, and worst-case drawdown.',
  timeline:
    'Unified intelligence timeline: regime transitions, volatility events, analog matches, correlation breakdowns, benchmark shifts, scenario results, Copilot research summaries.',
};

const TabPlaceholder: React.FC<{ tab: TabId; symbol: string; benchmark: string; lookback: LookbackKey }> = ({ tab, symbol, benchmark, lookback }) => {
  const meta = TABS.find((t) => t.id === tab)!;
  const Icon = meta.icon;
  return (
    <div style={{
      padding: 24,
      borderRadius: 12,
      background: 'var(--card)',
      border: '1px solid var(--border)',
      display: 'grid',
      gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={15} color="var(--primary)" />
        </span>
        <div>
          <h2 className="ds-heading" style={{ margin: 0 }}>{meta.label}</h2>
          <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            {symbol} · benchmark {benchmark} · lookback {lookback}
          </p>
        </div>
      </div>

      <p className="ds-body" style={{ margin: 0, maxWidth: 760, color: 'var(--foreground)' }}>
        {TAB_BLURBS[tab]}
      </p>

      <div style={{
        padding: '10px 12px',
        borderRadius: 8,
        background: 'var(--muted)',
        border: '1px dashed var(--border)',
        fontSize: 11,
        color: 'var(--muted-foreground)',
      }}>
        Tab implementation lands in subsequent waves. Engine primitives, hooks, and panels wire here once Wave B/C/D/E ship.
      </div>
    </div>
  );
};

export default HistoricalIntelligenceTerminal;
