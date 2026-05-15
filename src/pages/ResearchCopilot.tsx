import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Sparkles, Play, ChevronRight, Bookmark } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useCopilotSession } from '../hooks/useCopilotSession';
import { useBatchQuotes } from '../hooks/useMarket';
import { useMacroSeries } from '../hooks/useMacro';
import { useArtifacts, useBriefings } from '../hooks/useArtifacts';
import { useInsights } from '../hooks/useInsights';
import { useWorkspace } from '../components/WorkspaceContext';
import { useAuth } from '../components/AuthProvider';
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
  const { currentWorkspace, currentProject } = useWorkspace();
  const { user } = useAuth();

  // Live snapshots to feed Copilot context.
  const pulse = useBatchQuotes(PULSE_SYMBOLS);
  const fedFunds = useMacroSeries('FEDFUNDS');
  const dgs10 = useMacroSeries('DGS10');
  const cpi = useMacroSeries('CPI');

  // Workspace research context.
  const artifacts = useArtifacts(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const briefings = useBriefings(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const { save: saveInsight } = useInsights(currentWorkspace?.id ?? null, currentProject?.id ?? null);

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
    // Workspace research context
    const recentArtifacts = artifacts.items.slice(0, 5);
    if (recentArtifacts.length) {
      lines.push('Recent workspace intelligence artifacts:');
      for (const a of recentArtifacts) {
        lines.push(`  - [${a.category}] ${a.title} (symbols: ${a.symbols?.join(', ') ?? 'none'}, confidence: ${(a.confidence * 100).toFixed(0)}%)`);
      }
    }
    const recentBriefings = briefings.items.slice(0, 3);
    if (recentBriefings.length) {
      lines.push('Recent workspace briefings:');
      for (const b of recentBriefings) {
        lines.push(`  - [${b.kind}] ${b.title}`);
      }
    }
    lines.push('Use this snapshot as grounding evidence. Cite values explicitly. Probabilistic language only.');
    return lines.join('\n');
  }, [location.pathname, pulse.data, fedFunds.data, dgs10.data, cpi.data, artifacts.items, briefings.items]);

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

  const handleSaveInsight = useCallback(async (content: string) => {
    if (!currentWorkspace?.id || !currentProject?.id || !user) {
      toast.error('No workspace selected');
      return;
    }
    try {
      await saveInsight({
        workspaceId: currentWorkspace.id,
        projectId: currentProject.id,
        content,
        savedBy: user.uid,
        symbols: contextChips,
      });
      toast.success('Insight saved to workspace');
    } catch {
      toast.error('Failed to save insight');
    }
  }, [currentWorkspace, currentProject, user, saveInsight, contextChips]);

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
        {artifacts.items.length > 0 && (
          <span style={{
            padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600,
            background: 'rgba(78,96,64,0.08)',
            color: 'var(--muted-foreground)',
            border: '1px solid var(--border)',
          }}>{artifacts.items.length} artifact{artifacts.items.length !== 1 ? 's' : ''}</span>
        )}
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
            {m.role === 'assistant' ? (
              <div className="copilot-md">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            ) : (
              <p className="ds-body" style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{m.content}</p>
            )}
            {m.role === 'assistant' && (
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleSaveInsight(m.content)}
                  title="Save as insight"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--muted-foreground)', padding: 4, display: 'flex',
                    alignItems: 'center', gap: 4, fontSize: 11,
                    borderRadius: 4,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--muted)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <Bookmark size={12} />
                  Save
                </button>
              </div>
            )}
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
      <style>{`
        .copilot-md { font-size: 13px; line-height: 1.6; color: var(--foreground); }
        .copilot-md p { margin: 0 0 8px; }
        .copilot-md p:last-child { margin-bottom: 0; }
        .copilot-md h1, .copilot-md h2, .copilot-md h3 { font-weight: 700; letter-spacing: -0.01em; margin: 12px 0 6px; }
        .copilot-md h2 { font-size: 14px; }
        .copilot-md h3 { font-size: 13px; color: var(--muted-foreground); }
        .copilot-md ul, .copilot-md ol { margin: 6px 0 8px 18px; }
        .copilot-md li { margin: 3px 0; }
        .copilot-md strong { font-weight: 700; color: var(--foreground); }
        .copilot-md em { font-style: italic; color: var(--muted-foreground); }
        .copilot-md code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; padding: 1px 5px; background: var(--muted); border-radius: 4px; }
        .copilot-md pre { background: var(--muted); border-radius: 6px; padding: 10px 12px; overflow-x: auto; margin: 8px 0; }
        .copilot-md pre code { background: none; padding: 0; }
        .copilot-md blockquote { border-left: 2px solid var(--primary); padding-left: 10px; color: var(--muted-foreground); margin: 8px 0; font-style: italic; }
        .copilot-md table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12px; }
        .copilot-md th, .copilot-md td { padding: 5px 10px; border: 1px solid var(--border); text-align: left; }
        .copilot-md th { font-weight: 700; background: var(--muted); }
        .copilot-md hr { border: none; border-top: 1px solid var(--border); margin: 12px 0; }
      `}</style>
    </div>
  );
};
