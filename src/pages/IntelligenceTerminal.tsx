import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBatchQuotes, useHeadlines, useOHLCV } from '../hooks/useMarket';
import { useArtifacts } from '../hooks/useArtifacts';
import { useTimeline } from '../hooks/useTimeline';
import { useWorkspace } from '../components/WorkspaceContext';
import { useDrawer } from '../components/quant/DataDrawer';
import { PageHeader } from '../components/quant/PageHeader';
import { MarketTile } from '../components/quant/MarketTile';
import { IntelligenceFeed } from '../components/quant/IntelligenceFeed';
import { AgentIntelligenceFeed } from '../components/quant/AgentIntelligenceFeed';
import { ContextualReasoningCard } from '../components/quant/ContextualReasoningCard';
import { ResearchTimeline } from '../components/quant/ResearchTimeline';
import { ArtifactDetailDrawerBody } from '../components/quant/ArtifactDetailDrawerBody';
import { Disclaimer } from '../components/quant/Disclaimer';
import { FreshnessBadge } from '../components/quant/FreshnessBadge';
import { InstrumentDrawerBody } from '../components/quant/InstrumentDrawerBody';
import { HeadlineDrawerBody } from '../components/quant/HeadlineDrawerBody';
import { RegimeStatusChip, RiskLevelChip } from '../components/quant/SystemAnalyzingState';
import { RefreshCw, Plus, X, GripVertical } from 'lucide-react';
import { usePins } from '../hooks/usePins';
import { useAgentOutputs, useCompositeRegime, useRiskEnvironment } from '../hooks/useAgentIntelligence';
import { symbolSearch } from '../services/marketService';

// ─── Persistent watch list ────────────────────────────────────────────────────

const PULSE_STORAGE_KEY = 'deplyze_market_pulse_v1';
const PULSE_MAX = 24;
const DEFAULT_WATCH = [
  'SPY', 'QQQ', 'IWM',
  'TLT', 'UUP',
  'XAU/USD', 'WTI/USD',
  'EUR/USD', 'USD/JPY',
  'BTC/USD', 'ETH/USD',
];

function loadWatch(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(PULSE_STORAGE_KEY) ?? 'null');
    return Array.isArray(stored) && stored.length > 0 ? stored : DEFAULT_WATCH;
  } catch {
    return DEFAULT_WATCH;
  }
}

function saveWatch(list: string[]): void {
  localStorage.setItem(PULSE_STORAGE_KEY, JSON.stringify(list));
}

// ─── Add-symbol input ─────────────────────────────────────────────────────────

