import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InstrumentSelector } from '../components/quant/InstrumentSelector';
import { PageHeader } from '../components/quant/PageHeader';
import { MarketTile } from '../components/quant/MarketTile';
import { FreshnessBadge } from '../components/quant/FreshnessBadge';
import { useDrawer } from '../components/quant/DataDrawer';
import { InstrumentDrawerBody } from '../components/quant/InstrumentDrawerBody';
import { useBatchQuotes, useOHLCV } from '../hooks/useMarket';
import { Disclaimer } from '../components/quant/Disclaimer';
import { RefreshCw } from 'lucide-react';
import type { BatchQuoteRow } from '../services/marketService';

const PRESETS: Array<{ label: string; symbols: string[] }> = [
  { label: 'US Mega-cap', symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META'] },
  { label: 'Major FX',    symbols: ['EUR/USD', 'USD/JPY', 'GBP/USD', 'AUD/USD', 'USD/CHF', 'USD/CAD'] },
  { label: 'Commodities', symbols: ['XAU/USD', 'XAG/USD', 'WTI/USD', 'BCO/USD'] },
  { label: 'Crypto',      symbols: ['BTC/USD', 'ETH/USD', 'SOL/USD'] },
];

const PresetTile: React.FC<{
  symbol: string;
  quote?: BatchQuoteRow;
  loading: boolean;
  onOpen: () => void;
}> = ({ symbol, quote, loading, onOpen }) => {
  const ohlcv = useOHLCV(symbol, '1day', 60);
  const closes = (ohlcv.data?.bars ?? []).map((b) => b.close);
  return (
    <MarketTile
      symbol={symbol}
      quote={quote?.ok ? quote.data : undefined}
      loading={loading}
      spark={closes}
      onClick={onOpen}
    />
  );
};

export const InstrumentIntelligence: React.FC = () => {
  const navigate = useNavigate();
  const drawer = useDrawer();
  const [activePreset, setActivePreset] = useState(PRESETS[0]);
  const quotes = useBatchQuotes(activePreset.symbols);

  const openDrawer = (sym: string) => drawer.open({
    title: sym,
    subtitle: 'Instrument intelligence preview',
    width: 560,
    body: <InstrumentDrawerBody symbol={sym} />,
  });

  return (
    <div style={{ padding: '0 24px 32px', maxWidth: 1280, margin: '0 auto' }}>
      <PageHeader
        title="Instrument Intelligence"
        subtitle="Pick a preset universe or search any symbol. Click a tile for the institutional preview; open the full briefing for fundamentals, narrative, and 60-day price action."
      />

      <InstrumentSelector onSelect={(s) => navigate(`/instruments/${encodeURIComponent(s)}`)} />

      <nav style={{ display: 'flex', gap: 6, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        {PRESETS.map((p) => {
          const on = activePreset.label === p.label;
          return (
            <button
              key={p.label}
              onClick={() => setActivePreset(p)}
              style={{
                padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
                background: on ? 'rgba(193, 95, 60, 0.06)' : 'transparent',
                color: 'var(--foreground)',
              }}
            >
              {p.label}
            </button>
          );
        })}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FreshnessBadge status={quotes.status} fetchedAt={quotes.fetchedAt} />
          <button
            onClick={() => quotes.refresh()}
            title="Refresh"
            style={{
              width: 26, height: 26, borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--card)',
              color: 'var(--muted-foreground)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <RefreshCw size={12} style={{ animation: quotes.isFetching ? 'spin 1s linear infinite' : undefined }} />
          </button>
        </div>
      </nav>

      <section style={{ marginTop: 14 }}>
        {quotes.error && !quotes.data && (
          <div className="ds-surface" style={{ padding: 12, borderRadius: 8, marginBottom: 10 }}>
            <p className="ds-caption" style={{ color: 'var(--primary)' }}>
              Failed to load quotes — {quotes.error.message}.{' '}
              <button onClick={() => quotes.refresh()} style={{
                background: 'transparent', border: 'none', color: 'var(--primary)',
                textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit',
              }}>Retry</button>
            </p>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {activePreset.symbols.map((sym) => {
            const row = quotes.data?.find((q) => q.symbol === sym.toUpperCase());
            return (
              <PresetTile
                key={sym}
                symbol={sym}
                quote={row}
                loading={quotes.loading}
                onOpen={() => openDrawer(sym)}
              />
            );
          })}
        </div>
      </section>
      <style>{`@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }`}</style>

      <Disclaimer />
    </div>
  );
};
