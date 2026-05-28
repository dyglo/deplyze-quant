import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Plus, X, Search, Briefcase, ListTree, Loader2, Trash2, ChevronDown,
  ChevronRight, TrendingUp, TrendingDown, Activity, AlertCircle,
  BarChart2, Globe, Zap, Star, Wallet, Archive,
} from 'lucide-react';
import { usePortfolioWorkspace } from '../../hooks/usePortfolioWorkspace';
import { usePortfolioIntelligence } from '../../hooks/usePortfolioIntelligence';
import { AgentIntelligenceFeed } from '../../components/quant/AgentIntelligenceFeed';
import { useAgentOutputs } from '../../hooks/useAgentIntelligence';
import { usePortfolioVulnerability } from '../../hooks/useAgentReasoning';
import { PortfolioVulnerabilityPanel } from '../../components/portfolio/PortfolioVulnerabilityPanel';
import { DEFAULT_BENCHMARK_ID, BENCHMARK_REGISTRY } from '../../lib/portfolio/benchmarks';
import type { Holding } from '../../lib/portfolio/schemas';
import { PortfolioIntelligencePanel } from '../../components/portfolio/PortfolioIntelligencePanel';
import { fetchOHLCV, symbolSearch, fetchQuote } from '../../services/marketService';
import type { OHLCVBar, Quote } from '../../types';
import { marketValue, unrealizedPnl, unrealizedPnlPct } from '../../lib/portfolio/holdingMath';
import {
  estimatedCost, remainingCash, pctOfBuyingPower, maxAffordableShares,
  estimatedProceeds, estimatedRealizedPnl, resultingWeight,
} from '../../lib/portfolio/tradeTicket';
import {
  logReturns, cumulativeLogReturns, rebase100,
} from '../../lib/quant/returns';
import { rollingAnnualisedVol } from '../../lib/quant/volatility';
import { maxDrawdown as computeMaxDrawdown } from '../../lib/quant/risk';
import { trendLabel } from '../../lib/quant/momentum';
import type { AssetClass } from '../../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtPct(v: number, sign = true): string {
  if (!isFinite(v)) return '—';
  const s = (v * 100).toFixed(2);
  return sign && v >= 0 ? `+${s}%` : `${s}%`;
}
function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtUSD(v: number, currency = 'USD'): string {
  if (!isFinite(v)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 }).format(v);
}
function fmtQty(v: number): string {
  if (!isFinite(v)) return '—';
  return v.toLocaleString('en-US', { maximumFractionDigits: 4 });
}
/** Most recent close from a bar series — a simple current-price proxy. */
function lastClose(bars: OHLCVBar[]): number | null {
  return bars.length > 0 ? bars[bars.length - 1].close : null;
}

const CONVICTION_COLORS: Record<string, string> = {
  highest: 'var(--primary)', high: 'var(--chart-2)',
  medium: 'var(--foreground)', low: 'var(--muted-foreground)',
};

const ASSET_CLASSES = ['equity', 'fx', 'commodity', 'index', 'bond', 'crypto', 'macro'] as const;

// ─── Mini sparkline ───────────────────────────────────────────────────────────

const MiniSparkline: React.FC<{ bars: OHLCVBar[]; color?: string }> = ({ bars, color = 'var(--primary)' }) => {
  const data = bars.slice(-30).map((b, i) => ({ i, c: b.close }));
  return (
    <ResponsiveContainer width={80} height={28}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="c" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
};

// ─── Add Holding Modal ────────────────────────────────────────────────────────

interface AddHoldingModalProps {
  onClose: () => void;
  /** Watchlist-style add — metadata only, no position. */
  onAdd: (params: {
    symbol: string; name: string; assetClass: AssetClass;
    conviction?: Holding['conviction']; notes?: string;
  }) => Promise<void>;
  /** Transactional buy — opens a position-backed holding via the ledger. */
  onBuy: (params: {
    symbol: string; name: string; assetClass: AssetClass;
    quantity: number; price: number; entryDate?: number;
    targetWeight?: number; conviction?: Holding['conviction'];
    thesis?: string; note?: string;
  }) => Promise<unknown>;
  currency?: string;
  /** Simulated buying power for the active portfolio. */
  availableCash?: number;
  /** Portfolio NAV (cash + invested) for resulting-weight estimates. */
  nav?: number;
}

const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' };
const fieldStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 5, fontSize: 12, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', outline: 'none', fontVariantNumeric: 'tabular-nums' };

/** Live-quote header: current price, day change, day range, as-of. */
const QuoteHeader: React.FC<{ quote: Quote | null; loading: boolean; currency: string }> = ({ quote, loading, currency }) => {
  if (loading && !quote) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', fontSize: 11, color: 'var(--muted-foreground)' }}>
        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} /> Fetching live quote…
      </div>
    );
  }
  if (!quote) return null;
  const up = quote.change >= 0;
  const col = up ? 'var(--chart-2)' : 'var(--destructive)';
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--muted)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(quote.price, currency)}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: col, fontVariantNumeric: 'tabular-nums' }}>
          {up ? '+' : ''}{fmtUSD(quote.change, currency)} ({up ? '+' : ''}{quote.changePercent.toFixed(2)}%)
        </span>
      </div>
      <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>
        <div>Day {fmtUSD(quote.low, currency)}–{fmtUSD(quote.high, currency)}</div>
        <div>as of {new Date(quote.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} · {quote.source}</div>
      </div>
    </div>
  );
};

