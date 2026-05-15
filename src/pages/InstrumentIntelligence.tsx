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
import { RefreshCw, Bookmark, X } from 'lucide-react';
import { toast } from 'sonner';
import type { BatchQuoteRow } from '../services/marketService';

const LS_KEY = 'deplyze_pinned_instruments';

function loadPinned(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]'); } catch { return []; }
}
function savePinned(syms: string[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(syms));
}

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
  onRemove?: () => void;
}> = ({ symbol, quote, loading, onOpen, onRemove }) => {
  const ohlcv = useOHLCV(symbol, '1day', 60);
  const closes = (ohlcv.data?.bars ?? []).map((b) => b.close);
  return (
    <div style={{ position: 'relative' }}>
      <MarketTile
        symbol={symbol}
        quote={quote?.ok ? quote.data : undefined}
        loading={loading}
        spark={closes}
        onClick={onOpen}
      />
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          title="Remove from list"
          style={{
            position: 'absolute', top: 6, right: 6,
            width: 18, height: 18, borderRadius: '50%',
            background: 'var(--card)', border: '1px solid var(--border)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--muted-foreground)', padding: 0,
          }}
        >
          <X size={9} />
        </button>
      )}
    </div>
  );
};

type ActiveView = { type: 'preset'; label: string } | { type: 'pinned' };

export const InstrumentIntelligence: React.FC = () => {
  const navigate = useNavigate();
  const drawer = useDrawer();
  const [activeView, setActiveView] = useState<ActiveView>({ type: 'preset', label: PRESETS[0].label });
  const [pinned, setPinned] = useState<string[]>(loadPinned);

  const activeSymbols = activeView.type === 'pinned'
    ? pinned
    : (PRESETS.find((p) => p.label === activeView.label)?.symbols ?? []);

  const quotes = useBatchQuotes(activeSymbols);

  const openDrawer = (sym: string) => drawer.open({
    title: sym,
    subtitle: 'Instrument intelligence preview',
    width: 560,
    body: <InstrumentDrawerBody symbol={sym} />,
  });

  const addToList = (sym: string) => {
    const upper = sym.toUpperCase();
    if (pinned.includes(upper)) { toast.info(`${upper} already in your list`); return; }
    const next = [...pinned, upper];
    setPinned(next);
    savePinned(next);
    toast.success(`${upper} added to your list`);
  };

  const removeFromList = (sym: string) => {
    const next = pinned.filter((s) => s !== sym.toUpperCase());
    setPinned(next);
    savePinned(next);
  };

  return (
    <div style={{ padding: '0 24px 32px', maxWidth: 1280, margin: '0 auto' }}>
      <PageHeader
        title="Instrument Intelligence"
        subtitle="Pick a preset universe or search any symbol. Use + to add any symbol to your saved list."
      />

      <InstrumentSelector
        onSelect={(s) => navigate(`/instruments/${encodeURIComponent(s)}`)}
        onAdd={addToList}
        addLabel="Save"
        placeholder="Search symbol to view or save (AAPL, EUR/USD, BTC/USD…)"
      />

      <nav style={{ display: 'flex', gap: 6, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        {PRESETS.map((p) => {
          const on = activeView.type === 'preset' && activeView.label === p.label;
          return (
            <button
              key={p.label}
              onClick={() => setActiveView({ type: 'preset', label: p.label })}
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

        {/* Saved list tab */}
        <button
          onClick={() => setActiveView({ type: 'pinned' })}
          style={{
            padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            border: `1px solid ${activeView.type === 'pinned' ? 'var(--primary)' : 'var(--border)'}`,
            background: activeView.type === 'pinned' ? 'rgba(193, 95, 60, 0.06)' : 'transparent',
            color: 'var(--foreground)',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}
        >
          <Bookmark size={11} />
          Saved{pinned.length > 0 ? ` (${pinned.length})` : ''}
        </button>

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
        {activeView.type === 'pinned' && pinned.length === 0 && (
          <div className="ds-empty" style={{ minHeight: 180 }}>
            <p className="ds-heading">No saved instruments</p>
            <p className="ds-caption" style={{ maxWidth: 300, textAlign: 'center' }}>
              Search any symbol above and click <strong>Save</strong> to add it here for quick access.
            </p>
          </div>
        )}
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
          {activeSymbols.map((sym) => {
            const row = quotes.data?.find((q) => q.symbol === sym.toUpperCase());
            return (
              <PresetTile
                key={sym}
                symbol={sym}
                quote={row}
                loading={quotes.loading}
                onOpen={() => openDrawer(sym)}
                onRemove={activeView.type === 'pinned' ? () => removeFromList(sym) : undefined}
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
