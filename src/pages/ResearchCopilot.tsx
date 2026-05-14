import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, Sparkles, Play, ChevronRight } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useCopilotSession } from '../hooks/useCopilotSession';
import { useBatchQuotes } from '../hooks/useMarket';
import { useMacroSeries } from '../hooks/useMacro';
import { PageHeader } from '../components/quant/PageHeader';
import { Disclaimer } from '../components/quant/Disclaimer';
import { FreshnessBadge } from '../components/quant/FreshnessBadge';

const SUGGESTIONS = [
  'Summarise the current macro regime in one paragraph with confidence band.',
  'What does a steepening 2s10s usually imply for equity sector rotation?',
  'How would I think about volatility compression in the Nasdaq right now?',
  'Walk me through how to interpret a Gold–DXY correlation breakdown.',
];

const PULSE_SYMBOLS = ['SPY', 'QQQ', 'GLD', 'TLT', 'UUP', 'BTC/USD'];
const MACRO_HIGHLIGHTS = ['FEDFUNDS', 'DGS10', 'CPI'] as const;

export const ResearchCopilot: React.FC = () => {
  const location = useLocation();

  // Live snapshots to feed Copilot context.
  const pulse = useBatchQuotes(PULSE_SYMBOLS);
  const fedFunds = useMacroSeries('FEDFUNDS');
  const dgs10 = useMacroSeries('DGS10');
  const cpi = useMacroSeries('CPI');

  const buildSnapshot = useCallback(() => {
    const lines: string[] = [
      `Caller page: ${location.pathname}`,
    ];
    const ok = (pulse.data ?? []).filter((r) => r.ok && r.data);
    if (ok.length) {
      lines.push('Latest market pulse (twelve_data):');
      for (const r of ok) {
        if (!r.data) continue;
        lines.push(`  - ${r.symbol}: ${r.data.price.toFixed(2)} (${r.data.changePercent >= 0 ? '+' : ''}${r.data.changePercent.toFixed(2)}%)`);
      }
    }
    const macroRows: string[] = [];
    for (const [id, hook] of [
      ['FEDFUNDS', fedFunds],
      ['DGS10', dgs10],
      ['CPI', cpi],
    ] as const) {
      const pts = hook.data?.points ?? [];
      const last = pts[pts.length - 1];
      if (last) macroRows.push(`  - ${id}: ${last.value} on ${new Date(last.ts).toISOString().slice(0, 10)}`);
    }
    if (macroRows.length) {
      lines.push('Latest macro values (alpha_vantage):');
      lines.push(...macroRows);
    }
    lines.push('Use this snapshot as grounding evidence. Cite values explicitly. Probabilistic language only.');
    return lines.join('\n');
  }, [location.pathname, pulse.data, fedFunds.data, dgs10.data, cpi.data]);

  const contextResolver = useCallback(() => ({
    context: {
      instruments: pulse.data?.filter((r) => r.ok).map((r) => r.symbol) ?? [],
      timeframe: '1d',
    },
    snapshot: buildSnapshot(),
  }), [pulse.data, buildSnapshot]);

  const { messages, sending, error, send } = useCopilotSession([], contextResolver);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const submit = async (text: string) => {
    if (!text.trim() || sending) return;
    setInput('');
    await send(text);
  };

  const contextChips = useMemo(() => {
    const top3 = (pulse.data ?? []).filter((r) => r.ok && r.data).slice(0, 3);
    return top3.map((r) => r.symbol);
  }, [pulse.data]);

  return (
    <div style={{ padding: '0 24px 24px', maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
      <PageHeader
        title="Research Copilot"
        subtitle="Probabilistic, institutional research assistant grounded in current market pulse + macro snapshot. Does not recommend trades."
        actions={
          <FreshnessBadge status={pulse.status} fetchedAt={pulse.fetchedAt} compact />
        }
      />

      {/* Context strip */}
      <section style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Context:</span>
        {contextChips.length ? contextChips.map((sym) => (
          <span key={sym} style={{
            padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600,
            background: 'rgba(193,95,60,0.08)',
            color: 'var(--foreground)',
            border: '1px solid color-mix(in srgb, var(--primary) 22%, transparent)',
          }}>{sym}</span>
        )) : (
          <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>(loading pulse…)</span>
        )}
        {MACRO_HIGHLIGHTS.map((id) => (
          <span key={id} style={{
            padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600,
            background: 'var(--muted)',
            color: 'var(--muted-foreground)',
            border: '1px solid var(--border)',
          }}>{id}</span>
        ))}
      </section>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '6px 0', display: 'grid', gap: 12, alignContent: 'start' }}>
        {messages.length === 0 && (
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Sparkles size={14} color="var(--primary)" />
              <span className="ds-heading">Try a prompt</span>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {SUGGESTIONS.map((s) => (
                <div key={s} className="ds-surface" style={{
                  padding: 10, borderRadius: 10, border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <button
                    onClick={() => setInput(s)}
                    title="Populate input"
                    style={{
                      flex: 1, textAlign: 'left', padding: 0,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'var(--foreground)', fontSize: 13,
                    }}
                  >
                    {s}
                  </button>
                  <button
                    onClick={() => submit(s)}
                    title="Run now"
                    style={{
                      padding: '4px 8px', borderRadius: 6,
                      border: '1px solid var(--border)', background: 'var(--card)',
                      cursor: 'pointer', color: 'var(--foreground)',
                      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
                    }}
                  >
                    <Play size={10} /> Run
                  </button>
                  <button
                    onClick={() => setInput(s)}
                    title="Populate input"
                    style={{
                      padding: '4px 8px', borderRadius: 6,
                      border: '1px solid var(--border)', background: 'transparent',
                      cursor: 'pointer', color: 'var(--muted-foreground)',
                      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11,
                    }}
                  >
                    <ChevronRight size={10} /> Edit
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {messages.filter((m) => m.role !== 'system').map((m) => (
          <article key={m.id} style={{
            justifySelf: m.role === 'user' ? 'end' : 'start',
            maxWidth: '85%',
            padding: '10px 14px', borderRadius: 10,
            background: m.role === 'user' ? 'rgba(193, 95, 60, 0.08)' : 'var(--card)',
            border: '1px solid var(--border)',
          }}>
            <p className="ds-body" style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{m.content}</p>
          </article>
        ))}

        {sending && (
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)', padding: '4px 8px' }}>Thinking…</p>
        )}
        {error && (
          <p className="ds-caption" style={{ color: 'var(--primary)' }}>Error: {error.message}</p>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); submit(input); }}
        style={{
          marginTop: 12, display: 'flex', gap: 8,
          padding: 8, borderRadius: 12,
          background: 'var(--card)', border: '1px solid var(--border)',
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about regimes, vol, correlations, macro…"
          className="ds-body"
          style={{
            flex: 1, border: 'none', outline: 'none', padding: '8px 10px',
            background: 'transparent', color: 'var(--foreground)',
          }}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          style={{
            padding: '8px 14px', borderRadius: 8, border: 'none',
            background: 'var(--primary)', color: 'var(--primary-foreground)',
            cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
          }}
        >
          <Send size={13} /> Send
        </button>
      </form>

      <Disclaimer />
    </div>
  );
};