const AddHoldingModal: React.FC<AddHoldingModalProps> = ({ onClose, onAdd, onBuy, currency = 'USD', availableCash, nav }) => {
  const [inputValue, setInputValue] = useState('');
  const [results, setResults] = useState<Array<{ symbol: string; name: string; type: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<{ symbol: string; name: string } | null>(null);
  const [conviction, setConviction] = useState<Holding['conviction']>('medium');
  const [assetClass, setAssetClass] = useState<Holding['assetClass']>('equity');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const reqId = useRef(0);

  // Position-entry state.
  const [mode, setMode] = useState<'position' | 'watchlist'>('position');
  const [amountMode, setAmountMode] = useState<'dollars' | 'shares'>('dollars');
  const [amountStr, setAmountStr] = useState('');
  const [sharesStr, setSharesStr] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [priceLoading, setPriceLoading] = useState(false);
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [targetStr, setTargetStr] = useState('');

  useEffect(() => {
    const raw = inputValue.trim();
    if (!raw || raw.length < 2 || selected) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const current = ++reqId.current;

    const tid = setTimeout(async () => {
      try {
        const hits = await symbolSearch(raw);
        if (reqId.current !== current) return;
        const seen = new Set<string>();
        const deduped = hits
          .filter(h => { if (seen.has(h.symbol)) return false; seen.add(h.symbol); return true; })
          .slice(0, 8)
          .map(h => ({ symbol: h.symbol, name: h.name ?? h.symbol, type: h.type ?? 'equity' }));
        setResults(deduped);
      } catch {
        if (reqId.current === current) setResults([]);
      } finally {
        if (reqId.current === current) setSearching(false);
      }
    }, 300);

    return () => clearTimeout(tid);
  }, [inputValue, selected]);

  const handleSelect = async (r: { symbol: string; name: string }) => {
    setSelected(r);
    setInputValue(`${r.symbol} — ${r.name}`);
    setResults([]);
    setSearching(false);
    setQuote(null);
    // Fetch a live quote: prefill entry price and show the quote header.
    setPriceLoading(true);
    try {
      const q = await fetchQuote(r.symbol);
      setQuote(q);
      if (q.price > 0) setPriceStr(String(Number(q.price.toFixed(4))));
    } catch {
      // Fall back to the latest daily close if the quote endpoint fails.
      try {
        const { bars } = await fetchOHLCV(r.symbol, '1day', 5);
        const px = lastClose(bars);
        if (px != null) setPriceStr(String(Number(px.toFixed(4))));
      } catch { /* leave price blank — user can enter manually */ }
    } finally { setPriceLoading(false); }
  };

  const handleInputChange = (val: string) => {
    setInputValue(val);
    setSelected(null);
    if (!val.trim()) setResults([]);
  };

  const price = Number(priceStr);
  const priceValid = Number.isFinite(price) && price > 0;
  const shares = amountMode === 'shares'
    ? Number(sharesStr)
    : (priceValid && amountStr ? Number(amountStr) / price : 0);
  const dollarValue = priceValid ? shares * price : 0;
  const sharesValid = Number.isFinite(shares) && shares > 0;
  const positionReady = mode === 'watchlist' || (priceValid && sharesValid);
  const canSubmit = !!selected && positionReady && !adding;

  // Buy-ticket preview (simulated). Over-cash warns but does not block.
  const cost = priceValid && sharesValid ? estimatedCost(shares, price) : 0;
  const hasCash = availableCash != null;
  const remCash = hasCash ? remainingCash(availableCash!, cost) : null;
  const bpUsed = hasCash ? pctOfBuyingPower(cost, availableCash!) : null;
  const estWeight = nav != null && nav > 0 ? resultingWeight(cost, nav) : null;
  const maxShares = hasCash && priceValid ? maxAffordableShares(availableCash!, price) : null;
  const overCash = hasCash && cost > availableCash! + 1e-9;

  const handleSubmit = async () => {
    if (!selected || !canSubmit) return;
    setAdding(true);
    try {
      if (mode === 'watchlist') {
        await onAdd({ symbol: selected.symbol, name: selected.name, assetClass, conviction, notes: notes.trim() });
      } else {
        const target = targetStr.trim() === '' ? undefined : Number(targetStr) / 100;
        await onBuy({
          symbol: selected.symbol,
          name: selected.name,
          assetClass,
          quantity: shares,
          price,
          entryDate: Date.parse(dateStr) || Date.now(),
          targetWeight: target != null && Number.isFinite(target) ? target : undefined,
          conviction,
          thesis: notes.trim() || undefined,
        });
      }
      onClose();
    } catch { setAdding(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 440, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>Add Holding</p>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex' }}><X size={16} /></button>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: 'var(--muted)', padding: 3, borderRadius: 7 }}>
          {(['position', 'watchlist'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1, padding: '6px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: 'none', textTransform: 'capitalize',
                background: mode === m ? 'var(--card)' : 'transparent',
                color: mode === m ? 'var(--foreground)' : 'var(--muted-foreground)',
                boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {m === 'position' ? 'Position (buy)' : 'Watchlist only'}
            </button>
          ))}
        </div>

        {/* Symbol search */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Symbol or Name</label>
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
            <input
              autoFocus
              value={inputValue}
              onChange={e => handleInputChange(e.target.value)}
              placeholder="Search AAPL, MSFT, BTC..."
              style={{ ...fieldStyle, padding: '8px 10px 8px 30px', fontSize: 13 }}
            />
            {searching && <Loader2 size={12} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />}
          </div>

          {results.length > 0 && !selected && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, marginTop: 4, overflow: 'hidden', background: 'var(--popover)' }}>
              {results.map(r => (
                <button
                  key={r.symbol}
                  onClick={() => handleSelect(r)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--foreground)', textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontWeight: 600 }}>{r.symbol}</span>
                  <span style={{ color: 'var(--muted-foreground)', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div style={{ marginTop: 6, padding: '6px 10px', background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)', borderRadius: 5, fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>
              ✓ {selected.symbol} — {selected.name}
            </div>
          )}
        </div>

        {/* Asset class + conviction */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Asset Class</label>
            <select value={assetClass} onChange={e => setAssetClass(e.target.value as Holding['assetClass'])} style={fieldStyle}>
              {ASSET_CLASSES.map(ac => <option key={ac} value={ac}>{ac}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Conviction</label>
            <select value={conviction} onChange={e => setConviction(e.target.value as Holding['conviction'])} style={fieldStyle}>
              <option value="highest">Highest</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* Live quote header (position mode) */}
        {mode === 'position' && selected && (
          <div style={{ marginBottom: 12 }}>
            <QuoteHeader quote={quote} loading={priceLoading} currency={currency} />
          </div>
        )}

        {/* Position details — only in position mode */}
        {mode === 'position' && (
          <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: 'var(--muted)', border: '1px solid var(--border)' }}>
            {/* Buying power */}
            {hasCash && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, fontSize: 11 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--muted-foreground)' }}>
                  <Wallet size={12} /> Available cash
                </span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(availableCash!, currency)}</span>
              </div>
            )}

            {/* Entry price + date */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>Entry Price</label>
                <div style={{ position: 'relative' }}>
                  <input value={priceStr} onChange={e => setPriceStr(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0.00" style={fieldStyle} />
                  {priceLoading && <Loader2 size={11} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Purchase Date</label>
                <input type="date" value={dateStr} max={new Date().toISOString().slice(0, 10)} onChange={e => setDateStr(e.target.value)} style={fieldStyle} />
              </div>
            </div>

            {/* Amount mode toggle */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {(['dollars', 'shares'] as const).map(am => (
                <button
                  key={am}
                  onClick={() => setAmountMode(am)}
                  style={{
                    flex: 1, padding: '5px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                    border: `1px solid ${amountMode === am ? 'var(--primary)' : 'var(--border)'}`,
                    background: amountMode === am ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'var(--background)',
                    color: amountMode === am ? 'var(--primary)' : 'var(--muted-foreground)',
                  }}
                >
                  {am === 'dollars' ? `Amount (${currency})` : 'Shares'}
                </button>
              ))}
            </div>

            {amountMode === 'dollars' ? (
              <input value={amountStr} onChange={e => setAmountStr(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder={`Amount to allocate (${currency})`} style={fieldStyle} />
            ) : (
              <input value={sharesStr} onChange={e => setSharesStr(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="Number of shares" style={fieldStyle} />
            )}

            {/* Max affordable hint */}
            {maxShares != null && priceValid && (
              <p style={{ margin: '5px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>
                Max ≈ {fmtQty(maxShares)} shares with available cash
              </p>
            )}

            {/* Order preview */}
            {priceValid && sharesValid && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>{amountMode === 'dollars' ? `≈ ${fmtQty(shares)} shares` : `≈ ${fmtUSD(dollarValue, currency)}`}</span>
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>Cost {fmtUSD(cost, currency)}</span>
                </div>
                {bpUsed != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>
                    <span>Buying power used</span>
                    <span>{isFinite(bpUsed) ? `${(bpUsed * 100).toFixed(1)}%` : '—'}</span>
                  </div>
                )}
                {remCash != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ color: 'var(--muted-foreground)' }}>Cash after</span>
                    <span style={{ color: remCash < 0 ? 'var(--destructive)' : 'var(--foreground)' }}>{fmtUSD(remCash, currency)}</span>
                  </div>
                )}
                {estWeight != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>
                    <span>Est. portfolio weight</span>
                    <span>{(estWeight * 100).toFixed(1)}%</span>
                  </div>
                )}
                {overCash && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, padding: '5px 8px', borderRadius: 5, background: 'color-mix(in srgb, var(--destructive) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--destructive) 25%, transparent)', color: 'var(--destructive)', fontSize: 10.5 }}>
                    <AlertCircle size={12} /> Exceeds available cash — simulated cash will go negative.
                  </div>
                )}
              </div>
            )}

            {/* Target allocation */}
            <div style={{ marginTop: 10 }}>
              <label style={labelStyle}>Target Allocation % (optional)</label>
              <input value={targetStr} onChange={e => setTargetStr(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="e.g. 5" style={fieldStyle} />
            </div>
          </div>
        )}

        {/* Thesis / notes */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>{mode === 'position' ? 'Thesis (optional)' : 'Notes (optional)'}</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Thesis, context, narrative exposure..." style={{ ...fieldStyle, resize: 'none' }} />
        </div>

        <button
          disabled={!canSubmit}
          onClick={handleSubmit}
          style={{ width: '100%', padding: '10px', borderRadius: 7, fontSize: 13, fontWeight: 600, background: canSubmit ? 'var(--primary)' : 'var(--muted)', color: canSubmit ? 'var(--primary-foreground)' : 'var(--muted-foreground)', border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          {adding ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : <><Plus size={13} /> {mode === 'position' ? 'Buy & Add Position' : 'Add to Watchlist'}</>}
        </button>
      </div>
    </div>
  );
};

// ─── Transaction Action Modal (manage existing position) ───────────────────────

interface TransactionActionModalProps {
  holding: Holding;
  currency?: string;
  onClose: () => void;
  onAddTo: (p: { symbol: string; quantity: number; price: number; note?: string }) => Promise<unknown>;
  onTrim: (p: { symbol: string; quantity: number; price: number; note?: string }) => Promise<unknown>;
  onSell: (p: { symbol: string; quantity: number; price: number; note?: string }) => Promise<unknown>;
  onClosePosition: (p: { symbol: string; quantity: number; price: number; note?: string }) => Promise<unknown>;
}

type ManageAction = 'add' | 'trim' | 'sell' | 'close';

const TransactionActionModal: React.FC<TransactionActionModalProps> = ({ holding, currency = 'USD', onClose, onAddTo, onTrim, onSell, onClosePosition }) => {
  const heldQty = holding.quantity ?? 0;
  const avgCost = holding.costBasis ?? 0;
  const [action, setAction] = useState<ManageAction>('add');
  const [qtyStr, setQtyStr] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [priceLoading, setPriceLoading] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPriceLoading(true);
    fetchQuote(holding.symbol)
      .then(q => { setQuote(q); if (q.price > 0) setPriceStr(String(Number(q.price.toFixed(4)))); })
      .catch(async () => {
        try {
          const { bars } = await fetchOHLCV(holding.symbol, '1day', 5);
          const px = lastClose(bars);
          if (px != null) setPriceStr(String(Number(px.toFixed(4))));
        } catch { /* manual entry */ }
      })
      .finally(() => setPriceLoading(false));
  }, [holding.symbol]);

  const price = Number(priceStr);
  const priceValid = Number.isFinite(price) && price > 0;
  const isReducing = action === 'trim' || action === 'sell';
  const isExit = isReducing || action === 'close';
  const qty = action === 'close' ? heldQty : Number(qtyStr);
  const qtyValid = action === 'close'
    ? heldQty > 0
    : Number.isFinite(qty) && qty > 0 && (!isReducing || qty <= heldQty + 1e-9);
  const canSubmit = priceValid && qtyValid && !busy;

  // Ticket preview.
  const proceeds = priceValid && qtyValid && isExit ? estimatedProceeds(qty, price) : 0;
  const realized = priceValid && qtyValid && isExit && avgCost > 0 ? estimatedRealizedPnl(qty, price, avgCost) : null;
  const addCost = priceValid && qtyValid && action === 'add' ? estimatedCost(qty, price) : 0;
  const remainingQty = isReducing && qtyValid ? Math.max(0, heldQty - qty) : (action === 'close' ? 0 : heldQty + (action === 'add' ? (qtyValid ? qty : 0) : 0));

  const ACTIONS: { key: ManageAction; label: string; color: string }[] = [
    { key: 'add', label: 'Add', color: 'var(--chart-2)' },
    { key: 'trim', label: 'Trim', color: 'var(--chart-4)' },
    { key: 'sell', label: 'Sell', color: 'var(--chart-4)' },
    { key: 'close', label: 'Close', color: 'var(--destructive)' },
  ];

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    const p = { symbol: holding.symbol, quantity: qty, price, note: note.trim() || undefined };
    try {
      if (action === 'add') await onAddTo(p);
      else if (action === 'trim') await onTrim(p);
      else if (action === 'sell') await onSell(p);
      else await onClosePosition(p);
      onClose();
    } catch { setBusy(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 420, maxWidth: '94vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>Manage {holding.symbol}</p>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex' }}><X size={16} /></button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--muted-foreground)' }}>
          Holding {fmtQty(heldQty)} units · avg cost {holding.costBasis != null ? fmtUSD(holding.costBasis, currency) : '—'}
        </p>

        {/* Live quote */}
        <div style={{ marginBottom: 14 }}>
          <QuoteHeader quote={quote} loading={priceLoading} currency={currency} />
        </div>

        {/* Action picker */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {ACTIONS.map(a => (
            <button
              key={a.key}
              onClick={() => setAction(a.key)}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${action === a.key ? a.color : 'var(--border)'}`,
                background: action === a.key ? `color-mix(in srgb, ${a.color} 14%, transparent)` : 'var(--background)',
                color: action === a.key ? a.color : 'var(--muted-foreground)',
              }}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* Quantity + price */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>{action === 'close' ? 'Quantity (full)' : 'Quantity'}</label>
            <input
              value={action === 'close' ? fmtQty(heldQty) : qtyStr}
              onChange={e => setQtyStr(e.target.value.replace(/[^0-9.]/g, ''))}
              disabled={action === 'close'}
              inputMode="decimal"
              placeholder={isReducing ? `Max ${fmtQty(heldQty)}` : '0'}
              style={{ ...fieldStyle, opacity: action === 'close' ? 0.6 : 1 }}
            />
          </div>
          <div>
            <label style={labelStyle}>Price</label>
            <div style={{ position: 'relative' }}>
              <input value={priceStr} onChange={e => setPriceStr(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0.00" style={fieldStyle} />
              {priceLoading && <Loader2 size={11} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />}
            </div>
          </div>
        </div>

        {isReducing && qty > heldQty && (
          <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--destructive)' }}>Cannot reduce more than the {fmtQty(heldQty)} units held.</p>
        )}

        {/* Ticket preview */}
        {priceValid && qtyValid && (
          <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 7, background: 'var(--muted)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
            {action === 'add' ? (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted-foreground)' }}>Estimated cost</span>
                <span style={{ fontWeight: 700 }}>{fmtUSD(addCost, currency)}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted-foreground)' }}>Estimated proceeds</span>
                <span style={{ fontWeight: 700 }}>{fmtUSD(proceeds, currency)}</span>
              </div>
            )}
            {realized != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted-foreground)' }}>Realized P&L at this price</span>
                <span style={{ fontWeight: 700, color: realized >= 0 ? 'var(--chart-2)' : 'var(--destructive)' }}>
                  {realized >= 0 ? '+' : ''}{fmtUSD(realized, currency)}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted-foreground)' }}>
              <span>Remaining position</span>
              <span>{fmtQty(remainingQty)} units{remainingQty === 0 && isExit ? ' · closed' : ''}</span>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Note (optional)</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Thesis review, reason for the action…" style={{ ...fieldStyle, resize: 'none' }} />
        </div>

        <button
          disabled={!canSubmit}
          onClick={submit}
          style={{ width: '100%', padding: '10px', borderRadius: 7, fontSize: 13, fontWeight: 600, background: canSubmit ? 'var(--primary)' : 'var(--muted)', color: canSubmit ? 'var(--primary-foreground)' : 'var(--muted-foreground)', border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          {busy ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Recording…</> : <>Record {action.charAt(0).toUpperCase() + action.slice(1)}</>}
        </button>
      </div>
    </div>
  );
};

// ─── Holding Intelligence Drawer ──────────────────────────────────────────────

interface HoldingDrawerProps {
  holding: Holding;
  benchmarkId: string;
  onClose: () => void;
  onRemove: () => void;
}

const HoldingDrawer: React.FC<HoldingDrawerProps> = ({ holding, benchmarkId, onClose, onRemove }) => {
  const [bars, setBars] = useState<OHLCVBar[]>([]);
  const [benchBars, setBenchBars] = useState<OHLCVBar[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      fetchOHLCV(holding.symbol, '1day', 120),
      fetchOHLCV(benchmarkId, '1day', 120),
    ]).then(([r1, r2]) => {
      if (r1.status === 'fulfilled') setBars(r1.value.bars);
      if (r2.status === 'fulfilled') setBenchBars(r2.value.bars);
      setLoading(false);
    });
  }, [holding.symbol, benchmarkId]);

  const { curve, bmCurve, volPct, mdd, trend } = useMemo(() => {
    if (bars.length < 10) return { curve: [], bmCurve: [], volPct: 0, mdd: 0, trend: 'neutral' };
    const closes = bars.map(b => b.close);
    const lr = logReturns(closes);
    const curve = rebase100(cumulativeLogReturns(lr)).map((v, i) => ({ ts: bars[i + 1]?.ts ?? 0, v }));
    const bmCloses = benchBars.map(b => b.close);
    const bmLr = logReturns(bmCloses);
    const bmCurve = rebase100(cumulativeLogReturns(bmLr)).map((v, i) => ({ ts: benchBars[i + 1]?.ts ?? 0, v }));
    const volArr = rollingAnnualisedVol(lr, 21);
    const volPct = volArr[volArr.length - 1] ?? 0;
    const { mdd } = computeMaxDrawdown(lr);
    const tl = trendLabel(closes);
    return { curve, bmCurve, volPct, mdd, trend: tl.label };
  }, [bars, benchBars]);

  // Align curves for comparison chart
  const comparisonData = useMemo(() => {
    const len = Math.min(curve.length, bmCurve.length);
    return curve.slice(-len).map((p, i) => ({
      ts: p.ts,
      symbol: p.v,
      benchmark: bmCurve[bmCurve.length - len + i]?.v ?? 100,
    }));
  }, [curve, bmCurve]);

  const totalReturn = curve.length > 1 ? (curve[curve.length - 1].v / 100 - 1) : 0;
  const bmReturn = bmCurve.length > 1 ? (bmCurve[bmCurve.length - 1].v / 100 - 1) : 0;

  const TREND_COLOR: Record<string, string> = { bull: 'var(--chart-2)', bear: 'var(--destructive)', neutral: 'var(--muted-foreground)' };
  const trendKey = (trend === 'strong-up' || trend === 'up') ? 'bull' : (trend === 'down' || trend === 'strong-down') ? 'bear' : 'neutral';

  return (
    <div
      style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 100,
        width: 400, background: 'var(--card)', borderLeft: '1px solid var(--border)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--foreground)' }}>{holding.symbol}</p>
            <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>{holding.assetClass}</span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-foreground)' }}>{holding.name}</p>
        </div>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex', padding: 4 }}><X size={16} /></button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
        </div>
      ) : (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Intelligence badges */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: `color-mix(in srgb, ${TREND_COLOR[trendKey]} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${TREND_COLOR[trendKey]} 25%, transparent)`, color: TREND_COLOR[trendKey], textTransform: 'uppercase' }}>
              {String(trend).replace('-', ' ')}
            </span>
            <span style={{ padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: 'color-mix(in srgb, var(--chart-4) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--chart-4) 25%, transparent)', color: 'var(--chart-4)', textTransform: 'uppercase' }}>
              Vol {volPct.toFixed(1)}%
            </span>
            {holding.conviction && (
              <span style={{ padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: `color-mix(in srgb, ${CONVICTION_COLORS[holding.conviction]} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${CONVICTION_COLORS[holding.conviction]} 20%, transparent)`, color: CONVICTION_COLORS[holding.conviction], textTransform: 'uppercase' }}>
                {holding.conviction} conviction
              </span>
            )}
          </div>

          {/* Quick metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: '120D Return', value: fmtPct(totalReturn), color: totalReturn >= 0 ? 'var(--chart-2)' : 'var(--destructive)' },
              { label: 'vs Benchmark', value: fmtPct(totalReturn - bmReturn), color: (totalReturn - bmReturn) >= 0 ? 'var(--chart-2)' : 'var(--destructive)' },
              { label: 'Max Drawdown', value: fmtPct(mdd), color: 'var(--destructive)' },
            ].map(m => (
              <div key={m.label} style={{ padding: '8px 10px', background: 'var(--muted)', borderRadius: 7, border: '1px solid var(--border)' }}>
                <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</p>
                <p style={{ margin: '3px 0 0', fontSize: 13, fontWeight: 700, color: m.color, fontVariantNumeric: 'tabular-nums' }}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Benchmark comparison chart */}
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              120D Performance vs {benchmarkId}
            </p>
            {comparisonData.length > 5 ? (
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={comparisonData} margin={{ top: 2, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="ts" tickFormatter={fmtDate} tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(0)} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const sym = payload.find(p => p.dataKey === 'symbol');
                      const bm = payload.find(p => p.dataKey === 'benchmark');
                      return (
                        <div style={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 10 }}>
                          {sym && <p style={{ margin: 0, color: 'var(--primary)', fontWeight: 700 }}>{holding.symbol}: {(sym.value as number).toFixed(1)}</p>}
                          {bm && <p style={{ margin: '2px 0 0', color: 'var(--chart-2)', fontWeight: 600 }}>{benchmarkId}: {(bm.value as number).toFixed(1)}</p>}
                        </div>
                      );
                    }}
                  />
                  <Line type="monotone" dataKey="symbol" stroke="var(--primary)" strokeWidth={2} dot={false} name={holding.symbol} />
                  <Line type="monotone" dataKey="benchmark" stroke="var(--chart-2)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name={benchmarkId} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0 }}>Insufficient data for chart.</p>
            )}
          </div>

          {/* Holding metadata */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {holding.sector && (
              <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--muted-foreground)', minWidth: 70 }}>Sector</span>
                <span style={{ fontWeight: 500 }}>{holding.sector}</span>
              </div>
            )}
            {holding.region && (
              <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--muted-foreground)', minWidth: 70 }}>Region</span>
                <span style={{ fontWeight: 500 }}>{holding.region}</span>
              </div>
            )}
            {holding.notes && (
              <div style={{ marginTop: 4, padding: '8px 12px', background: 'var(--muted)', borderRadius: 6, fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
                {holding.notes}
              </div>
            )}
          </div>

          {/* Remove */}
          <button
            onClick={onRemove}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--destructive) 35%, transparent)', background: 'color-mix(in srgb, var(--destructive) 8%, transparent)', color: 'var(--destructive)', cursor: 'pointer', fontSize: 12, fontWeight: 600, marginTop: 4 }}
          >
            <Trash2 size={12} /> Remove from Portfolio
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Holdings row ─────────────────────────────────────────────────────────────

const HoldingRow: React.FC<{
  holding: Holding;
  weight: number;
  index: number;
  currency: string;
  onOpen: () => void;
  onManage: () => void;
}> = ({ holding, weight, index, currency, onOpen, onManage }) => {
  const [bars, setBars] = useState<OHLCVBar[]>([]);

  useEffect(() => {
    fetchOHLCV(holding.symbol, '1day', 30).then(r => setBars(r.bars)).catch(() => {});
  }, [holding.symbol]);

  const { totalReturn, trendKey, price } = useMemo(() => {
    if (bars.length < 5) return { totalReturn: 0, trendKey: 'neutral', price: null as number | null };
    const closes = bars.map(b => b.close);
    const lr = logReturns(closes);
    const totalReturn = Math.exp(lr.reduce((a, b) => a + b, 0)) - 1;
    const { label } = trendLabel(closes);
    const trendKey = (label === 'strong-up' || label === 'up') ? 'bull' : (label === 'down' || label === 'strong-down') ? 'bear' : 'neutral';
    return { totalReturn, trendKey, price: lastClose(bars) };
  }, [bars]);

  const TREND_DOT: Record<string, string> = { bull: 'var(--chart-2)', bear: 'var(--destructive)', neutral: 'var(--muted-foreground)' };

  const qty = holding.quantity ?? 0;
  const avgCost = holding.costBasis ?? 0;
  const hasPos = qty > 0;
  const mv = hasPos && price != null ? marketValue(qty, price) : null;
  const upnl = hasPos && price != null && avgCost > 0 ? unrealizedPnl(qty, price, avgCost) : null;
  const upnlPct = price != null && avgCost > 0 ? unrealizedPnlPct(price, avgCost) : null;

  return (
    <tr
      style={{
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        background: index % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--muted) 25%, transparent)',
        transition: 'background 120ms',
      }}
      onClick={onOpen}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
      onMouseLeave={e => (e.currentTarget.style.background = index % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--muted) 25%, transparent)')}
    >
      <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--foreground)', fontSize: 13, letterSpacing: '-0.01em' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: TREND_DOT[trendKey], flexShrink: 0 }} />
          {holding.symbol}
        </div>
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted-foreground)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{holding.name}</td>
      <td style={{ padding: '10px 12px', fontSize: 11 }}>
        <span style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--muted-foreground)', fontWeight: 600 }}>
          {holding.assetClass}
        </span>
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, fontVariantNumeric: 'tabular-nums', color: hasPos ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{hasPos ? fmtQty(qty) : '—'}</td>
      <td style={{ padding: '10px 12px', fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--muted-foreground)' }}>{hasPos && avgCost > 0 ? fmtUSD(avgCost, currency) : '—'}</td>
      <td style={{ padding: '10px 12px', fontSize: 12, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{mv != null ? fmtUSD(mv, currency) : '—'}</td>
      <td style={{ padding: '10px 12px', fontSize: 12, fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: upnl == null ? 'var(--muted-foreground)' : upnl >= 0 ? 'var(--chart-2)' : 'var(--destructive)' }}>
        {upnl != null ? (
          <span>{fmtUSD(upnl, currency)}{upnlPct != null ? <span style={{ fontWeight: 500, fontSize: 10, opacity: 0.8 }}> ({fmtPct(upnlPct)})</span> : null}</span>
        ) : '—'}
      </td>
      <td style={{ padding: '10px 12px', fontWeight: 600, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{(weight * 100).toFixed(1)}%</td>
      <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, color: totalReturn >= 0 ? 'var(--chart-2)' : 'var(--destructive)', fontVariantNumeric: 'tabular-nums' }}>
        {bars.length > 3 ? fmtPct(totalReturn) : '—'}
      </td>
      <td style={{ padding: '10px 12px' }}>
        {bars.length > 5 ? <MiniSparkline bars={bars} color={totalReturn >= 0 ? 'var(--chart-2)' : 'var(--destructive)'} /> : <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>—</span>}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: CONVICTION_COLORS[holding.conviction ?? 'medium'] ?? 'var(--foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {holding.conviction ?? 'medium'}
        </span>
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        <button
          onClick={e => { e.stopPropagation(); onManage(); }}
          title="Buy / Add / Trim / Sell / Close"
          style={{ padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', cursor: 'pointer' }}
        >
          Manage
        </button>
      </td>
    </tr>
  );
};

// ─── Closed positions table ────────────────────────────────────────────────────

const ClosedPositions: React.FC<{ holdings: Holding[]; currency: string }> = ({ holdings, currency }) => (
  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
    <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 7 }}>
      <Archive size={13} style={{ color: 'var(--muted-foreground)' }} />
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>Closed Positions ({holdings.length})</p>
      <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>· Retained for history</span>
    </div>
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
            {['Symbol', 'Name', 'Realized P&L', 'Closed'].map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {holdings.map((h, i) => {
            const rp = h.realizedPnl ?? 0;
            return (
              <tr key={h.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--muted) 25%, transparent)' }}>
                <td style={{ padding: '9px 12px', fontWeight: 700 }}>{h.symbol}</td>
                <td style={{ padding: '9px 12px', color: 'var(--muted-foreground)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</td>
                <td style={{ padding: '9px 12px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: rp >= 0 ? 'var(--chart-2)' : 'var(--destructive)' }}>{fmtUSD(rp, currency)}</td>
                <td style={{ padding: '9px 12px', color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>{h.closedAt ? new Date(h.closedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

// ─── Empty state ──────────────────────────────────────────────────────────────

const EmptyHoldings: React.FC<{ onAdd: () => void; portfolioName: string }> = ({ onAdd, portfolioName }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 24px', textAlign: 'center' }}>
    <div style={{ width: 48, height: 48, borderRadius: 12, background: 'color-mix(in srgb, var(--chart-2) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--chart-2) 20%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
      <ListTree size={20} style={{ color: 'var(--chart-2)' }} />
    </div>
    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>{portfolioName} has no holdings</p>
    <p style={{ margin: '8px 0 20px', fontSize: 12, color: 'var(--muted-foreground)', maxWidth: 340, lineHeight: 1.6 }}>
      Add equities, ETFs, FX pairs, commodities, or any tradeable instrument. Intelligence overlays, volatility state, regime fit, and benchmark-relative analysis populate automatically.
    </p>
    <button onClick={onAdd} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 7, background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
      <Plus size={14} /> Add First Holding
    </button>
  </div>
);

// ─── Main page ────────────────────────────────────────────────────────────────

export const HoldingsWatchlist: React.FC = () => {
  const {
    portfolios, selectedPortfolio, activeHoldings, closedHoldings, loading, holdingsLoading,
    selectPortfolio, createNew,
    addNewHolding, removeExistingHolding,
    buyHolding, addToHolding, trimHolding, sellHolding, closeHolding,
    effectiveWeights,
  } = usePortfolioWorkspace();

  const [showAdd, setShowAdd] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [drawerHolding, setDrawerHolding] = useState<Holding | null>(null);
  const [manageHolding, setManageHolding] = useState<Holding | null>(null);
  const [filter, setFilter] = useState('');
  const [sortCol, setSortCol] = useState<'weight' | 'symbol' | 'return' | 'conviction'>('weight');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const currency = selectedPortfolio?.currency ?? 'USD';
  const availableCash = selectedPortfolio?.cashBalance;
  // NAV estimate (cash + invested at cost) for resulting-weight previews.
  const investedAtCost = activeHoldings.reduce((s, h) => s + (h.quantity ?? 0) * (h.costBasis ?? 0), 0);
  const nav = availableCash != null ? availableCash + investedAtCost : (investedAtCost > 0 ? investedAtCost : undefined);

  const handleSort = useCallback((col: typeof sortCol) => {
    setSortCol(prev => {
      if (prev === col) { setSortDir(d => (d === 1 ? -1 : 1)); return col; }
      setSortDir(-1);
      return col;
    });
  }, []);

  const filtered = useMemo(() =>
    activeHoldings.filter(h =>
      !filter || h.symbol.toUpperCase().includes(filter.toUpperCase()) || h.name.toLowerCase().includes(filter.toLowerCase())
    ), [activeHoldings, filter]);

  const benchmarkId = selectedPortfolio?.benchmarkId ?? DEFAULT_BENCHMARK_ID;

  const hhi = useMemo(
    () => Object.values(effectiveWeights).reduce((s, w) => s + w * w, 0),
    [effectiveWeights],
  );
  const top3Weight = useMemo(() => {
    const sorted = Object.values(effectiveWeights).sort((a, b) => b - a);
    return sorted.slice(0, 3).reduce((s, w) => s + w, 0);
  }, [effectiveWeights]);

  const { observations, acknowledge } = usePortfolioIntelligence(
    selectedPortfolio?.id,
    activeHoldings.length > 0 ? { holdings: activeHoldings, effectiveWeights, hhi, top3Weight } : null,
  );

  // V4: per-holding agent observations + vulnerability
  const holdingSymbols = activeHoldings.map(h => h.symbol);
  const holdingsAgentOutputs = useAgentOutputs({
    placement: 'PortfolioOverview',
    limit: 20,
  });
  const holdingOutputs = holdingsAgentOutputs.data.filter(
    o => o.symbols?.some(s => holdingSymbols.includes(s))
  );

  const vulnHoldings = activeHoldings.map(h => ({
    symbol: h.symbol,
    weight: effectiveWeights[h.symbol] ?? 0,
    asset_class: h.assetClass,
  }));
  const vulnerability = usePortfolioVulnerability(
    vulnHoldings,
    selectedPortfolio?.id,
  );

  const handleRemove = useCallback(async (holding: Holding) => {
    setDrawerHolding(null);
    await removeExistingHolding(holding.id);
  }, [removeExistingHolding]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
      </div>
    );
  }

  if (portfolios.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', padding: 24 }}>
        <Briefcase size={24} style={{ color: 'var(--muted-foreground)', marginBottom: 12, opacity: 0.5 }} />
        <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>No portfolios yet</p>
        <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '0 0 20px' }}>Create a portfolio from the Portfolio Overview page first.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '-0.02em' }}>Holdings & Watchlist</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
            {selectedPortfolio?.name} · {activeHoldings.length} active{closedHoldings.length > 0 ? ` · ${closedHoldings.length} closed` : ''}
            {selectedPortfolio?.cashBalance != null ? ` · Cash ${fmtUSD(selectedPortfolio.cashBalance, currency)}` : ''}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Portfolio selector */}
          {portfolios.length > 1 && (
            <select
              value={selectedPortfolio?.id ?? ''}
              onChange={e => selectPortfolio(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer' }}
            >
              {portfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          {/* Filter */}
          {activeHoldings.length > 0 && (
            <div style={{ position: 'relative' }}>
              <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter holdings..."
                style={{ padding: '6px 10px 6px 24px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', width: 160 }}
              />
            </div>
          )}

          <button
            onClick={() => setShowAdd(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            <Plus size={12} /> Add Holding
          </button>
        </div>
      </div>

      {/* Holdings table */}
      <PortfolioIntelligencePanel observations={observations} onAcknowledge={acknowledge} />

      <div style={{ padding: '16px 24px' }}>
        {holdingsLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 16, color: 'var(--muted-foreground)', fontSize: 12 }}>
            <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} /> Loading holdings…
          </div>
        ) : filtered.length === 0 && activeHoldings.length === 0 && closedHoldings.length === 0 ? (
          <EmptyHoldings onAdd={() => setShowAdd(true)} portfolioName={selectedPortfolio?.name ?? 'Portfolio'} />
        ) : (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>
                {filtered.length} Holding{filtered.length !== 1 ? 's' : ''}
                {filter && ` matching "${filter}"`}
              </p>
              <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Click a row to open intelligence drawer</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
                    {([
                      { key: 'symbol', label: 'Symbol' },
                      { key: null, label: 'Name' },
                      { key: null, label: 'Class' },
                      { key: null, label: 'Qty' },
                      { key: null, label: 'Avg Cost' },
                      { key: null, label: 'Mkt Value' },
                      { key: null, label: 'Unrl P&L' },
                      { key: 'weight', label: 'Weight' },
                      { key: 'return', label: '30D Return' },
                      { key: null, label: 'Trend' },
                      { key: 'conviction', label: 'Conviction' },
                      { key: null, label: '' },
                    ] as { key: typeof sortCol | null; label: string }[]).map(({ key, label }) => (
                      <th
                        key={label || '_action'}
                        onClick={() => key && handleSort(key)}
                        style={{
                          padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                          color: key && sortCol === key ? 'var(--foreground)' : 'var(--muted-foreground)',
                          textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                          cursor: key ? 'pointer' : 'default',
                          userSelect: 'none',
                        }}
                      >
                        {label}
                        {key && sortCol === key && (
                          <span style={{ marginLeft: 3, fontSize: 9 }}>{sortDir === -1 ? '↓' : '↑'}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered
                    .slice()
                    .sort((a, b) => {
                      let v = 0;
                      if (sortCol === 'weight') v = (effectiveWeights[a.symbol] ?? 0) - (effectiveWeights[b.symbol] ?? 0);
                      else if (sortCol === 'symbol') v = a.symbol.localeCompare(b.symbol);
                      else if (sortCol === 'conviction') {
                        const order = { highest: 4, high: 3, medium: 2, low: 1 };
                        v = (order[a.conviction ?? 'medium'] ?? 2) - (order[b.conviction ?? 'medium'] ?? 2);
                      }
                      return v * sortDir;
                    })
                    .map((h, i) => (
                      <HoldingRow
                        key={h.id}
                        holding={h}
                        weight={effectiveWeights[h.symbol] ?? 0}
                        index={i}
                        currency={currency}
                        onOpen={() => setDrawerHolding(h)}
                        onManage={() => setManageHolding(h)}
                      />
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Closed positions — retained history */}
      {closedHoldings.length > 0 && (
        <div style={{ padding: '0 24px 16px' }}>
          <ClosedPositions holdings={closedHoldings} currency={currency} />
        </div>
      )}

      {/* ── V4: Regime Vulnerability + Per-holding Agent Observations ───────── */}
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PortfolioVulnerabilityPanel result={vulnerability.data} loading={vulnerability.loading} holdingsCount={activeHoldings.length} />
        {holdingOutputs.length > 0 && (
          <div>
            <h4 style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted-foreground)' }}>
              Holdings Intelligence
            </h4>
            <AgentIntelligenceFeed
              outputs={holdingOutputs}
              loading={holdingsAgentOutputs.loading}
              title="Agent Observations for Holdings"
              showFilters={false}
              compact
              maxItems={8}
            />
          </div>
        )}
      </div>

      {/* Modals & drawers */}
      {showAdd && (
        <AddHoldingModal
          onClose={() => setShowAdd(false)}
          onAdd={(p) => addNewHolding(p).then(() => undefined)}
          onBuy={(p) => buyHolding(p)}
          currency={currency}
          availableCash={availableCash}
          nav={nav}
        />
      )}

      {manageHolding && (
        <TransactionActionModal
          holding={manageHolding}
          currency={currency}
          onClose={() => setManageHolding(null)}
          onAddTo={(p) => addToHolding(p)}
          onTrim={(p) => trimHolding(p)}
          onSell={(p) => sellHolding(p)}
          onClosePosition={(p) => closeHolding(p)}
        />
      )}

      {drawerHolding && (
        <HoldingDrawer
          holding={drawerHolding}
          benchmarkId={benchmarkId}
          onClose={() => setDrawerHolding(null)}
          onRemove={() => handleRemove(drawerHolding)}
        />
      )}
    </div>
  );
};