const AddSymbolInput: React.FC<{
  watchList: string[];
  onAdd: (sym: string) => void;
}> = ({ watchList, onAdd }) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<{ symbol: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (v: string) => {
    setValue(v);
    setError('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 1) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await symbolSearch(v.trim());
        // Deduplicate by symbol — symbol search can return the same ticker
        // from multiple exchanges (NYSE + NASDAQ), causing duplicate React keys.
        const seen = new Set<string>();
        const deduped = results.filter(r => {
          if (seen.has(r.symbol)) return false;
          seen.add(r.symbol);
          return true;
        });
        setSuggestions(deduped.slice(0, 6).map(r => ({ symbol: r.symbol, name: r.name ?? r.symbol })));
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 280);
  };

  const commit = (sym: string) => {
    const upper = sym.trim().toUpperCase();
    if (!upper) return;
    if (watchList.includes(upper)) { setError('Already in pulse'); return; }
    if (watchList.length >= PULSE_MAX) { setError(`Max ${PULSE_MAX} symbols`); return; }
    onAdd(upper);
    setValue('');
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit(value);
    if (e.key === 'Escape') { setValue(''); setSuggestions([]); }
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            value={value}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add symbol…"
            style={{
              padding: '5px 10px', fontSize: 11, borderRadius: 6, width: 130,
              border: `1px solid ${error ? '#ef4444' : 'var(--border)'}`,
              background: 'var(--card)', color: 'var(--foreground)', outline: 'none',
            }}
          />
          {error && (
            <span style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 2,
              fontSize: 9, color: '#ef4444', whiteSpace: 'nowrap',
            }}>
              {error}
            </span>
          )}
        </div>
        <button
          onClick={() => commit(value)}
          title="Add symbol"
          style={{
            width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--primary)', color: 'var(--primary-foreground)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          <Plus size={13} />
        </button>
      </div>

      {/* Suggestions dropdown */}
      {(suggestions.length > 0 || searching) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 200,
        }}>
          {searching && (
            <div style={{ padding: '8px 12px', fontSize: 10, color: 'var(--muted-foreground)' }}>
              Searching…
            </div>
          )}
          {suggestions.map(s => (
            <button
              key={s.symbol}
              onClick={() => commit(s.symbol)}
              style={{
                width: '100%', textAlign: 'left', padding: '7px 12px',
                border: 'none', background: 'transparent', cursor: 'pointer',
                display: 'flex', gap: 8, alignItems: 'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', minWidth: 60 }}>
                {s.symbol}
              </span>
              <span style={{
                fontSize: 10, color: 'var(--muted-foreground)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {s.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Draggable pulse tile wrapper ─────────────────────────────────────────────

const PulseTile: React.FC<{
  symbol: string;
  quote: import('../services/marketService').BatchQuoteRow | undefined;
  loading: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onOpen: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}> = ({ symbol, quote, loading, isDragging, isDragOver, onOpen, onRemove, onDragStart, onDragOver, onDrop, onDragEnd }) => {
  const ohlcv = useOHLCV(symbol, '1day', 60);
  const closes = (ohlcv.data?.bars ?? []).map(b => b.close);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        opacity: isDragging ? 0.4 : 1,
        outline: isDragOver ? '2px solid var(--primary)' : 'none',
        outlineOffset: 2,
        borderRadius: 10,
        transition: 'opacity 0.15s, outline 0.1s',
        cursor: 'grab',
      }}
    >
      {/* Drag handle — always visible, subtle */}
      <div style={{
        position: 'absolute', top: 6, left: 7, zIndex: 2,
        color: 'var(--muted-foreground)', opacity: hovered ? 0.6 : 0.25,
        pointerEvents: 'none', transition: 'opacity 0.15s',
      }}>
        <GripVertical size={11} />
      </div>

      {/* Remove button — visible on hover */}
      <button
        onClick={e => { e.stopPropagation(); onRemove(); }}
        title={`Remove ${symbol}`}
        style={{
          position: 'absolute', top: 5, right: 5, zIndex: 3,
          width: 16, height: 16, borderRadius: 4,
          border: 'none', background: 'rgba(0,0,0,0.35)',
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: hovered ? 1 : 0, transition: 'opacity 0.15s',
          padding: 0,
        }}
      >
        <X size={9} />
      </button>

      <MarketTile
        symbol={symbol}
        quote={quote?.ok ? quote.data : undefined}
        loading={loading}
        spark={closes}
        onClick={onOpen}
      />
    </div>
  );
};

export const IntelligenceTerminal: React.FC = () => {
  const { currentWorkspace, currentProject } = useWorkspace();
  const drawer = useDrawer();

  // ── Editable watch list ──────────────────────────────────────────────────
  const [watchList, setWatchList] = useState<string[]>(loadWatch);
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleAdd = useCallback((sym: string) => {
    setWatchList(prev => {
      const next = [...prev, sym];
      saveWatch(next);
      return next;
    });
  }, []);

  const handleRemove = useCallback((sym: string) => {
    setWatchList(prev => {
      const next = prev.filter(s => s !== sym);
      saveWatch(next);
      return next;
    });
  }, []);

  const handleDrop = useCallback((toIdx: number) => {
    setWatchList(prev => {
      if (dragSrcIdx === null || dragSrcIdx === toIdx) return prev;
      const next = [...prev];
      const [moved] = next.splice(dragSrcIdx, 1);
      next.splice(toIdx, 0, moved);
      saveWatch(next);
      return next;
    });
    setDragSrcIdx(null);
    setDragOverIdx(null);
  }, [dragSrcIdx]);

  const quotes = useBatchQuotes(watchList);
  const headlines = useHeadlines('markets macro central bank');
  const artifacts = useArtifacts(
    currentWorkspace?.id ?? null,
    currentProject?.id ?? null,
  );
  const timeline = useTimeline(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const { pinMap, pin, unpin } = usePins(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const pinnedIds = useMemo(() => new Set(pinMap.keys()), [pinMap]);
  const [activeTab, setActiveTab] = useState<'agents' | 'feed' | 'timeline'>('agents');
  const agentOutputs = useAgentOutputs({ placement: 'IntelligenceTerminal', limit: 40 });
  const reasoningOutputs = useAgentOutputs({ artifact_type: 'multi_system_reasoning', limit: 4 });
  const { regimeLabel, data: regimeData } = useCompositeRegime();
  const { riskLevel, data: riskData } = useRiskEnvironment();

  // Feed shows only agent-generated artifacts; user saves go to Research Library
  const agentArtifacts = useMemo(
    () => artifacts.items.filter(a => !a.source || a.source === 'agent'),
    [artifacts.items],
  );

  const handleOpenArtifact = useCallback((id: string) => {
    const artifact = agentArtifacts.find((a) => a.id === id);
    if (!artifact) return;
    drawer.open({
      title: artifact.title,
      subtitle: artifact.category,
      width: 560,
      body: <ArtifactDetailDrawerBody artifact={artifact} relatedArtifacts={agentArtifacts} onOpenArtifact={handleOpenArtifact} />,
    });
  }, [agentArtifacts, drawer]);

  return (
    <div style={{ padding: '0 24px 32px', maxWidth: 1280, margin: '0 auto' }}>
      <PageHeader
        title="Intelligence Terminal"
        subtitle="Proactive, statistically ranked market intelligence — regime, volatility, correlation, and macro signals refreshed continuously."
      />
      {/* Live regime + risk status */}
      {(regimeLabel || riskLevel) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, marginTop: -8 }}>
          <RegimeStatusChip regime={regimeLabel} confidence={regimeData?.confidence ?? null} />
          <RiskLevelChip riskLevel={riskLevel} severity={riskData?.severity} />
        </div>
      )}

      {/* Market pulse */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 className="ds-heading" style={{ margin: 0 }}>Market Pulse</h2>
            <span style={{ fontSize: 9, color: 'var(--muted-foreground)', fontWeight: 500 }}>
              {watchList.length}/{PULSE_MAX} · drag to reorder
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AddSymbolInput watchList={watchList} onAdd={handleAdd} />
            <FreshnessBadge status={quotes.status} fetchedAt={quotes.fetchedAt} />
            <button
              onClick={() => quotes.refresh()}
              title="Refresh quotes"
              style={{
                width: 26, height: 26, borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--muted-foreground)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={12} style={{ animation: quotes.isFetching ? 'spin 1s linear infinite' : undefined }} />
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {watchList.map((sym, idx) => {
            const row = quotes.data?.find(q => q.symbol === sym);
            return (
              <PulseTile
                key={sym}
                symbol={sym}
                quote={row}
                loading={quotes.loading}
                isDragging={dragSrcIdx === idx}
                isDragOver={dragOverIdx === idx && dragSrcIdx !== idx}
                onOpen={() => drawer.open({
                  title: sym,
                  subtitle: 'Instrument intelligence',
                  width: 560,
                  body: <InstrumentDrawerBody symbol={sym} />,
                })}
                onRemove={() => handleRemove(sym)}
                onDragStart={() => setDragSrcIdx(idx)}
                onDragOver={e => { e.preventDefault(); setDragOverIdx(idx); }}
                onDrop={() => handleDrop(idx)}
                onDragEnd={() => { setDragSrcIdx(null); setDragOverIdx(null); }}
              />
            );
          })}

          {/* Reset to defaults hint when list is empty */}
          {watchList.length === 0 && (
            <div style={{ gridColumn: '1/-1', padding: '16px 0', textAlign: 'center' }}>
              <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--muted-foreground)' }}>
                No symbols in your pulse. Add some above.
              </p>
              <button
                onClick={() => { setWatchList(DEFAULT_WATCH); saveWatch(DEFAULT_WATCH); }}
                style={{
                  fontSize: 11, padding: '5px 14px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--card)',
                  color: 'var(--foreground)', cursor: 'pointer',
                }}
              >
                Reset to defaults
              </button>
            </div>
          )}
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }`}</style>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24 }}>
        {/* Intelligence Feed / Research Timeline */}
        <section>
          {/* Tab bar */}
          <nav style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
            {([
              { id: 'agents', label: 'Live Intelligence' },
              { id: 'feed', label: 'Research Feed' },
              { id: 'timeline', label: 'Timeline' },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '7px 14px',
                  border: 'none',
                  borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: activeTab === tab.id ? 700 : 500,
                  color: activeTab === tab.id ? 'var(--primary)' : 'var(--muted-foreground)',
                  marginBottom: -1,
                  transition: 'color 0.12s, border-color 0.12s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {activeTab === 'agents' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Multi-system synthesis at top */}
              {reasoningOutputs.data.length > 0 && (
                <div>
                  <p style={{ margin: '0 0 6px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)' }}>
                    Cross-Signal Synthesis
                  </p>
                  {reasoningOutputs.data.map(o => (
                    <ContextualReasoningCard key={o.artifact_id} output={o} />
                  ))}
                </div>
              )}
              <AgentIntelligenceFeed
                outputs={agentOutputs.data}
                loading={agentOutputs.loading}
                analyzing={agentOutputs.loading}
                title="Live Intelligence"
                showFilters
                onRefresh={agentOutputs.refetch}
              />
            </div>
          ) : activeTab === 'feed' ? (
            <IntelligenceFeed
              items={agentArtifacts}
              loading={artifacts.loading}
              emptyTitle="No intelligence artifacts yet"
              emptyHint="Agents run on scheduled cadences. The Research Copilot is available for on-demand analysis."
              onOpen={handleOpenArtifact}
            />
          ) : (
            <ResearchTimeline
              events={timeline.events}
              loading={timeline.loading}
              onOpenArtifact={handleOpenArtifact}
              pinnedIds={pinnedIds}
              onPin={pin}
              onUnpin={unpin}
            />
          )}
        </section>

        {/* Headlines */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 className="ds-heading" style={{ margin: 0 }}>Live Headlines</h2>
            <FreshnessBadge status={headlines.status} fetchedAt={headlines.fetchedAt} compact />
          </div>
          {headlines.loading ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="ds-surface" style={{ padding: '12px 14px', borderRadius: 10, opacity: 0.5, height: 72 }} />
              ))}
            </div>
          ) : !headlines.data || headlines.data.length === 0 ? (
            <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>No headlines available.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
              {headlines.data.slice(0, 12).map((h, i) => {
                const publishedAt = h.date ? Date.parse(h.date) : undefined;
                const ago = publishedAt ? (() => {
                  const s = Math.floor((Date.now() - publishedAt) / 1000);
                  if (s < 60) return `${s}s ago`;
                  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
                  return `${Math.floor(s / 3600)}h ago`;
                })() : h.date ?? null;
                return (
                <li key={`${i}-${h.link}`}>
                  <button
                    onClick={() => drawer.open({
                      title: h.title,
                      subtitle: h.source,
                      body: <HeadlineDrawerBody item={{
                        title: h.title,
                        summary: h.snippet,
                        url: h.link,
                        source: h.source,
                        publishedAt,
                      }} />,
                    })}
                    style={{
                      width: '100%', textAlign: 'left',
                      padding: '11px 14px', borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'var(--card)', cursor: 'pointer', color: 'inherit',
                      display: 'grid', gap: 5,
                      transition: 'border-color 0.12s, background 0.12s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--primary) 40%, transparent)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 3%, var(--card))'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--card)'; }}
                  >
                    {/* Source + time row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                        padding: '1px 6px', borderRadius: 999,
                        background: 'rgba(193,95,60,0.08)',
                        color: 'var(--primary)',
                        border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
                        flexShrink: 0,
                      }}>{h.source}</span>
                      {ago && (
                        <span className="ds-caption" style={{ color: 'var(--muted-foreground)', marginLeft: 'auto', flexShrink: 0 }}>
                          {ago}
                        </span>
                      )}
                    </div>
                    {/* Headline */}
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.4, letterSpacing: '-0.01em', color: 'var(--foreground)' }}>
                      {h.title}
                    </p>
                    {/* Snippet */}
                    {h.snippet && (
                      <p style={{
                        margin: 0, fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.5,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {h.snippet}
                      </p>
                    )}
                  </button>
                </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <Disclaimer />
    </div>
  );
};
